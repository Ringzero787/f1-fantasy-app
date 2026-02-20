import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { warnIfNoAppCheck } from '../utils/appCheck';

const db = admin.firestore();

const BATCH_OP_LIMIT = 499;

/**
 * Scheduled function to lock teams before qualifying
 * Runs every 15 minutes to check for upcoming qualifying sessions
 *
 * Optimized: bulk-fetches league docs using db.getAll() instead of N+1 reads
 */
export const autoLockTeams = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const oneHourFromNow = new Date(now.toMillis() + 60 * 60 * 1000);

    // Find races with qualifying starting within the next hour
    const racesSnapshot = await db
      .collection('races')
      .where('status', '==', 'upcoming')
      .where('schedule.qualifying', '<=', admin.firestore.Timestamp.fromDate(oneHourFromNow))
      .where('schedule.qualifying', '>', now)
      .get();

    if (racesSnapshot.empty) {
      console.log('No races with qualifying starting soon');
      return null;
    }

    for (const raceDoc of racesSnapshot.docs) {
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
            'lockStatus.lockReason': `Locked for ${race.name} qualifying`,
            'lockStatus.nextUnlockTime': race.schedule.race,
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

// autoUnlockTeams removed — unlocking is now handled by onRaceCompleted in calculatePoints.ts

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
  const qualifyingTime = race.schedule.qualifying.toDate();

  const isLockTime = now >= qualifyingTime;
  const timeUntilLock = qualifyingTime.getTime() - now.getTime();

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
      qualifyingTime: qualifyingTime.toISOString(),
      status: race.status,
    },
    isLockTime,
    timeUntilLock: isLockTime ? 0 : timeUntilLock,
    teamLockStatus,
  };
});
