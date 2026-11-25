import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { projectTeam } from './projectTeam';
import { isUsableLeagueId } from '../utils/leagueId';
import { LockState, creationLock, liveLockState, lockedTeamStatus, stampedForWeekend } from '../locks/lockState';
import { pickDueRace } from '../utils/lockTime';
import { START_BUDGET, UNLOCKED_LOCK_STATUS } from '../season/rollover';
import { completedRaceCount, currentSeason } from '../season/current';
import { LineupError, applyPlan, buyConstructor, buyDriver, parsePlan, quoteSale, requestedLength, sellConstructor, sellDriver, startState, teamCtor as getTeamCtor, TEAM_SIZE, type LineupPlan } from './lineupSteps';
import {
  MAX_CONTRACT_LENGTH, MAX_CONSECUTIVE_RACES,
  allowedContractLength, priorStreak, racesLeftInSeason,
} from './contractRules';


const db = admin.firestore();

const BUDGET = START_BUDGET;
const MAX_TEAMS_PER_USER = 2;

// F-176: TEAM_SIZE, the default contract length, the early-termination rate, quoteSale and
// getTeamCtor live once, in lineupSteps.ts (keep in sync with src/config/pricing.config.ts there).

function validateContractLength(raw: unknown): number {
  try { return requestedLength(raw); } catch (e) { throw asHttps(e); }
}

/** F-169: the refusal for a driver re-bought straight after a full run (the one-race lockout). */
function streakLockedOut(name: string): functions.https.HttpsError {
  return new functions.https.HttpsError('failed-precondition',
    `${name || 'This driver'} has been on this team for ${MAX_CONSECUTIVE_RACES} races in a row, so is locked out until after the next race.`);
}

function assertOwnedUnlockedTeam(
  teamSnap: FirebaseFirestore.DocumentSnapshot,
  userId: string,
  liveLock: LockState | null = null,
): FirebaseFirestore.DocumentData {
  if (!teamSnap.exists) throw new functions.https.HttpsError('not-found', 'Team not found');
  const team = teamSnap.data()!;
  if (team.userId !== userId) throw new functions.https.HttpsError('permission-denied', 'Not your team');
  if (team.isLocked) throw new functions.https.HttpsError('failed-precondition', 'Team is locked');
  // F-118: a team the lock sweep never reached is unlocked but must not be edited mid-weekend.
  // autoLockTeams only sweeps `upcoming` races, and locking a weekend takes that race out of the
  // set, so a team created afterwards keeps `isLocked: false` through the sprint and the race —
  // the only check above — and could pick a roster with the sessions already run.
  //
  // Keyed on THIS weekend's stamp. Note what it is NOT keyed on: `earlyUnlockTeam` is not a
  // mid-weekend escape to work around — it refuses outright while a weekend is live (it buys a way
  // out of the SEASON lock), so during a live weekend an unlocked team is essentially always one
  // the sweep never reached. The stamp is still the right test because it is the thing a forged
  // payload cannot fake: `allow create` does not constrain `lockStatus` and the shipped client
  // creates teams with a bare addDoc, so a presence test on that field was the client's to pass.
  // THIS weekend's stamp, not merely a truthy one. `!team.lockStatus?.aceLockTime` was a
  // truthiness test: a forged `'x'`, or last month's timestamp, passed it and all five roster
  // callables accepted edits with the sessions already run. `allow create` does not constrain
  // `lockStatus` and the shipped client creates teams with a bare addDoc, so that field was the
  // client's to choose. Comparing the instant makes a stale or fabricated stamp fail, while the
  // paid earlyUnlockTeam team still passes, because F-095 leaves THIS weekend's stamp on it.
  if (!stampedForWeekend(team, liveLock)) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The race weekend is already under way, so this team is set for the next race.',
    );
  }
  return team;
}


/**
 * F-151: completed races in the current season — the clock purchases are stamped on (`addedAtRace`)
 * and driver lockouts are compared against. All-time, a 2027 purchase would read as race 22+.
 */
async function getCompletedRaceCount(): Promise<number> {
  return completedRaceCount(db);
}

/**
 * F-169: the season clock for a purchase — completed races (as getCompletedRaceCount) and the races
 * still to run, which no contract may outlast. No readable season: the old all-time count, no cap.
 */
async function getSeasonClock(): Promise<{ completedRaceCount: number; racesLeft: number }> {
  const season = await currentSeason(db);
  if (season === null) return { completedRaceCount: await getCompletedRaceCount(), racesLeft: MAX_CONTRACT_LENGTH };
  const races = (await db.collection('races').where('seasonId', '==', season).get()).docs.map((d) => d.data());
  return { completedRaceCount: races.filter((r) => r.status === 'completed').length, racesLeft: racesLeftInSeason(races) };
}

/**
 * Server-side team creation with validation.
 * Enforces max 2 teams per user.
 */
export const createTeamSecure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { name, leagueId } = data;

  // F-104: the rules cannot help here — this writes with the Admin SDK, so `usableLeagueId` in
  // firestore.rules never runs. Without this the callable is a way straight back to the hole the
  // rule closes: `doc(leagueId)` throws on a slash, which rejects every autoLockTeams run and
  // aborts the league sync in calculatePoints, for everyone.
  if (!isUsableLeagueId(leagueId)) {
    throw new functions.https.HttpsError('invalid-argument', 'leagueId is not a valid league id');
  }
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    throw new functions.https.HttpsError('invalid-argument', 'Team name must be at least 2 characters');
  }

  const userId = context.auth.uid;

  // Check team count
  const existingTeams = await db.collection('fantasyTeams')
    .where('userId', '==', userId)
    .get();

  if (existingTeams.size >= MAX_TEAMS_PER_USER) {
    throw new functions.https.HttpsError('failed-precondition', `Maximum ${MAX_TEAMS_PER_USER} teams allowed`);
  }

  // Enforce one team per league per user (1:1). Solo teams (no leagueId) are exempt.
  if (leagueId && existingTeams.docs.some((d) => d.data().leagueId === leagueId)) {
    throw new functions.https.HttpsError('already-exists', 'You already have a team in this league');
  }

  // F-118: a weekend already under way (`config/lockState`) means this team is created LOCKED.
  // F-020: the same if an upcoming race is already inside the one-hour lock window — the sweep
  // has not published the marker yet, and a team stored unlocked here would be editable until
  // the next run. Locking at creation makes the roster callables and aceIsFrozen work unchanged.
  const nowMs = Date.now();
  const live = await liveLockState(db, nowMs);
  let due: { id: string; data: FirebaseFirestore.DocumentData } | null = null;
  if (!live) {
    const upcoming = await db.collection('races').where('status', '==', 'upcoming').get();
    due = pickDueRace(upcoming.docs.map((d) => ({ id: d.id, data: d.data() })), nowMs);
  }
  const created = creationLock(live, due);
  const lockStatus = created
    ? lockedTeamStatus(created.state, created.raceName)
    // F-150: the same object the season rollover resets teams to
    : { ...UNLOCKED_LOCK_STATUS };

  const teamRef = db.collection('fantasyTeams').doc();
  const stamped = admin.firestore.Timestamp.now();
  const team = {
    userId,
    name: name.trim(),
    leagueId: leagueId || null,
    drivers: [],
    constructor: null,
    budget: BUDGET,
    totalSpent: 0,
    totalPoints: 0,
    lockedPoints: 0,
    isLocked: created !== null,
    lockStatus,
    aceDriverId: null,
    aceConstructorId: null,
    racesSinceTransfer: 0,
    racesPlayed: 0,
    pointsHistory: [],
    joinedAtRace: 0,
    raceWins: 0,
    scoredRaces: [],
    createdAt: stamped,
    updatedAt: stamped,
  };

  await teamRef.set(team);

  return { teamId: teamRef.id, id: teamRef.id, ...team };
});

/**
 * Server-side add driver.
 *
 * Transactional: price is read from the server inside the transaction (clients
 * cannot buy at stale/forged prices), budget is debited as a cash ledger, and
 * concurrent calls cannot double-spend.
 */
export const addDriverSecure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { teamId, driverId } = data;
  if (!teamId || !driverId || typeof teamId !== 'string' || typeof driverId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'teamId and driverId required');
  }
  const requestedLength = validateContractLength(data.contractLength);

  const userId = context.auth.uid;
  const teamRef = db.collection('fantasyTeams').doc(teamId);
  const driverRef = db.collection('drivers').doc(driverId);

  // F-118: read outside the transaction on purpose — this is an advisory gate, and the
  // authoritative state is still the team's own isLocked, which the same sweep writes. The
  // gap between the sweep publishing config/lockState and flipping the race is milliseconds.
  // F-176: both advisory reads at once, not one after the other.
  const [{ completedRaceCount, racesLeft }, liveLock] = await Promise.all([getSeasonClock(), liveLockState(db)]);
  // F-176: the rules live once, in lineupSteps.ts, shared with applyLineupSecure.
  const result = await db.runTransaction(async (tx) => {
    const [teamSnap, driverSnap] = await Promise.all([tx.get(teamRef), tx.get(driverRef)]);
    const team = assertOwnedUnlockedTeam(teamSnap, userId, liveLock);
    const state = startState(team, BUDGET);
    const fantasyDriver = buyDriver(state, driverId, driverSnap.exists ? driverSnap.data()! : null, requestedLength, { completedRaceCount, racesLeft });
    const updateData = {
      drivers: state.drivers,
      budget: state.budget,
      totalSpent: state.totalSpent,
      racesSinceTransfer: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    tx.set(teamRef, updateData, { merge: true });
    return { driver: fantasyDriver, newBudget: state.budget, team: projectTeam(teamId, team, updateData) };
  }).catch((e) => { throw asHttps(e); });

  return { success: true, ...result };
});

/**
 * Server-side remove (sell) driver.
 *
 * Transactional. Banking is the SAME pattern as the scoring pipeline's contract
 * expiry (Phase 3.5): the departing driver's points move from totalPoints into
 * lockedPoints — the sum (what leaderboards display) is unchanged. The old
 * implementation added to lockedPoints WITHOUT decrementing totalPoints, which
 * permanently double-counted every sold driver's points.
 */
export const removeDriverSecure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { teamId, driverId } = data;
  if (!teamId || !driverId || typeof teamId !== 'string' || typeof driverId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'teamId and driverId required');
  }

  const userId = context.auth.uid;
  const teamRef = db.collection('fantasyTeams').doc(teamId);
  const driverRef = db.collection('drivers').doc(driverId);
  // F-169: the clock the sale is stamped on, so a re-buy in this window continues the run
  // F-118: read outside the transaction on purpose — this is an advisory gate, and the
  // authoritative state is still the team's own isLocked, which the same sweep writes. The
  // gap between the sweep publishing config/lockState and flipping the race is milliseconds.
  // F-176: both advisory reads at once.
  const [completedRaceCount, liveLock] = await Promise.all([getCompletedRaceCount(), liveLockState(db)]);
  // F-176: the rules live once, in lineupSteps.ts, shared with applyLineupSecure.
  const result = await db.runTransaction(async (tx) => {
    const [teamSnap, driverSnap] = await Promise.all([tx.get(teamRef), tx.get(driverRef)]);
    const team = assertOwnedUnlockedTeam(teamSnap, userId, liveLock);
    const state = startState(team, BUDGET);
    const marketPrice = driverSnap.exists && typeof driverSnap.data()!.price === 'number' ? (driverSnap.data()!.price as number) : null;
    sellDriver(state, driverId, marketPrice, completedRaceCount);
    const sale = state.sales[0];

    const updateData: Record<string, any> = {
      drivers: state.drivers,
      budget: state.budget,
      totalSpent: state.totalSpent,
      lockedPoints: admin.firestore.FieldValue.increment(sale.bankedPoints),
      totalPoints: admin.firestore.FieldValue.increment(-sale.bankedPoints),
      racesSinceTransfer: 0,
      // F-169: the whole map, written with update (set-merge would keep stale keys): this window's sales
      driverStreaks: state.driverStreaks ?? {},
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (state.aceDriverId !== team.aceDriverId) updateData.aceDriverId = null;

    // F-169: update(), not set(merge) like the constructor callables below: driverStreaks must
    // REPLACE the stored map (set-merge deep-merges it and keeps stale keys). Safe here because
    // this payload has no `constructor` key, which update() cannot take (it expands top-level keys
    // as field paths and `constructor` collides with Object.prototype.constructor: HTTP 500). The
    // team doc exists (read + ownership-asserted above). Never add `constructor` to this payload.
    tx.update(teamRef, updateData);

    return {
      saleReturn: sale.saleReturn,
      earlyTermFee: sale.earlyTermFee,
      feeWaived: sale.feeWaived,
      bankedPoints: sale.bankedPoints,
      newBudget: state.budget,
      team: projectTeam(teamId, team, updateData, {
        lockedPoints: (team.lockedPoints || 0) + sale.bankedPoints,
        totalPoints: (team.totalPoints || 0) - sale.bankedPoints,
      }),
    };
  }).catch((e) => { throw asHttps(e); });

  return { success: true, ...result };
});

/**
 * Server-side set (buy) constructor. Sells the current constructor first if
 * one is held, using the same sale quote as removeConstructorSecure, so a
 * swap is atomic and cannot diverge from remove-then-add pricing.
 */
export const setConstructorSecure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { teamId, constructorId } = data;
  if (!teamId || !constructorId || typeof teamId !== 'string' || typeof constructorId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'teamId and constructorId required');
  }

  const userId = context.auth.uid;
  // F-118 / F-176: the two advisory reads at once (see addDriverSecure)
  const [{ completedRaceCount, racesLeft }, liveLock] = await Promise.all([getSeasonClock(), liveLockState(db)]);
  // F-169: never past the season's end (the six-in-a-row run is a driver rule)
  const contractLength = allowedContractLength(validateContractLength(data.contractLength), racesLeft);
  const teamRef = db.collection('fantasyTeams').doc(teamId);
  const newCtorRef = db.collection('constructors').doc(constructorId);
  // F-176: the rules live once, in lineupSteps.ts, shared with applyLineupSecure.
  const result = await db.runTransaction(async (tx) => {
    const [teamSnap, newCtorSnap] = await Promise.all([tx.get(teamRef), tx.get(newCtorRef)]);
    const team = assertOwnedUnlockedTeam(teamSnap, userId, liveLock);
    const state = startState(team, BUDGET);
    // The buy's own checks first (missing, inactive, the same constructor), as before the sale.
    if (!newCtorSnap.exists) throw new LineupError('not-found', 'Constructor not found');
    if (newCtorSnap.data()!.isActive === false) throw new LineupError('failed-precondition', 'Constructor is not active');
    const currentCtor = state.constructor;
    if (currentCtor && currentCtor.constructorId === constructorId) throw new LineupError('already-exists', 'Constructor already on team');
    if (currentCtor) {
      const curCtorDoc = await tx.get(db.collection('constructors').doc(currentCtor.constructorId));
      sellConstructor(state, curCtorDoc.exists && typeof curCtorDoc.data()!.price === 'number' ? (curCtorDoc.data()!.price as number) : null);
    }
    const fantasyCtor = buyConstructor(state, constructorId, newCtorSnap.data()!, contractLength, { completedRaceCount, racesLeft });
    const sale = state.sales[0];

    const updateData: Record<string, any> = {
      constructor: fantasyCtor,
      budget: state.budget,
      totalSpent: state.totalSpent,
      racesSinceTransfer: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // F-176: banked whenever there is something to bank, negative included, as removeConstructorSecure
    // always has; the swap used to skip a negative total and leave it counting.
    if (state.banked !== 0) {
      updateData.lockedPoints = admin.firestore.FieldValue.increment(state.banked);
      updateData.totalPoints = admin.firestore.FieldValue.increment(-state.banked);
    }
    if (state.aceConstructorId !== team.aceConstructorId) updateData.aceConstructorId = null;

    // set(merge), NOT update(): tx.update() expands top-level keys as field
    // paths and the literal key `constructor` collides with
    // Object.prototype.constructor, throwing "AssertionError: Can't merge
    // current value into a nested object" (HTTP 500). set(merge) serializes
    // the same way the scoring pipeline does and handles `constructor` fine.
    // The team doc is guaranteed to exist (read + ownership-asserted above).
    tx.set(teamRef, updateData, { merge: true });

    return {
      constructor: fantasyCtor,
      newBudget: state.budget,
      saleReturn: sale?.saleReturn ?? 0,
      earlyTermFee: sale?.earlyTermFee ?? 0,
      bankedPoints: state.banked,
      team: projectTeam(teamId, team, updateData, state.banked !== 0 ? {
        lockedPoints: (team.lockedPoints || 0) + state.banked,
        totalPoints: (team.totalPoints || 0) - state.banked,
      } : {}),
    };
  }).catch((e) => { throw asHttps(e); });

  return { success: true, ...result };
});

/**
 * Server-side remove (sell) constructor. Same banking and fee semantics as
 * removeDriverSecure.
 */
export const removeConstructorSecure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { teamId } = data;
  if (!teamId || typeof teamId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'teamId required');
  }

  const userId = context.auth.uid;
  const teamRef = db.collection('fantasyTeams').doc(teamId);

  // F-118: read outside the transaction on purpose — this is an advisory gate, and the
  // authoritative state is still the team's own isLocked, which the same sweep writes. The
  // gap between the sweep publishing config/lockState and flipping the race is milliseconds.
  const liveLock = await liveLockState(db);
  // F-176: the rules live once, in lineupSteps.ts, shared with applyLineupSecure.
  const result = await db.runTransaction(async (tx) => {
    const teamSnap = await tx.get(teamRef);
    const team = assertOwnedUnlockedTeam(teamSnap, userId, liveLock);
    const state = startState(team, BUDGET);
    if (!state.constructor) throw new LineupError('not-found', 'No constructor on team');
    const ctorDoc = await tx.get(db.collection('constructors').doc(state.constructor.constructorId));
    sellConstructor(state, ctorDoc.exists && typeof ctorDoc.data()!.price === 'number' ? (ctorDoc.data()!.price as number) : null);
    const sale = state.sales[0];

    const updateData: Record<string, any> = {
      constructor: null,
      budget: state.budget,
      totalSpent: state.totalSpent,
      lockedPoints: admin.firestore.FieldValue.increment(sale.bankedPoints),
      totalPoints: admin.firestore.FieldValue.increment(-sale.bankedPoints),
      racesSinceTransfer: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (state.aceConstructorId !== team.aceConstructorId) updateData.aceConstructorId = null;

    // set(merge), NOT update(): tx.update() expands top-level keys as field
    // paths and the literal key `constructor` collides with
    // Object.prototype.constructor, throwing "AssertionError: Can't merge
    // current value into a nested object" (HTTP 500). set(merge) serializes
    // the same way the scoring pipeline does and handles `constructor` fine.
    // The team doc is guaranteed to exist (read + ownership-asserted above).
    tx.set(teamRef, updateData, { merge: true });

    return {
      saleReturn: sale.saleReturn,
      earlyTermFee: sale.earlyTermFee,
      feeWaived: sale.feeWaived,
      bankedPoints: sale.bankedPoints,
      newBudget: state.budget,
      team: projectTeam(teamId, team, updateData, {
        lockedPoints: (team.lockedPoints || 0) + sale.bankedPoints,
        totalPoints: (team.totalPoints || 0) - sale.bankedPoints,
      }),
    };
  }).catch((e) => { throw asHttps(e); });

  return { success: true, ...result };
});

/**
 * F-176: a whole lineup change in ONE call and one transaction — the driver sales, a constructor
 * sale or swap, and the driver buys the Save button used to send as one callable each, in series.
 * Each callable could start cold (they ran ~30 times a month, so almost always), and a three-move
 * save measured ~10 s end to end in production. This is one round trip, all or nothing: a refusal
 * at any step writes nothing, so a lineup can no longer be left half saved.
 *
 * The rules are the single-move callables' own, as pure steps in lineupSteps.ts. 512 MB, because a
 * first-generation function's CPU scales with its memory and the cold start is mostly CPU.
 */
export const applyLineupSecure = functions.runWith({ memory: '512MB' }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  const teamId = (data as { teamId?: unknown } | undefined)?.teamId;
  if (!teamId || typeof teamId !== 'string' || teamId.includes('/')) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId required');
  }
  let plan: LineupPlan;
  try { plan = parsePlan(data); } catch (e) { throw asHttps(e); }

  // The two advisory reads run together, not one after the other (see the F-118 note above).
  const [clock, liveLock] = await Promise.all([getSeasonClock(), liveLockState(db)]);
  try {
    return { success: true, ...(await applyLineupTx(teamId, context.auth.uid, plan, clock, liveLock)) };
  } catch (e) {
    throw asHttps(e);
  }
});

/** The transaction behind applyLineupSecure; exported so the emulator test runs the real write. */
export async function applyLineupTx(
  teamId: string, userId: string, plan: LineupPlan, clock: { completedRaceCount: number; racesLeft: number }, liveLock: LockState | null,
) {
  const teamRef = db.collection('fantasyTeams').doc(teamId);
  return db.runTransaction(async (tx) => {
      const teamSnap = await tx.get(teamRef);
      const team = assertOwnedUnlockedTeam(teamSnap, userId, liveLock);
      const held = getTeamCtor(team);
      // Every price this plan can need, read in parallel: sold and bought drivers, the held and the new constructor.
      const driverIds = [...new Set([...plan.sellDrivers, ...plan.buyDrivers.map((b) => b.id)])];
      // The held constructor's price only when this plan sells or swaps it.
      const touchesCtor = plan.sellConstructor || !!plan.buyConstructor;
      const ctorIds = [...new Set([touchesCtor ? held?.constructorId : null, plan.buyConstructor?.id].filter((x): x is string => typeof x === 'string' && !!x))];
      const [dSnaps, cSnaps] = await Promise.all([
        Promise.all(driverIds.map((id) => tx.get(db.collection('drivers').doc(id)))),
        Promise.all(ctorIds.map((id) => tx.get(db.collection('constructors').doc(id)))),
      ]);
      const drivers = new Map(driverIds.map((id, i) => [id, dSnaps[i].exists ? dSnaps[i].data()! : null]));
      const constructors = new Map(ctorIds.map((id, i) => [id, cSnaps[i].exists ? cSnaps[i].data()! : null]));

      const state = startState(team, BUDGET);
      const bought = applyPlan(state, plan, { drivers, constructors }, clock);

      const updateData: Record<string, any> = {
        drivers: state.drivers,
        constructor: state.constructor,
        budget: state.budget,
        totalSpent: state.totalSpent,
        racesSinceTransfer: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (state.banked !== 0) {
        updateData.lockedPoints = admin.firestore.FieldValue.increment(state.banked);
        updateData.totalPoints = admin.firestore.FieldValue.increment(-state.banked);
      }
      if (state.driverStreaksTouched) updateData.driverStreaks = state.driverStreaks ?? {};
      if (state.aceDriverId !== team.aceDriverId) updateData.aceDriverId = state.aceDriverId ?? null;
      if (state.aceConstructorId !== team.aceConstructorId) updateData.aceConstructorId = state.aceConstructorId ?? null;

      // set() with mergeFields: each listed field is REPLACED (driverStreaks must not deep-merge and
      // keep stale keys, which is why removeDriverSecure uses update()), and, unlike update(), the
      // top-level `constructor` key is written as data, not expanded as a field path (the HTTP 500
      // the constructor callables avoid with set-merge).
      tx.set(teamRef, updateData, { mergeFields: Object.keys(updateData) });

      return {
        newBudget: state.budget,
        sales: state.sales,
        boughtDrivers: bought.boughtDrivers,
        boughtConstructor: bought.boughtConstructor,
        team: projectTeam(teamId, team, updateData, state.banked !== 0 ? {
          lockedPoints: (team.lockedPoints || 0) + state.banked,
          totalPoints: (team.totalPoints || 0) - state.banked,
        } : {}),
      };
  });
}

/** A step's refusal as the callable error the single-move callables throw for it. */
function asHttps(e: unknown): unknown {
  return e instanceof LineupError ? new functions.https.HttpsError(e.code, e.message) : e;
}

/**
 * Server-side initial team build: the whole roster (up to 5 drivers + a
 * constructor) in one transaction at server prices. Only valid on a team with
 * an empty roster — incremental changes go through the add/remove callables.
 */
export const buildTeamSecure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { teamId, driverIds, constructorId } = data;
  if (!teamId || typeof teamId !== 'string' || !Array.isArray(driverIds)) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId and driverIds required');
  }
  if (driverIds.length > TEAM_SIZE || driverIds.some((d: unknown) => typeof d !== 'string')) {
    throw new functions.https.HttpsError('invalid-argument', `driverIds must be up to ${TEAM_SIZE} driver ids`);
  }
  if (new Set(driverIds).size !== driverIds.length) {
    throw new functions.https.HttpsError('invalid-argument', 'Duplicate drivers not allowed');
  }
  const requestedLength = validateContractLength(data.contractLength);

  const userId = context.auth.uid;
  const { completedRaceCount, racesLeft } = await getSeasonClock();
  const teamRef = db.collection('fantasyTeams').doc(teamId);

  // F-118: read outside the transaction on purpose — this is an advisory gate, and the
  // authoritative state is still the team's own isLocked, which the same sweep writes. The
  // gap between the sweep publishing config/lockState and flipping the race is milliseconds.
  const liveLock = await liveLockState(db);
  const result = await db.runTransaction(async (tx) => {
    const reads: Promise<FirebaseFirestore.DocumentSnapshot>[] = [tx.get(teamRef)];
    for (const dId of driverIds) reads.push(tx.get(db.collection('drivers').doc(dId)));
    if (constructorId) reads.push(tx.get(db.collection('constructors').doc(constructorId)));
    const snaps = await Promise.all(reads);

    const team = assertOwnedUnlockedTeam(snaps[0], userId, liveLock);
    if ((team.drivers || []).length > 0 || getTeamCtor(team)) {
      throw new functions.https.HttpsError('failed-precondition',
        'Team already has a roster — use add/remove operations instead');
    }

    let budget: number = typeof team.budget === 'number' ? team.budget : BUDGET;
    const drivers: any[] = [];
    const lockouts: Record<string, number> = team.driverLockouts || {};

    for (let i = 0; i < driverIds.length; i++) {
      const snap = snaps[1 + i];
      if (!snap.exists) throw new functions.https.HttpsError('not-found', `Driver ${driverIds[i]} not found`);
      const d = snap.data()!;
      if (d.isActive === false) {
        throw new functions.https.HttpsError('failed-precondition', `Driver ${driverIds[i]} is not active`);
      }
      // A roster emptied by expiry and sales is rebuilt here: the same lockouts as addDriverSecure
      // (before F-169 this path skipped the expiry lockout entirely).
      const lockExpiry = Object.prototype.hasOwnProperty.call(lockouts, driverIds[i]) ? lockouts[driverIds[i]] : undefined;
      if (typeof lockExpiry === 'number' && completedRaceCount < lockExpiry) {
        throw new functions.https.HttpsError('failed-precondition', `${d.name || driverIds[i]} is locked out after contract expiry`);
      }
      const prior = priorStreak(team.driverStreaks, driverIds[i], completedRaceCount);
      const contractLength = allowedContractLength(requestedLength, racesLeft, prior);
      if (contractLength === 0) throw streakLockedOut(d.name);
      const price: number = typeof d.price === 'number' ? d.price : 0;
      budget -= price;
      drivers.push({
        driverId: d.id || driverIds[i],
        name: d.name || '',
        shortName: d.shortName || '',
        constructorId: d.constructorId || '',
        purchasePrice: price,
        currentPrice: price,
        pointsScored: 0,
        racesHeld: 0,
        contractLength,
        ...(prior > 0 ? { streakBefore: prior } : {}),
        addedAtRace: completedRaceCount,
      });
    }

    let fantasyCtor: Record<string, any> | null = null;
    if (constructorId) {
      const snap = snaps[1 + driverIds.length];
      if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Constructor not found');
      const c = snap.data()!;
      if (c.isActive === false) {
        throw new functions.https.HttpsError('failed-precondition', 'Constructor is not active');
      }
      const price: number = typeof c.price === 'number' ? c.price : 0;
      budget -= price;
      fantasyCtor = {
        constructorId,
        name: c.name || '',
        purchasePrice: price,
        currentPrice: price,
        pointsScored: 0,
        racesHeld: 0,
        contractLength: allowedContractLength(requestedLength, racesLeft),
        addedAtRace: completedRaceCount,
      };
    }

    if (budget < 0) {
      throw new functions.https.HttpsError('failed-precondition',
        `Selection exceeds budget by $${-budget}`);
    }

    const startingBudget: number = typeof team.budget === 'number' ? team.budget : BUDGET;
    // set(merge), NOT update(): `constructor` in an update() payload throws a
    // Firestore assertion (see addDriverSecure note).
    tx.set(teamRef, {
      drivers,
      constructor: fantasyCtor,
      budget,
      totalSpent: (team.totalSpent || 0) + (startingBudget - budget),
      racesSinceTransfer: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { drivers, constructor: fantasyCtor, newBudget: budget };
  });

  return { success: true, ...result };
});

/**
 * Quote the sale of a driver/constructor without executing it — used by the
 * client's confirm dialog so the number shown is EXACTLY the number charged.
 */
export const quoteSaleSecure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { teamId, driverId, entityType } = data;
  if (!teamId || typeof teamId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'teamId required');
  }

  const teamSnap = await db.collection('fantasyTeams').doc(teamId).get();
  if (!teamSnap.exists) throw new functions.https.HttpsError('not-found', 'Team not found');
  const team = teamSnap.data()!;
  if (team.userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your team');
  }

  if (entityType === 'constructor') {
    const ctor = getTeamCtor(team);
    if (!ctor) throw new functions.https.HttpsError('not-found', 'No constructor on team');
    const ctorDoc = await db.collection('constructors').doc(ctor.constructorId).get();
    const marketPrice: number = ctorDoc.exists && typeof ctorDoc.data()!.price === 'number'
      ? ctorDoc.data()!.price : (ctor.currentPrice || 0);
    return { ...quoteSale(ctor, marketPrice), bankedPoints: ctor.pointsScored || 0 };
  }

  if (!driverId || typeof driverId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'driverId required');
  }
  const driver = (team.drivers || []).find((d: any) => d.driverId === driverId);
  if (!driver) throw new functions.https.HttpsError('not-found', 'Driver not on team');
  const driverDoc = await db.collection('drivers').doc(driverId).get();
  const marketPrice: number = driverDoc.exists && typeof driverDoc.data()!.price === 'number'
    ? driverDoc.data()!.price : (driver.currentPrice || 0);
  return { ...quoteSale(driver, marketPrice), bankedPoints: driver.pointsScored || 0 };
});
