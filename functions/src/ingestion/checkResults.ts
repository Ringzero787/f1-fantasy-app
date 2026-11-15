/**
 * Automated OpenF1 Race Result Ingestion
 *
 * checkOpenF1Results: Scheduled function (every 30 min) that fetches results
 * from OpenF1 API for completed races and stores them in pendingResults for
 * admin review.
 *
 * approveRaceResults: Callable function for admins to approve pending results,
 * which writes them to races/{raceId} and triggers the existing onRaceCompleted
 * scoring pipeline.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { AUTO_APPROVE } from './config';
import {
  fetchSessions,
  getGridPositions,
  findFastestLap,
  convertToRaceResults,
  convertToSprintResults,
  convertToQualifyingResults,
  isUnmappedDriverWarning,
  fetchDrivers,
  extrasFor,
  type OpenF1Session,
} from './openf1Client';
import { loadRoster, type KnownDriver } from './resolveCars';
import { MATCH_WINDOW_MS, ingestBlocker, meetingForRace, seasonOfRace, sessionsBySeason, toMs, type MatchedMeeting } from './season';
import { handleQualifyingScoring, handleSprintScoring } from '../scoring/calculatePoints';
import { openf1Secrets } from './openf1Auth';

const db = admin.firestore();

/**
 * F-152: a race held on an unmapped car is fetched again this often, so it scores by itself once
 * the cause is gone — a mapping deployed, or the provider completing its entry list — with no
 * re-queue op. Before, a held race was skipped on every tick until someone re-queued it by hand.
 */
export const HELD_RETRY_MS = 30 * 60 * 1000;
/** The scheduler ticks every 10 minutes and a fetch takes a few seconds: a minute's slack keeps it on the 30th, not the 40th. */
const RETRY_SLACK_MS = 60 * 1000;
/** …for this long after the race; past it a held race waits for a hand re-queue (requeueBlockedResults.js). */
export const HELD_RETRY_FOR_MS = 14 * 24 * 3600 * 1000;

/**
 * Pure: what the results check does with a due race given its pendingResults document. 'fetch' for
 * no document or a rejected one (as before); 'retry' for one held on a blockedReason whose last
 * fetch is HELD_RETRY_MS old, inside HELD_RETRY_FOR_MS of the race; otherwise skip.
 */
export function heldAction(
  pending: { status?: unknown; blockedReason?: unknown; fetchedAt?: unknown; retriedAt?: unknown } | undefined,
  raceMs: number,
  nowMs: number,
): 'fetch' | 'retry' | 'skip' {
  if (!pending) return 'fetch';
  if (pending.status === 'approved') return 'skip';
  if (pending.status !== 'pending') return 'fetch';
  if (!pending.blockedReason) return 'skip';
  if (nowMs - raceMs > HELD_RETRY_FOR_MS) return 'skip';
  // the later of the last stored fetch and the last attempt: a retry that ends early (no results
  // yet, a feed error) stores nothing, and must not turn into a fetch on every tick
  const lastMs = Math.max(...[toMs(pending.fetchedAt), toMs(pending.retriedAt)].filter(Number.isFinite));
  return !Number.isFinite(lastMs) || nowMs - lastMs >= HELD_RETRY_MS - RETRY_SLACK_MS ? 'retry' : 'skip';
}

/** A race the results check may fetch: its document's season and race time pick the OpenF1 meeting (F-149). */
interface Candidate {
  raceId: string;
  round: number;
  raceName: string;
  hasSprint: boolean;
  season: number;
  raceMs: number;
}

/**
 * The races the results check fetches: not completed (the query), not cancelled, race time passed,
 * and a season ingestion can read (F-149; a season it cannot is logged by candidateOf).
 */
export function dueCandidates(docs: admin.firestore.QueryDocumentSnapshot[], nowMs: number): Candidate[] {
  const out: Candidate[] = [];
  for (const doc of docs) {
    const data = doc.data();
    if (data.status === 'cancelled' || data.status === 'completed') continue;
    const raceMs = toMs(data.schedule?.race);
    if (!Number.isFinite(raceMs) || raceMs > nowMs) continue; // only races in the past
    const candidate = candidateOf(doc, 'Ingestion');
    if (candidate) out.push(candidate);
  }
  return out;
}

/** The candidate for a race document, or null (logged) when its season cannot be ingested from the feed. */
export function candidateOf(doc: admin.firestore.QueryDocumentSnapshot, tag: string): Candidate | null {
  const data = doc.data();
  const season = seasonOfRace(doc.id, data);
  const blocker = ingestBlocker(doc.id, season);
  if (blocker) {
    console.error(`[${tag}] NOT INGESTING ${blocker}`);
    return null;
  }
  return {
    raceId: doc.id,
    round: data.round,
    raceName: data.name || doc.id,
    hasSprint: data.hasSprint || false,
    season: season!,
    raceMs: toMs(data.schedule?.race),
  };
}

/**
 * Scheduled: Check OpenF1 for new race results every 30 minutes.
 */
export const checkOpenF1Results = onSchedule(
  { schedule: 'every 10 minutes', timeoutSeconds: 300, secrets: openf1Secrets },
  async () => {
    console.log('[Ingestion] Checking OpenF1 for results...');

    try {
      // 1. Get all uncompleted races whose race time is in the past
      const now = admin.firestore.Timestamp.now();
      const racesSnapshot = await db
        .collection('races')
        .where('status', '!=', 'completed')
        .get();

      const candidateRaces = dueCandidates(racesSnapshot.docs, now.toMillis());
      const sessionsFor = sessionsBySeason(fetchSessions);

      if (candidateRaces.length === 0) {
        console.log('[Ingestion] No candidate races found.');
        return;
      }

      console.log(`[Ingestion] Found ${candidateRaces.length} candidate race(s)`);

      // F-152: the roster unknown car numbers are resolved against, read once per tick
      let roster: KnownDriver[] | undefined;
      const rosterNow = async () => (roster ??= await loadRoster(db));

      // 2. Check which already have approved pending results
      for (const race of candidateRaces) {
        const pendingDoc = await db.collection('pendingResults').doc(race.raceId).get();
        const action = heldAction(pendingDoc.exists ? pendingDoc.data() : undefined, race.raceMs, now.toMillis());
        if (action === 'skip') {
          console.log(`[Ingestion] ${race.raceId} already ${pendingDoc.data()?.status}, skipping`);
          continue;
        }
        if (action === 'retry') {
          console.log(`[Ingestion] ${race.raceId} is held (${pendingDoc.data()?.blockedReason}); fetching again`);
          await pendingDoc.ref.update({ retriedAt: admin.firestore.FieldValue.serverTimestamp() });
        }

        await processRace(race, sessionsFor, await rosterNow());
      }

      // 3. Correction pass — re-check recently-completed races so stewards'
      // penalties applied AFTER the short settle window still flow through.
      // Re-running processRace re-fetches OpenF1 and re-approves; the write to
      // races/{id} triggers onRaceCompleted, which is correction-aware (delta
      // re-grade of picks + lineups + standings + bets). An unchanged re-fetch
      // is a no-op via onRaceCompleted's results signature, so this is cheap and
      // safe. Bounded to a window so we stop re-fetching once results are final.
      const CORRECTION_WINDOW_HOURS = 6;
      const completedSnap = await db.collection('races').where('status', '==', 'completed').get();
      for (const doc of completedSnap.docs) {
        const raceMs = toMs(doc.data().schedule?.race);
        if (!Number.isFinite(raceMs)) continue;
        const ageMs = now.toMillis() - raceMs;
        if (ageMs < 0 || ageMs > CORRECTION_WINDOW_HOURS * 3600 * 1000) continue; // only recently completed
        const candidate = candidateOf(doc, 'Ingestion');
        if (!candidate) continue;
        console.log(`[Ingestion] Correction re-check ${doc.id} (completed ${(ageMs / 3600000).toFixed(1)}h ago)`);
        await processRace(candidate, sessionsFor, await rosterNow());
      }
    } catch (error) {
      console.error('[Ingestion] Fatal error:', error);
    }
  },
);

async function processRace(race: Candidate, sessionsFor: (season: number) => Promise<OpenF1Session[]>, roster: KnownDriver[]) {
  console.log(`[Ingestion] Processing ${race.raceName} (${race.season} round ${race.round})...`);
  const warnings: string[] = [];

  try {
    // F-149: the meeting is the race document's season's meeting whose Race starts within three days
    // of the document's race time — never a round number looked up in a fixed year
    const meeting = meetingForRace(await sessionsFor(race.season), race.season, race.raceMs);
    if (!meeting) {
      console.log(`[Ingestion] No ${race.season} OpenF1 meeting with a Race within 3 days of ${race.raceId}`);
      return;
    }
    const meetingSessions = meeting.sessions;
    const raceSession = meeting.race;

    // Check if session has ended (date_end in the past)
    if (raceSession.date_end && new Date(raceSession.date_end) > new Date()) {
      console.log(`[Ingestion] Race session still in progress, skipping`);
      return;
    }

    // F-152: cars the table does not know, resolved by name from the race's entry list, so the grid
    // and fastest lap (rows that carry only a number) credit them too. The race converter resolves
    // the same list again and reports it; the warnings here would only repeat that.
    // A failed fetch throws (caught below), so the race is tried again rather than scored without
    // the grid and fastest lap of a car resolved by name.
    const raceExtras = extrasFor(await fetchDrivers(raceSession.session_key), roster, []);

    // Fetch grid positions — actual starting grid for the race session
    // (includes penalties/pit-lane starts), with qualifying as fallback
    const gridPositions = await getGridPositions(meetingSessions, raceSession.session_key, raceExtras);

    // Fetch fastest lap
    let fastestLapDriverId: string | null = null;
    try {
      fastestLapDriverId = await findFastestLap(raceSession.session_key, raceExtras);
    } catch (e) {
      warnings.push('Failed to fetch fastest lap data');
      console.warn('[Ingestion] Fastest lap fetch failed:', e);
    }

    // Convert race results
    const raceData = await convertToRaceResults(
      raceSession.session_key,
      gridPositions,
      fastestLapDriverId,
      roster,
    );

    if (raceData.results.length === 0) {
      console.log(`[Ingestion] No race results for ${race.raceId} — likely not yet available`);
      return;
    }

    warnings.push(...raceData.warnings);

    // Fetch sprint results if applicable
    let sprintData: { results: Array<{ position: number; driverId: string; status: 'finished' | 'dnf' | 'dsq' | 'dns' | 'nc' }>; warnings: string[] } | null = null;
    // a sprint weekend is one the document flags or one OpenF1 lists a Sprint for
    const hasSprint = race.hasSprint || meetingSessions.some(s => s.session_name === 'Sprint');

    if (hasSprint) {
      const sprintSession = meetingSessions.find(s => s.session_name === 'Sprint');
      if (sprintSession) {
        sprintData = await convertToSprintResults(sprintSession.session_key, roster);
        warnings.push(...sprintData.warnings);
      } else {
        warnings.push('Sprint expected but no Sprint session found');
      }
    }

    // Fetch qualifying results
    let qualifyingData: { results: Array<{ position: number; driverId: string; constructorId: string }>; warnings: string[] } | null = null;
    const qualiSession = meetingSessions.find(s => s.session_name === 'Qualifying');
    if (qualiSession) {
      qualifyingData = await convertToQualifyingResults(qualiSession.session_key, roster);
      warnings.push(...qualifyingData.warnings);
    } else {
      warnings.push('No qualifying session found');
    }

    // An unmapped driver number means the converters dropped a car from every
    // session it appeared in, so the stored grid is silently short and any
    // constructor aggregate built from it under-counts. Never auto-approve that
    // — park it for an admin instead. (Zandvoort 2026 auto-approved with
    // Tsunoda missing and Racing Bulls scored 23 instead of 47.)
    const unmappedDrivers = warnings.filter(isUnmappedDriverWarning);

    // Build pending result document
    const pendingResult: Record<string, unknown> = {
      raceId: race.raceId,
      round: race.round,
      raceName: race.raceName,
      status: 'pending',
      warnings,
      // Surfaced in the admin panel so a blocked race is visible rather than
      // just quietly un-approved.
      ...(unmappedDrivers.length > 0
        ? { blockedReason: `Unmapped driver number(s) — grid is incomplete: ${unmappedDrivers.join('; ')}` }
        : {}),
      results: {
        raceResults: raceData.results,
        ...(sprintData && sprintData.results.length > 0
          ? { sprintResults: sprintData.results }
          : {}),
        ...(qualifyingData && qualifyingData.results.length > 0
          ? { qualifyingResults: qualifyingData.results }
          : {}),
        ...(fastestLapDriverId ? { fastestLap: fastestLapDriverId } : {}),
      },
      totalLaps: raceData.totalLaps,
      rawData: {
        raceSessionKey: raceSession.session_key,
        ...(hasSprint ? {
          sprintSessionKey: meetingSessions.find(s => s.session_name === 'Sprint')?.session_key ?? null,
        } : {}),
        qualifyingSessionKey: meetingSessions.find(s => s.session_name === 'Qualifying')?.session_key ?? null,
      },
      fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('pendingResults').doc(race.raceId).set(pendingResult);
    console.log(`[Ingestion] Stored pending results for ${race.raceId} (${raceData.results.length} drivers, ${warnings.length} warnings)`);

    // Settle window: brief pause after session end so OpenF1's classification
    // stabilizes before first approval. This is no longer the penalty safety
    // net — the correction pass re-fetches completed races for 6h and
    // onRaceCompleted delta-re-grades, so late stewards' penalties flow
    // through regardless. (Was 1h back when approval was final.)
    const SETTLE_MINUTES = 15;
    const sessionEndedMs = raceSession.date_end ? new Date(raceSession.date_end).getTime() : 0;
    const settled = sessionEndedMs > 0 && (Date.now() - sessionEndedMs) >= SETTLE_MINUTES * 60 * 1000;

    // Auto-approve if configured — but only once settled and we have enough results
    const MIN_RESULTS_FOR_AUTO = 15;
    if (AUTO_APPROVE && unmappedDrivers.length > 0) {
      // Leave status 'pending' with the blockedReason: the race sits in the admin panel with its
      // warnings, and the scheduler fetches it again every HELD_RETRY_MS (F-152) until the cars
      // resolve. Deliberately louder than publishing an incomplete grid, which is permanent and
      // invisible; this is temporary and visible.
      console.error(
        `[Ingestion] BLOCKED auto-approval of ${race.raceId} — ${unmappedDrivers.length} unmapped driver number(s): ${unmappedDrivers.join('; ')}. ` +
        `Held as pending and fetched again every ${HELD_RETRY_MS / 60000} minutes; it scores once every car resolves (add the number to DRIVER_NUMBER_TO_ID if the entry list cannot name him).`
      );
    } else if (AUTO_APPROVE && settled && raceData.results.length >= MIN_RESULTS_FOR_AUTO) {
      console.log(`[Ingestion] Auto-approving ${race.raceId} (settled ${SETTLE_MINUTES}m+ after race)...`);
      await doApprove(race.raceId, 'auto');
    } else if (AUTO_APPROVE) {
      const reason = !settled
        ? `within ${SETTLE_MINUTES}m settle window (awaiting final classification)`
        : `only ${raceData.results.length} results (need ${MIN_RESULTS_FOR_AUTO}+)`;
      console.log(`[Ingestion] Not auto-approving ${race.raceId} — ${reason}. Will retry next cycle.`);
      // Set status to 'rejected' so it re-fetches next cycle (picks up penalties).
      await db.collection('pendingResults').doc(race.raceId).update({ status: 'rejected' });
    }
  } catch (error) {
    console.error(`[Ingestion] Error processing ${race.raceId}:`, error);
  }
}

/**
 * Callable: Admin approves pending race results.
 * Writes to races/{raceId} and triggers onRaceCompleted.
 */
export const approveRaceResults = onCall(
  { enforceAppCheck: false },
  async (request) => {
    // Auth check
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }

    // Admin check — only trust custom claims, not Firestore fields (users can write their own doc)
    if (!request.auth.token.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { raceId } = request.data as { raceId: string };
    if (!raceId) {
      throw new HttpsError('invalid-argument', 'raceId is required');
    }

    return doApprove(raceId, request.auth.uid);
  },
);

/**
 * Callable: Admin rejects pending race results.
 * Sets status to 'rejected' so the scheduler will re-fetch next cycle.
 */
export const rejectRaceResults = onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }

    // Admin check — only trust custom claims
    if (!request.auth.token.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { raceId } = request.data as { raceId: string };
    if (!raceId) {
      throw new HttpsError('invalid-argument', 'raceId is required');
    }

    const pendingRef = db.collection('pendingResults').doc(raceId);
    const pendingDoc = await pendingRef.get();

    if (!pendingDoc.exists) {
      throw new HttpsError('not-found', 'No pending results for this race');
    }

    await pendingRef.update({
      status: 'rejected',
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectedBy: request.auth.uid,
    });

    return { success: true };
  },
);

/**
 * Scheduled: Check for completed qualifying sessions and score immediately.
 * Runs every 30 minutes alongside race result checks.
 */
export const checkQualifyingResults = onSchedule(
  { schedule: 'every 10 minutes', timeoutSeconds: 120, secrets: openf1Secrets },
  async () => {
    console.log('[QualiIngestion] Checking for completed qualifying...');

    try {
      const now = new Date();

      let roster: KnownDriver[] | undefined; // F-152: read once per tick, only when a session has ended
      for (const { raceDoc, raceId, raceData, round, meeting } of await openRaceMeetings('QualiIngestion')) {
        const qualiSession = meeting.sessions.find(s => s.session_name === 'Qualifying');
        if (!qualiSession) continue;

        // Check if qualifying has ended
        if (!qualiSession.date_end || new Date(qualiSession.date_end) > now) continue;

        // Check if qualifying already scored
        if (raceData.qualifyingScored === true) {
          continue;
        }

        // Fetch and convert qualifying results (unknown cars resolved by name, F-152)
        const qualiData = await convertToQualifyingResults(qualiSession.session_key, roster ??= await loadRoster(db));
        if (qualiData.results.length === 0) {
          console.log(`[QualiIngestion] No qualifying results yet for round ${round}`);
          continue;
        }

        if (qualiData.warnings.length > 0) {
          console.log(`[QualiIngestion] Warnings for round ${round}:`, qualiData.warnings);
        }

        // Unmapped driver → the grid is short a car and the constructor
        // qualifying aggregate would under-count. Skip standalone scoring and
        // leave qualifyingScored false; onRaceCompleted folds qualifying in at
        // race time (the `scoreQualifying` path), and that write is itself
        // gated on the same check. Nothing is lost by waiting.
        const qualiUnmapped = qualiData.warnings.filter(isUnmappedDriverWarning);
        if (qualiUnmapped.length > 0) {
          console.error(
            `[QualiIngestion] SKIPPING ${raceId} — unmapped driver number(s): ${qualiUnmapped.join('; ')}. ` +
            'Qualifying will be scored at race time once the mapping exists.'
          );
          continue;
        }

        // Write qualifying results to race doc
        await raceDoc.ref.update({
          'results.qualifyingResults': qualiData.results,
          qualifyingScored: true,
        });

        // Score qualifying directly (don't rely on Firestore trigger)
        const updatedRaceDoc = await raceDoc.ref.get();
        await handleQualifyingScoring(raceId, updatedRaceDoc.data()!);

        console.log(`[QualiIngestion] Scored qualifying for ${raceId} (${qualiData.results.length} drivers)`);
      }
    } catch (error) {
      console.error('[QualiIngestion] Error:', error);
    }
  },
);

/**
 * Scheduled: Check for completed sprint sessions and score independently.
 * Runs every 30 minutes on sprint weekends (Saturday).
 */
export const checkSprintResults = onSchedule(
  { schedule: 'every 10 minutes', timeoutSeconds: 120, secrets: openf1Secrets },
  async () => {
    console.log('[SprintIngestion] Checking for completed sprints...');

    try {
      const now = new Date();

      let roster: KnownDriver[] | undefined; // F-152: read once per tick, only when a session has ended
      for (const { raceDoc, raceId, raceData, round, meeting } of await openRaceMeetings('SprintIngestion')) {
        // a sprint weekend is one OpenF1 lists a Sprint session for
        const sprintSession = meeting.sessions.find(s => s.session_name === 'Sprint');
        if (!sprintSession) continue;

        // Check if sprint has ended
        if (!sprintSession.date_end || new Date(sprintSession.date_end) > now) continue;

        // Check if sprint already scored
        if (raceData.sprintScored === true) continue;

        // Fetch and convert sprint results (unknown cars resolved by name, F-152)
        const sprintData = await convertToSprintResults(sprintSession.session_key, roster ??= await loadRoster(db));
        if (sprintData.results.length === 0) {
          console.log(`[SprintIngestion] No sprint results yet for round ${round}`);
          continue;
        }

        if (sprintData.warnings.length > 0) {
          console.log(`[SprintIngestion] Warnings for round ${round}:`, sprintData.warnings);
        }

        // Same guard as qualifying: never bank a sprint that is missing a car.
        // Leaving sprintScored false makes onRaceCompleted fold the sprint in at
        // race time instead (the `sprintAlreadyScored` path).
        const sprintUnmapped = sprintData.warnings.filter(isUnmappedDriverWarning);
        if (sprintUnmapped.length > 0) {
          console.error(
            `[SprintIngestion] SKIPPING ${raceId} — unmapped driver number(s): ${sprintUnmapped.join('; ')}. ` +
            'Sprint will be scored at race time once the mapping exists.'
          );
          continue;
        }

        // Write sprint results to race doc and mark as scored
        await raceDoc.ref.update({
          'results.sprintResults': sprintData.results,
          sprintScored: true,
        });

        // Score sprint directly
        await handleSprintScoring(raceId, sprintData.results, { seasonId: raceData.seasonId, round: raceData.round });

        console.log(`[SprintIngestion] Scored sprint for ${raceId} (${sprintData.results.length} drivers)`);
      }
    } catch (error) {
      console.error('[SprintIngestion] Error:', error);
    }
  },
);

/**
 * F-149: the races the qualifying and sprint checks look at — not completed, not cancelled, race
 * within three days or already past — each with its season's OpenF1 meeting. A race further out
 * has no finished session yet, so it is not fetched and its season is not judged.
 */
export async function openRaceMeetings(
  tag: string,
  store: admin.firestore.Firestore = db,
  fetch: (year: number) => Promise<OpenF1Session[]> = fetchSessions,
  nowMs: number = Date.now(),
): Promise<Array<{
  raceDoc: admin.firestore.QueryDocumentSnapshot;
  raceId: string;
  raceData: admin.firestore.DocumentData;
  round: number;
  meeting: MatchedMeeting;
}>> {
  const snap = await store.collection('races').where('status', '!=', 'completed').get();
  const sessionsFor = sessionsBySeason(fetch);
  const out = [];
  for (const raceDoc of snap.docs) {
    const raceData = raceDoc.data();
    if (raceData.status === 'cancelled') continue;
    const raceMs = toMs(raceData.schedule?.race);
    if (!Number.isFinite(raceMs) || raceMs - nowMs > MATCH_WINDOW_MS) continue;
    const candidate = candidateOf(raceDoc, tag);
    if (!candidate) continue;
    const meeting = meetingForRace(await sessionsFor(candidate.season), candidate.season, raceMs);
    if (!meeting) {
      console.warn(`[${tag}] ${raceDoc.id}: no ${candidate.season} OpenF1 meeting with a Race within 3 days of its race time`);
      continue;
    }
    out.push({ raceDoc, raceId: raceDoc.id, raceData, round: candidate.round, meeting });
  }
  return out;
}

async function doApprove(raceId: string, approvedBy: string) {
  const pendingRef = db.collection('pendingResults').doc(raceId);
  const pendingDoc = await pendingRef.get();

  if (!pendingDoc.exists) {
    throw new HttpsError('not-found', 'No pending results for this race');
  }

  const pending = pendingDoc.data()!;

  if (pending.status === 'approved') {
    throw new HttpsError('already-exists', 'Results already approved');
  }

  const raceRef = db.collection('races').doc(raceId);

  // Write results to races/{raceId} — this triggers onRaceCompleted
  const updateData: Record<string, unknown> = {
    'results.raceResults': pending.results.raceResults,
    status: 'completed',
    totalLaps: pending.totalLaps || 0,
  };

  if (pending.results.sprintResults) {
    updateData['results.sprintResults'] = pending.results.sprintResults;
  }

  if (pending.results.qualifyingResults) {
    updateData['results.qualifyingResults'] = pending.results.qualifyingResults;
  }

  if (pending.results.fastestLap) {
    updateData['results.fastestLap'] = pending.results.fastestLap;
  }

  await raceRef.update(updateData);

  // Mark pending as approved
  await pendingRef.update({
    status: 'approved',
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    approvedBy,
  });

  console.log(`[Ingestion] Approved results for ${raceId} by ${approvedBy}`);
  return { success: true, raceId };
}
