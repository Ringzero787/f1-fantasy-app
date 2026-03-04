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
import {
  SEASON_YEAR,
  AUTO_APPROVE,
  SPRINT_ROUNDS,
} from './config';
import {
  fetchSessions,
  getGridPositions,
  findFastestLap,
  convertToRaceResults,
  convertToSprintResults,
  deriveRoundNumbers,
} from './openf1Client';

const db = admin.firestore();

/**
 * Scheduled: Check OpenF1 for new race results every 30 minutes.
 */
export const checkOpenF1Results = onSchedule(
  { schedule: 'every 30 minutes', timeoutSeconds: 300 },
  async () => {
    console.log('[Ingestion] Checking OpenF1 for results...');

    try {
      // 1. Get all uncompleted races whose race time is in the past
      const now = admin.firestore.Timestamp.now();
      const racesSnapshot = await db
        .collection('races')
        .where('status', '!=', 'completed')
        .get();

      const candidateRaces: Array<{ raceId: string; round: number; raceName: string; hasSprint: boolean }> = [];

      for (const doc of racesSnapshot.docs) {
        const data = doc.data();
        const raceTime = data.schedule?.race;
        if (!raceTime) continue;

        // Only consider races in the past
        const raceTimestamp = raceTime instanceof admin.firestore.Timestamp
          ? raceTime
          : admin.firestore.Timestamp.fromDate(new Date(raceTime));

        if (raceTimestamp.toMillis() > now.toMillis()) continue;

        candidateRaces.push({
          raceId: doc.id,
          round: data.round,
          raceName: data.name || doc.id,
          hasSprint: data.hasSprint || false,
        });
      }

      if (candidateRaces.length === 0) {
        console.log('[Ingestion] No candidate races found.');
        return;
      }

      console.log(`[Ingestion] Found ${candidateRaces.length} candidate race(s)`);

      // 2. Check which already have approved pending results
      for (const race of candidateRaces) {
        const pendingDoc = await db.collection('pendingResults').doc(race.raceId).get();
        if (pendingDoc.exists) {
          const status = pendingDoc.data()?.status;
          if (status === 'approved') {
            console.log(`[Ingestion] ${race.raceId} already approved, skipping`);
            continue;
          }
          if (status === 'pending') {
            console.log(`[Ingestion] ${race.raceId} already pending review, skipping`);
            continue;
          }
          // status === 'rejected' — allow re-fetch
        }

        await processRace(race);
      }
    } catch (error) {
      console.error('[Ingestion] Fatal error:', error);
    }
  },
);

async function processRace(race: {
  raceId: string;
  round: number;
  raceName: string;
  hasSprint: boolean;
}) {
  console.log(`[Ingestion] Processing ${race.raceName} (round ${race.round})...`);
  const warnings: string[] = [];

  try {
    // Fetch all sessions for the season
    const allSessions = await fetchSessions(SEASON_YEAR);

    // Strict year filter
    const yearSessions = allSessions.filter(s => s.year === SEASON_YEAR);
    if (yearSessions.length === 0) {
      console.log(`[Ingestion] No ${SEASON_YEAR} sessions found on OpenF1`);
      return;
    }

    // Derive round numbers from date ordering
    const roundMap = deriveRoundNumbers(yearSessions);

    // Find the meeting_key for this round
    let targetMeetingKey: number | null = null;
    for (const [meetingKey, round] of roundMap.entries()) {
      if (round === race.round) {
        targetMeetingKey = meetingKey;
        break;
      }
    }

    if (targetMeetingKey == null) {
      console.log(`[Ingestion] No meeting found for round ${race.round}`);
      return;
    }

    // Get all sessions for this meeting
    const meetingSessions = yearSessions.filter(s => s.meeting_key === targetMeetingKey);
    const raceSession = meetingSessions.find(s => s.session_name === 'Race');

    if (!raceSession) {
      console.log(`[Ingestion] No Race session found for meeting ${targetMeetingKey}`);
      return;
    }

    // Check if session has ended (date_end in the past)
    if (raceSession.date_end && new Date(raceSession.date_end) > new Date()) {
      console.log(`[Ingestion] Race session still in progress, skipping`);
      return;
    }

    // Fetch grid positions from qualifying
    const gridPositions = await getGridPositions(meetingSessions);

    // Fetch fastest lap
    let fastestLapDriverId: string | null = null;
    try {
      fastestLapDriverId = await findFastestLap(raceSession.session_key);
    } catch (e) {
      warnings.push('Failed to fetch fastest lap data');
      console.warn('[Ingestion] Fastest lap fetch failed:', e);
    }

    // Convert race results
    const raceData = await convertToRaceResults(
      raceSession.session_key,
      gridPositions,
      fastestLapDriverId,
    );

    if (raceData.results.length === 0) {
      console.log(`[Ingestion] No race results for ${race.raceId} — likely not yet available`);
      return;
    }

    warnings.push(...raceData.warnings);

    // Fetch sprint results if applicable
    let sprintData: { results: Array<{ position: number; driverId: string; status: 'finished' | 'dnf' | 'dsq' }>; warnings: string[] } | null = null;
    const hasSprint = race.hasSprint || SPRINT_ROUNDS.has(race.round);

    if (hasSprint) {
      const sprintSession = meetingSessions.find(s => s.session_name === 'Sprint');
      if (sprintSession) {
        sprintData = await convertToSprintResults(sprintSession.session_key);
        warnings.push(...sprintData.warnings);
      } else {
        warnings.push('Sprint expected but no Sprint session found');
      }
    }

    // Build pending result document
    const pendingResult: Record<string, unknown> = {
      raceId: race.raceId,
      round: race.round,
      raceName: race.raceName,
      status: 'pending',
      warnings,
      results: {
        raceResults: raceData.results,
        ...(sprintData && sprintData.results.length > 0
          ? { sprintResults: sprintData.results }
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

    // Auto-approve if configured
    if (AUTO_APPROVE) {
      console.log(`[Ingestion] Auto-approving ${race.raceId}...`);
      await doApprove(race.raceId, 'auto');
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

    // Admin check
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const isAdmin = userDoc.data()?.isAdmin === true || request.auth.token.admin === true;
    if (!isAdmin) {
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

    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const isAdmin = userDoc.data()?.isAdmin === true || request.auth.token.admin === true;
    if (!isAdmin) {
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
