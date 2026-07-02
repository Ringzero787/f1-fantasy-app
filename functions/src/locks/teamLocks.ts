import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { warnIfNoAppCheck } from '../utils/appCheck';
import { effectiveLockTime, lockSessionLabel } from '../utils/lockTime';

const db = admin.firestore();

const BATCH_OP_LIMIT = 499;

// Failsafe unlock: Phase 5 of onRaceCompleted schedules the real unlock
// (3h after race completion). This ceiling only exists so teams don't stay
// locked forever if a race is cancelled or results never arrive.
const UNLOCK_FAILSAFE_MS = 24 * 60 * 60 * 1000;

/**
 * Scheduled function to lock teams before the weekend's first roster-scoring
 * session: sprint qualifying on sprint weekends, otherwise qualifying.
 * Runs every 15 minutes.
 *
 * Optimized: bulk-fetches league docs using db.getAll() instead of N+1 reads
 */
export const autoLockTeams = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const nowMs = now.toMillis();
    const oneHourFromNowMs = nowMs + 60 * 60 * 1000;

    // Small collection (~24 docs/season): fetch upcoming races and pick the
    // ones whose lock session starts within the next hour. Filtering in code
    // (not the query) lets sprint weekends key off schedule.sprintQualifying.
    const racesSnapshot = await db
      .collection('races')
      .where('status', '==', 'upcoming')
      .get();

    const dueRaces = racesSnapshot.docs.filter((doc) => {
      const lockAt = effectiveLockTime(doc.data());
      if (!lockAt) return false;
      const ms = lockAt.toMillis();
      return ms > nowMs && ms <= oneHourFromNowMs;
    });

    if (dueRaces.length === 0) {
      console.log('No races locking soon');
      return null;
    }

    for (const raceDoc of dueRaces) {
      const race = raceDoc.data();

      // Get all unlocked teams
      const teamsSnapshot = await db
        .collection('fantasyTeams')
        .where('isLocked', '==', false)
        .get();

      if (teamsSnapshot.empty) {
        continue;
      }

      // Collect unique league IDs and bulk-fetch
      const leagueIds = [...new Set(
        teamsSnapshot.docs.map((d) => d.data().leagueId).filter(Boolean)
      )] as string[];

      const leagueRefs = leagueIds.map((id) => db.collection('leagues').doc(id));
      const leagueDocs = leagueRefs.length > 0 ? await db.getAll(...leagueRefs) : [];

      // Build lookup map
      const leagueSettings = new Map<string, string>();
      for (const leagueDoc of leagueDocs) {
        if (leagueDoc.exists) {
          const data = leagueDoc.data();
          leagueSettings.set(leagueDoc.id, data?.settings?.lockDeadline || 'qualifying');
        }
      }

      // Lock teams in batches
      let batch = db.batch();
      let lockedCount = 0;
      let opsInBatch = 0;

      for (const teamDoc of teamsSnapshot.docs) {
        const team = teamDoc.data();
        const lockDeadline = leagueSettings.get(team.leagueId) || 'qualifying';

        if (lockDeadline === 'qualifying') {
          batch.update(teamDoc.ref, {
            isLocked: true,
            'lockStatus.canModify': false,
            'lockStatus.lockReason': `Locked for ${race.name} ${lockSessionLabel(race)}`,
            // NOT race start: seeding nextUnlockTime with schedule.race let
            // autoUnlockTeams free teams AT race start, hours before scoring —
            // rosters were editable during and after the race. Phase 5 of
            // onRaceCompleted sets the real unlock (completion + 3h); this is
            // only a cancelled-race failsafe.
            'lockStatus.nextUnlockTime': admin.firestore.Timestamp.fromMillis(
              race.schedule.race.toMillis() + UNLOCK_FAILSAFE_MS
            ),
          });
          lockedCount++;
          opsInBatch++;

          if (opsInBatch >= BATCH_OP_LIMIT) {
            await batch.commit();
            batch = db.batch();
            opsInBatch = 0;
          }
        }
      }

      if (opsInBatch > 0) {
        await batch.commit();
      }

      if (lockedCount > 0) {
        console.log(`Locked ${lockedCount} teams for race ${race.name}`);
      }

      // Update race status
      await raceDoc.ref.update({ status: 'in_progress' });
    }

    return null;
  });

/**
 * Scheduled: unlock teams whose nextUnlockTime has passed.
 * Runs every 30 minutes. Phase 5 of onRaceCompleted sets nextUnlockTime
 * to 3 hours after race completion to buffer for delays/corrections.
 */
export const autoUnlockTeams = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    const lockedTeamsSnap = await db
      .collection('fantasyTeams')
      .where('isLocked', '==', true)
      .where('lockStatus.nextUnlockTime', '<=', now)
      .get();

    if (lockedTeamsSnap.empty) {
      console.log('[Unlock] No teams ready to unlock');
      return null;
    }

    let batch = db.batch();
    let count = 0;
    let opsInBatch = 0;

    for (const teamDoc of lockedTeamsSnap.docs) {
      const team = teamDoc.data();
      if (team.lockStatus?.isSeasonLocked) continue;

      batch.update(teamDoc.ref, {
        isLocked: false,
        'lockStatus.canModify': true,
        'lockStatus.lockReason': null,
        'lockStatus.nextUnlockTime': null,
      });
      count++;
      opsInBatch++;

      if (opsInBatch >= BATCH_OP_LIMIT) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    }

    if (opsInBatch > 0) {
      await batch.commit();
    }

    console.log(`[Unlock] Unlocked ${count} teams`);
    return null;
  });

/**
 * HTTP function to manually lock a team (for testing/admin)
 */
export const lockTeam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  warnIfNoAppCheck(context, 'lockTeam');

  const { teamId, reason } = data;
  if (!teamId) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId is required');
  }

  const teamDoc = await db.collection('fantasyTeams').doc(teamId).get();
  if (!teamDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Team not found');
  }

  const team = teamDoc.data()!;

  // Verify user owns this team
  if (team.userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your team');
  }

  await teamDoc.ref.update({
    isLocked: true,
    'lockStatus.canModify': false,
    'lockStatus.lockReason': reason || 'Manually locked',
  });

  return { success: true };
});

/**
 * HTTP function to season lock a team
 */
export const seasonLockTeam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  warnIfNoAppCheck(context, 'seasonLockTeam');

  const { teamId, racesRemaining } = data;
  if (!teamId || typeof racesRemaining !== 'number') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'teamId and racesRemaining are required'
    );
  }

  const teamDoc = await db.collection('fantasyTeams').doc(teamId).get();
  if (!teamDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Team not found');
  }

  const team = teamDoc.data()!;

  // Verify user owns this team
  if (team.userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your team');
  }

  // Validate team is complete (5 drivers + 1 constructor)
  if (team.drivers.length < 5 || !team.constructor) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Team must be complete (5 drivers + 1 constructor) before season lock'
    );
  }

  await teamDoc.ref.update({
    isLocked: true,
    'lockStatus.isSeasonLocked': true,
    'lockStatus.seasonLockRacesRemaining': racesRemaining,
    'lockStatus.canModify': false,
    'lockStatus.lockReason': 'Season locked',
  });

  return { success: true, message: `Team locked for ${racesRemaining} remaining races` };
});

/**
 * HTTP function to early unlock a season-locked team (with fee)
 */
export const earlyUnlockTeam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  warnIfNoAppCheck(context, 'earlyUnlockTeam');

  const { teamId } = data;
  if (!teamId) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId is required');
  }

  const EARLY_UNLOCK_FEE = 50;

  const teamDoc = await db.collection('fantasyTeams').doc(teamId).get();
  if (!teamDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Team not found');
  }

  const team = teamDoc.data()!;

  // Verify user owns this team
  if (team.userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your team');
  }

  // Verify team is season locked
  if (!team.lockStatus?.isSeasonLocked) {
    throw new functions.https.HttpsError('failed-precondition', 'Team is not season locked');
  }

  // Check budget
  if (team.budget < EARLY_UNLOCK_FEE) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Not enough budget. Early unlock requires ${EARLY_UNLOCK_FEE} points`
    );
  }

  await teamDoc.ref.update({
    isLocked: false,
    'lockStatus.isSeasonLocked': false,
    'lockStatus.seasonLockRacesRemaining': 0,
    'lockStatus.canModify': true,
    'lockStatus.lockReason': null,
    budget: admin.firestore.FieldValue.increment(-EARLY_UNLOCK_FEE),
  });

  return {
    success: true,
    message: `Team unlocked. ${EARLY_UNLOCK_FEE} points deducted from budget`,
  };
});

/**
 * Check lock status for a race
 */
export const checkLockStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  warnIfNoAppCheck(context, 'checkLockStatus');
  const { raceId, teamId } = data;

  if (!raceId) {
    throw new functions.https.HttpsError('invalid-argument', 'raceId is required');
  }

  const raceDoc = await db.collection('races').doc(raceId).get();
  if (!raceDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Race not found');
  }

  const race = raceDoc.data()!;
  const now = new Date();
  // Sprint weekends lock at sprint qualifying, not race qualifying.
  const lockTime = (effectiveLockTime(race) ?? race.schedule.qualifying).toDate();

  const isLockTime = now >= lockTime;
  const timeUntilLock = lockTime.getTime() - now.getTime();

  let teamLockStatus = null;
  if (teamId) {
    const teamDoc = await db.collection('fantasyTeams').doc(teamId).get();
    if (teamDoc.exists) {
      const team = teamDoc.data()!;
      teamLockStatus = {
        isLocked: team.isLocked,
        isSeasonLocked: team.lockStatus?.isSeasonLocked || false,
        canModify: team.lockStatus?.canModify ?? !team.isLocked,
        lockReason: team.lockStatus?.lockReason,
      };
    }
  }

  return {
    race: {
      id: raceId,
      name: race.name,
      // Field name kept for client compatibility; on sprint weekends this is
      // the sprint qualifying time (the actual lock moment).
      qualifyingTime: lockTime.toISOString(),
      lockSession: lockSessionLabel(race),
      status: race.status,
    },
    isLockTime,
    timeUntilLock: isLockTime ? 0 : timeUntilLock,
    teamLockStatus,
  };
});
