import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { warnIfNoAppCheck } from '../utils/appCheck';
import { aceFreezeStart, effectiveLockTime, lockSessionLabel } from '../utils/lockTime';
import { FillContext, autoFillTeamTx, isIncomplete, loadFillContext } from '../teams/autoFill';

const db = admin.firestore();

const BATCH_OP_LIMIT = 499;

/** How long after its scheduled start a race still counts as "this weekend". */
const WEEKEND_WINDOW_MS = 36 * 60 * 60 * 1000;

/**
 * Is a race weekend running right now?
 *
 * `autoLockTeams` moves a race to 'in_progress' when it locks teams for it, and
 * `checkResults` moves it to 'completed' when the results land, so this is the system's
 * own notion of a live weekend rather than a second one invented here. F-095 uses it to
 * refuse the callables that would otherwise unlock a team in the middle of a race.
 *
 * Bounded by the schedule as well as the status, because 'in_progress' has no way out
 * but success: nothing times it out, and the admin re-trigger sets it in one write and
 * clears it in another. One race stuck there would otherwise refuse seasonLockTeam and
 * earlyUnlockTeam for every player, for the rest of the season. A stale latch should not
 * cost people the use of a feature they paid for.
 */
async function raceWeekendIsLive(now = Date.now()): Promise<boolean> {
  const live = await db.collection('races').where('status', '==', 'in_progress').get();
  return live.docs.some((doc) => {
    const startMs = doc.data()?.schedule?.race?.toMillis?.();
    return typeof startMs !== 'number' || now - startMs < WEEKEND_WINDOW_MS;
  });
}

// Failsafe unlock: Phase 5 of onRaceCompleted schedules the real unlock
// (3h after race completion). This ceiling only exists so teams don't stay
// locked forever if a race is cancelled or results never arrive.
const UNLOCK_FAILSAFE_MS = 24 * 60 * 60 * 1000;

/**
 * Scheduled function to lock teams before the weekend's first roster-scoring
 * session: sprint qualifying on sprint weekends, otherwise qualifying.
 * Runs every 15 minutes.
 *
 * Seats a player left empty (contract expiry frees them; see F-044) are filled
 * here, at the last moment before the lock, with the best-value cars the bank
 * affords — so a forgotten team still fields a competitive roster.
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

    // Market + form are loaded once per run, and only if some team needs it.
    // A failed load is not retried per team: the teams still lock as-is.
    let fillCtx: FillContext | null = null;
    let fillCtxFailed = false;

    for (const raceDoc of dueRaces) {
      const race = raceDoc.data();

      // Every team, not just the unlocked ones. The ace deadline has to be stamped on a
      // team that is ALREADY locked when the sweep runs — season-locked, or locked by the
      // admin helper — because an unstamped team is one the F-095 rule cannot see, and
      // its ace would stay writable right through the race. The lock itself is still only
      // applied to teams that are not locked yet. (~40 docs; this is not a big read.)
      const teamsSnapshot = await db.collection('fantasyTeams').get();

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

      // F-095: the window in which the ace is frozen, ending at the same failsafe ceiling
      // the roster unlock uses. Stamping an END as well as a start is what makes the rule
      // safe to apply without also asking whether the team is locked: a stamp nobody ever
      // clears expires on its own, so no path through the callables can leave a player
      // unable to change their ace ever again, and none can clear it to open the ace
      // mid-race either.
      //
      // F-098: the freeze starts at the first session the ace scores in — qualifying, or
      // the sprint on a sprint weekend — not at lights out, because each of those is
      // scored with the ace as it stands minutes after the session ends. `aceQualiKey` is
      // the key the qualifying scorer adds to the team's `scoredRaces`, and it is what
      // reopens the ace for the gap between qualifying and the race: that gap is the
      // designed feature, and it should open when qualifying has actually been scored
      // rather than at a time we guessed. `scoredRaces` is a denied key, so the client
      // cannot claim it early.
      const aceWindow = {
        'lockStatus.aceFreezeFrom': aceFreezeStart(race) ?? race.schedule.race,
        'lockStatus.aceLockTime': race.schedule.race,
        'lockStatus.aceLockUntil': admin.firestore.Timestamp.fromMillis(
          race.schedule.race.toMillis() + UNLOCK_FAILSAFE_MS
        ),
        'lockStatus.aceQualiKey': `quali_${raceDoc.id}`,
        // Only on a sprint weekend. The sprint can miss its own scoring run exactly as
        // qualifying can — `onRaceCompleted` then folds it in at race time from a live
        // ace read — so the gap must not open on qualifying alone where there is one.
        // `|| hasSprint` fails CLOSED: a sprint round whose OpenF1 sessions are not
        // published yet has the flag from seed data but no time, and stamping no marker
        // there would let the gap open on qualifying alone — the hole, not the fix.
        'lockStatus.aceSprintKey': (race.schedule?.sprint || race.hasSprint === true) ? `sprint_${raceDoc.id}` : null,
      };

      // Lock teams in batches
      let batch = db.batch();
      let lockedCount = 0;
      let stampedCount = 0;
      let filledCount = 0;
      let opsInBatch = 0;

      for (const teamDoc of teamsSnapshot.docs) {
        const team = teamDoc.data();
        const lockDeadline = leagueSettings.get(team.leagueId) || 'qualifying';

        if (lockDeadline === 'qualifying') {
          const alreadyLocked = team.isLocked === true;

          // Fill forgotten seats first, in a transaction of its own so a
          // last-minute edit is honoured and one corrupt roster cannot abort
          // the lock run for everyone else. The lock itself follows in the batch.
          if (!alreadyLocked && isIncomplete(team) && !fillCtxFailed) {
            try {
              if (!fillCtx) {
                try {
                  fillCtx = await loadFillContext(db);
                } catch (err) {
                  fillCtxFailed = true;
                  throw err;
                }
              }
              const plan = await autoFillTeamTx(db, teamDoc.ref, fillCtx, raceDoc.id);
              if (plan) {
                filledCount++;
                // Values from Firestore docs go in as arguments, never in the
                // format string: a "%s" in a race name must not forge the log line.
                console.log('Auto-filled team %s for %s: %s / %s ($%d)',
                  teamDoc.id, race.name, plan.filledDriverIds.join(',') || '-', plan.filledConstructorId || '-', plan.cost);
              }
            } catch (err) {
              console.error('Auto-fill failed for team %s; locking it as-is', teamDoc.id, err);
            }
          }
          // F-095: the ace locks LATER than the roster — at lights out, not at
          // qualifying — and that second deadline used to live only in the app.
          // Stamping it gives firestore.rules something tamper-proof to compare
          // request.time against (lockStatus is a denied key, so a client cannot move
          // its own deadline), and it is exact rather than rounded up to the next sweep.
          batch.update(teamDoc.ref, alreadyLocked ? aceWindow : {
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
            ...aceWindow,
          });
          if (!alreadyLocked) lockedCount++;
          stampedCount++;
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

      if (stampedCount > 0) {
        console.log(`Locked ${lockedCount} teams for race ${race.name} (auto-filled ${filledCount}; ace window stamped on ${stampedCount})`);
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
      // A season-locked team stays locked. Its ace comes free on its own: the F-095
      // window has an end as well as a start, so a stamp this sweep never reaches
      // expires rather than freezing the ace for the rest of the season.
      if (team.lockStatus?.isSeasonLocked) continue;

      batch.update(teamDoc.ref, {
        isLocked: false,
        'lockStatus.canModify': true,
        'lockStatus.lockReason': null,
        'lockStatus.nextUnlockTime': null,
        // F-095: tidiness, not correctness. The window expires by itself, which is the
        // point of stamping an end — but leaving last race's dates lying around is how
        // the next bug starts.
        'lockStatus.aceFreezeFrom': null,
        'lockStatus.aceLockTime': null,
        'lockStatus.aceLockUntil': null,
        'lockStatus.aceQualiKey': null,
        'lockStatus.aceSprintKey': null,
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
 * HTTP function to manually lock a team (testing/admin).
 *
 * F-095: admin only. Nothing in the app, the portal or scripts/ calls this, and as an
 * owner-callable it was a way to set your own isLocked outside the sweep — which, before
 * the ace window gained an end date, meant a lock the deadline was never stamped on.
 */
export const lockTeam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  if (context.auth.token?.admin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Admins only');
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

  // F-095: not during a live weekend. Paired with earlyUnlockTeam below this was a way
  // out of the weekend lock entirely — season-lock, then pay the fee to unlock, and both
  // the roster and the ace are editable in the middle of the race. Season locking is a
  // between-races decision; there is no reason to allow it while the weekend is running.
  // Both halves of the test matter: a team can be locked outside a live weekend (season
  // lock), and a weekend can be live while this particular team is not yet locked.
  if (await raceWeekendIsLive()) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'A race weekend is under way. Season lock once it is over.'
    );
  }
  if (team.isLocked) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Your team is still locked from the last race. Season lock once it unlocks.'
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

  // F-095: the fee buys a way out of the SEASON lock, never out of a race weekend.
  // Unlocking wholesale here was an escape hatch from both — the roster callables key
  // off isLocked — so season-lock, then pay 50 mid-race, and the team reopened while the
  // cars were running. Asking the race calendar rather than the team's own fields is the
  // point: a team season-locked BEFORE the weekend never gets a nextUnlockTime, so
  // reading one off the team answered "no weekend here" during exactly the race this is
  // meant to protect. The ace is safe either way now — its window does not consult
  // isLocked — but the roster is not, and they should not come apart.
  if (await raceWeekendIsLive()) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'A race weekend is under way. Unlock once it is over.'
    );
  }

  // The ace window is deliberately NOT cleared here. This is the only client-reachable
  // path that could clear it, and there is a gap it would have been clearable in: a race
  // flips to 'completed' with its results seconds before onRaceCompleted reads the aces,
  // and in that gap the guard above passes while the outcome is already known. Leaving
  // the window alone costs nothing — it expires on its own, which is the whole point of
  // stamping an end — and means the sweep is its only writer and the unlock sweep its
  // only clearer.
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
