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
  ROUND_TO_RACE_ID,
} from './config';
import {
  fetchSessions,
  getGridPositions,
  findFastestLap,
  convertToRaceResults,
  convertToSprintResults,
  convertToQualifyingResults,
  deriveRoundNumbers,
} from './openf1Client';
import { handleQualifyingScoring, handleSprintScoring } from '../scoring/calculatePoints';

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

    // Fetch qualifying results
    let qualifyingData: { results: Array<{ position: number; driverId: string; constructorId: string }>; warnings: string[] } | null = null;
    const qualiSession = meetingSessions.find(s => s.session_name === 'Qualifying');
    if (qualiSession) {
      qualifyingData = await convertToQualifyingResults(qualiSession.session_key);
      warnings.push(...qualifyingData.warnings);
    } else {
      warnings.push('No qualifying session found');
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

    // Auto-approve if configured — but only if we have enough results
    const MIN_RESULTS_FOR_AUTO = 15;
    if (AUTO_APPROVE && raceData.results.length >= MIN_RESULTS_FOR_AUTO) {
      console.log(`[Ingestion] Auto-approving ${race.raceId}...`);
      await doApprove(race.raceId, 'auto');
    } else if (AUTO_APPROVE && raceData.results.length < MIN_RESULTS_FOR_AUTO) {
      console.log(`[Ingestion] Only ${raceData.results.length} results for ${race.raceId} — skipping auto-approve (need ${MIN_RESULTS_FOR_AUTO}+). Will retry next cycle.`);
      // Set status to 'rejected' so it re-fetches next cycle
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
  { schedule: 'every 30 minutes', timeoutSeconds: 120 },
  async () => {
    console.log('[QualiIngestion] Checking for completed qualifying...');

    try {
      const allSessions = await fetchSessions(SEASON_YEAR);
      const yearSessions = allSessions.filter(s => s.year === SEASON_YEAR);
      if (yearSessions.length === 0) return;

      const roundMap = deriveRoundNumbers(yearSessions);
      const now = new Date();

      for (const [meetingKey, round] of roundMap.entries()) {
        const raceId = ROUND_TO_RACE_ID[round];
        if (!raceId) continue;

        const meetingSessions = yearSessions.filter(s => s.meeting_key === meetingKey);
        const qualiSession = meetingSessions.find(s => s.session_name === 'Qualifying');
        if (!qualiSession) continue;

        // Check if qualifying has ended
        if (!qualiSession.date_end || new Date(qualiSession.date_end) > now) continue;

        // Check if race is still upcoming/in_progress (not yet completed)
        const raceDoc = await db.collection('races').doc(raceId).get();
        if (!raceDoc.exists) continue;
        const raceData = raceDoc.data()!;
        if (raceData.status === 'completed') continue;

        // Check if qualifying already scored
        if (raceData.qualifyingScored === true) {
          continue;
        }

        // Fetch and convert qualifying results
        const qualiData = await convertToQualifyingResults(qualiSession.session_key);
        if (qualiData.results.length === 0) {
          console.log(`[QualiIngestion] No qualifying results yet for round ${round}`);
          continue;
        }

        if (qualiData.warnings.length > 0) {
          console.log(`[QualiIngestion] Warnings for round ${round}:`, qualiData.warnings);
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
  { schedule: 'every 30 minutes', timeoutSeconds: 120 },
  async () => {
    console.log('[SprintIngestion] Checking for completed sprints...');

    try {
      const allSessions = await fetchSessions(SEASON_YEAR);
      const yearSessions = allSessions.filter(s => s.year === SEASON_YEAR);
      if (yearSessions.length === 0) return;

      const roundMap = deriveRoundNumbers(yearSessions);
      const now = new Date();

      for (const [meetingKey, round] of roundMap.entries()) {
        // Only process sprint rounds
        if (!SPRINT_ROUNDS.has(round)) continue;

        const raceId = ROUND_TO_RACE_ID[round];
        if (!raceId) continue;

        const meetingSessions = yearSessions.filter(s => s.meeting_key === meetingKey);
        const sprintSession = meetingSessions.find(s => s.session_name === 'Sprint');
        if (!sprintSession) continue;

        // Check if sprint has ended
        if (!sprintSession.date_end || new Date(sprintSession.date_end) > now) continue;

        // Check if race is still upcoming/in_progress (not yet completed)
        const raceDoc = await db.collection('races').doc(raceId).get();
        if (!raceDoc.exists) continue;
        const raceData = raceDoc.data()!;
        if (raceData.status === 'completed') continue;

        // Check if sprint already scored
        if (raceData.sprintScored === true) continue;

        // Fetch and convert sprint results
        const sprintData = await convertToSprintResults(sprintSession.session_key);
        if (sprintData.results.length === 0) {
          console.log(`[SprintIngestion] No sprint results yet for round ${round}`);
          continue;
        }

        if (sprintData.warnings.length > 0) {
          console.log(`[SprintIngestion] Warnings for round ${round}:`, sprintData.warnings);
        }

        // Write sprint results to race doc and mark as scored
        await raceDoc.ref.update({
          'results.sprintResults': sprintData.results,
          sprintScored: true,
        });

        // Score sprint directly
        await handleSprintScoring(raceId, sprintData.results);

        console.log(`[SprintIngestion] Scored sprint for ${raceId} (${sprintData.results.length} drivers)`);
      }
    } catch (error) {
      console.error('[SprintIngestion] Error:', error);
    }
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
