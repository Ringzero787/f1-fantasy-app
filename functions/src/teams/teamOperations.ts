import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

const BUDGET = 1000;
const TEAM_SIZE = 5;
const MAX_TEAMS_PER_USER = 2;

// Contract system — keep in sync with src/config/pricing.config.ts
const CONTRACT_LENGTH_DEFAULT = 3;
const MIN_CONTRACT_LENGTH = 1;
const MAX_CONTRACT_LENGTH = 10;

// Early termination fee — keep in sync with PRICING_CONFIG.EARLY_TERMINATION_RATE.
// This is the fee the app has always actually charged (3%/race, floor, with
// grace-period and reserve-pick waivers). The old server callable charged
// 10%/race with no waivers and the UI dialog quoted yet another number —
// this is now the single authoritative implementation.
const EARLY_TERMINATION_RATE = 0.03;

interface SaleQuote {
  marketPrice: number;
  earlyTermFee: number;
  saleReturn: number;
  feeWaived: boolean;
}

/**
 * Single source of truth for sale proceeds.
 * Fee = floor(marketPrice * 3% * races remaining on contract), waived entirely
 * during the grace period (entity has not yet been held through a race) and
 * for auto-filled reserve picks.
 */
function quoteSale(entity: {
  currentPrice?: number;
  contractLength?: number;
  racesHeld?: number;
  isReservePick?: boolean;
}, marketPrice: number): SaleQuote {
  const racesHeld = entity.racesHeld || 0;
  const contractLength = entity.contractLength || CONTRACT_LENGTH_DEFAULT;
  const racesLeft = contractLength - racesHeld;
  const feeWaived = racesHeld === 0 || entity.isReservePick === true || racesLeft <= 0;
  const earlyTermFee = feeWaived ? 0 : Math.floor(marketPrice * EARLY_TERMINATION_RATE * racesLeft);
  return { marketPrice, earlyTermFee, saleReturn: marketPrice - earlyTermFee, feeWaived };
}

function validateContractLength(raw: unknown): number {
  if (raw === undefined || raw === null) return CONTRACT_LENGTH_DEFAULT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_CONTRACT_LENGTH || n > MAX_CONTRACT_LENGTH) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `contractLength must be an integer between ${MIN_CONTRACT_LENGTH} and ${MAX_CONTRACT_LENGTH}`
    );
  }
  return n;
}

function assertOwnedUnlockedTeam(
  teamSnap: FirebaseFirestore.DocumentSnapshot,
  userId: string,
): FirebaseFirestore.DocumentData {
  if (!teamSnap.exists) throw new functions.https.HttpsError('not-found', 'Team not found');
  const team = teamSnap.data()!;
  if (team.userId !== userId) throw new functions.https.HttpsError('permission-denied', 'Not your team');
  if (team.isLocked) throw new functions.https.HttpsError('failed-precondition', 'Team is locked');
  return team;
}

/**
 * Safely read a team's fantasy constructor (a doc with no `constructor` field
 * returns Object.prototype.constructor — a truthy function — via property access).
 */
function getTeamCtor(team: Record<string, any>): Record<string, any> | null {
  const c = Object.prototype.hasOwnProperty.call(team, 'constructor') ? team['constructor'] : null;
  if (c && typeof c === 'object' && !Array.isArray(c) && typeof c.constructorId === 'string') {
    return c;
  }
  return null;
}

async function getCompletedRaceCount(): Promise<number> {
  const snap = await db.collection('races').where('status', '==', 'completed').get();
  return snap.size;
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

  const teamRef = db.collection('fantasyTeams').doc();
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
    isLocked: false,
    lockStatus: {
      isSeasonLocked: false,
      seasonLockRacesRemaining: 0,
      nextUnlockTime: null,
      canModify: true,
      lockReason: null,
    },
    aceDriverId: null,
    aceConstructorId: null,
    racesSinceTransfer: 0,
    racesPlayed: 0,
    pointsHistory: [],
    joinedAtRace: 0,
    raceWins: 0,
    scoredRaces: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await teamRef.set(team);

  return { teamId: teamRef.id, ...team, id: teamRef.id };
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
  const contractLength = validateContractLength(data.contractLength);

  const userId = context.auth.uid;
  const completedRaceCount = await getCompletedRaceCount();
  const teamRef = db.collection('fantasyTeams').doc(teamId);
  const driverRef = db.collection('drivers').doc(driverId);

  const result = await db.runTransaction(async (tx) => {
    const [teamSnap, driverSnap] = await Promise.all([tx.get(teamRef), tx.get(driverRef)]);
    const team = assertOwnedUnlockedTeam(teamSnap, userId);

    if (!driverSnap.exists) throw new functions.https.HttpsError('not-found', 'Driver not found');
    const driver = driverSnap.data()!;
    if (driver.isActive === false) {
      throw new functions.https.HttpsError('failed-precondition', 'Driver is not active');
    }

    const drivers: any[] = team.drivers || [];
    if (drivers.length >= TEAM_SIZE) {
      throw new functions.https.HttpsError('failed-precondition', 'Team is full');
    }
    if (drivers.some((d: any) => d.driverId === driverId)) {
      throw new functions.https.HttpsError('already-exists', 'Driver already on team');
    }

    // Contract-expiry lockout: a driver who just cycled off the team cannot be
    // re-bought until the lockout race count passes (mirrors Phase 3.5).
    const lockouts: Record<string, number> = team.driverLockouts || {};
    const lockExpiry = lockouts[driverId];
    if (lockExpiry !== undefined && completedRaceCount < lockExpiry) {
      throw new functions.https.HttpsError('failed-precondition', 'Driver is locked out after contract expiry');
    }

    // Cash-ledger budget check at the server price (source of truth)
    const price: number = typeof driver.price === 'number' ? driver.price : 0;
    const budget: number = typeof team.budget === 'number' ? team.budget : BUDGET;
    if (price > budget) {
      throw new functions.https.HttpsError('failed-precondition',
        `Cannot afford ${driver.name} ($${price}). Budget: $${budget}`);
    }

    const fantasyDriver = {
      driverId: driver.id || driverId,
      name: driver.name || '',
      shortName: driver.shortName || '',
      constructorId: driver.constructorId || '',
      purchasePrice: price,
      currentPrice: price,
      pointsScored: 0,
      racesHeld: 0,
      contractLength,
      addedAtRace: completedRaceCount,
    };

    tx.update(teamRef, {
      drivers: [...drivers, fantasyDriver],
      budget: budget - price,
      totalSpent: (team.totalSpent || 0) + price,
      racesSinceTransfer: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { driver: fantasyDriver, newBudget: budget - price };
  });

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

  const result = await db.runTransaction(async (tx) => {
    const [teamSnap, driverSnap] = await Promise.all([tx.get(teamRef), tx.get(driverRef)]);
    const team = assertOwnedUnlockedTeam(teamSnap, userId);

    const drivers: any[] = team.drivers || [];
    const driver = drivers.find((d: any) => d.driverId === driverId);
    if (!driver) throw new functions.https.HttpsError('not-found', 'Driver not on team');

    // Current market price from the server (source of truth)
    const marketPrice: number = driverSnap.exists && typeof driverSnap.data()!.price === 'number'
      ? driverSnap.data()!.price
      : (driver.currentPrice || 0);

    const quote = quoteSale(driver, marketPrice);
    const bankedPoints = driver.pointsScored || 0;

    const updateData: Record<string, any> = {
      drivers: drivers.filter((d: any) => d.driverId !== driverId),
      budget: (team.budget || 0) + quote.saleReturn,
      totalSpent: Math.max(0, (team.totalSpent || 0) - (driver.purchasePrice || 0)),
      lockedPoints: admin.firestore.FieldValue.increment(bankedPoints),
      totalPoints: admin.firestore.FieldValue.increment(-bankedPoints),
      racesSinceTransfer: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (team.aceDriverId === driverId) {
      updateData.aceDriverId = null;
    }

    tx.update(teamRef, updateData);

    return {
      saleReturn: quote.saleReturn,
      earlyTermFee: quote.earlyTermFee,
      feeWaived: quote.feeWaived,
      bankedPoints,
      newBudget: (team.budget || 0) + quote.saleReturn,
    };
  });

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
  const contractLength = validateContractLength(data.contractLength);

  const userId = context.auth.uid;
  const completedRaceCount = await getCompletedRaceCount();
  const teamRef = db.collection('fantasyTeams').doc(teamId);
  const newCtorRef = db.collection('constructors').doc(constructorId);

  const result = await db.runTransaction(async (tx) => {
    const [teamSnap, newCtorSnap] = await Promise.all([tx.get(teamRef), tx.get(newCtorRef)]);
    const team = assertOwnedUnlockedTeam(teamSnap, userId);

    if (!newCtorSnap.exists) throw new functions.https.HttpsError('not-found', 'Constructor not found');
    const newCtor = newCtorSnap.data()!;
    if (newCtor.isActive === false) {
      throw new functions.https.HttpsError('failed-precondition', 'Constructor is not active');
    }

    const currentCtor = getTeamCtor(team);
    if (currentCtor && currentCtor.constructorId === constructorId) {
      throw new functions.https.HttpsError('already-exists', 'Constructor already on team');
    }

    let budget: number = typeof team.budget === 'number' ? team.budget : BUDGET;
    let totalSpent: number = team.totalSpent || 0;
    let bankedPoints = 0;
    let saleReturn = 0;
    let earlyTermFee = 0;

    // Sell current constructor at the server market price (same quote as a
    // standalone remove — no separate swap fee math)
    if (currentCtor) {
      const curCtorDoc = await tx.get(db.collection('constructors').doc(currentCtor.constructorId));
      const marketPrice: number = curCtorDoc.exists && typeof curCtorDoc.data()!.price === 'number'
        ? curCtorDoc.data()!.price
        : (currentCtor.currentPrice || 0);
      const quote = quoteSale(currentCtor, marketPrice);
      saleReturn = quote.saleReturn;
      earlyTermFee = quote.earlyTermFee;
      bankedPoints = currentCtor.pointsScored || 0;
      budget += quote.saleReturn;
      totalSpent = Math.max(0, totalSpent - (currentCtor.purchasePrice || 0));
    }

    const price: number = typeof newCtor.price === 'number' ? newCtor.price : 0;
    if (price > budget) {
      throw new functions.https.HttpsError('failed-precondition',
        `Cannot afford ${newCtor.name} ($${price}). Budget: $${budget}`);
    }

    const fantasyCtor = {
      constructorId,
      name: newCtor.name || '',
      purchasePrice: price,
      currentPrice: price,
      pointsScored: 0,
      racesHeld: 0,
      contractLength,
      addedAtRace: completedRaceCount,
    };

    const updateData: Record<string, any> = {
      constructor: fantasyCtor,
      budget: budget - price,
      totalSpent: totalSpent + price,
      racesSinceTransfer: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (bankedPoints > 0) {
      updateData.lockedPoints = admin.firestore.FieldValue.increment(bankedPoints);
      updateData.totalPoints = admin.firestore.FieldValue.increment(-bankedPoints);
    }
    if (currentCtor && team.aceConstructorId === currentCtor.constructorId) {
      updateData.aceConstructorId = null;
    }

    tx.update(teamRef, updateData);

    return {
      constructor: fantasyCtor,
      newBudget: budget - price,
      saleReturn,
      earlyTermFee,
      bankedPoints,
    };
  });

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

  const result = await db.runTransaction(async (tx) => {
    const teamSnap = await tx.get(teamRef);
    const team = assertOwnedUnlockedTeam(teamSnap, userId);

    const ctor = getTeamCtor(team);
    if (!ctor) throw new functions.https.HttpsError('not-found', 'No constructor on team');

    const ctorDoc = await tx.get(db.collection('constructors').doc(ctor.constructorId));
    const marketPrice: number = ctorDoc.exists && typeof ctorDoc.data()!.price === 'number'
      ? ctorDoc.data()!.price
      : (ctor.currentPrice || 0);

    const quote = quoteSale(ctor, marketPrice);
    const bankedPoints = ctor.pointsScored || 0;

    const updateData: Record<string, any> = {
      constructor: null,
      budget: (team.budget || 0) + quote.saleReturn,
      totalSpent: Math.max(0, (team.totalSpent || 0) - (ctor.purchasePrice || 0)),
      lockedPoints: admin.firestore.FieldValue.increment(bankedPoints),
      totalPoints: admin.firestore.FieldValue.increment(-bankedPoints),
      racesSinceTransfer: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (team.aceConstructorId === ctor.constructorId) {
      updateData.aceConstructorId = null;
    }

    tx.update(teamRef, updateData);

    return {
      saleReturn: quote.saleReturn,
      earlyTermFee: quote.earlyTermFee,
      feeWaived: quote.feeWaived,
      bankedPoints,
      newBudget: (team.budget || 0) + quote.saleReturn,
    };
  });

  return { success: true, ...result };
});

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
  const contractLength = validateContractLength(data.contractLength);

  const userId = context.auth.uid;
  const completedRaceCount = await getCompletedRaceCount();
  const teamRef = db.collection('fantasyTeams').doc(teamId);

  const result = await db.runTransaction(async (tx) => {
    const reads: Promise<FirebaseFirestore.DocumentSnapshot>[] = [tx.get(teamRef)];
    for (const dId of driverIds) reads.push(tx.get(db.collection('drivers').doc(dId)));
    if (constructorId) reads.push(tx.get(db.collection('constructors').doc(constructorId)));
    const snaps = await Promise.all(reads);

    const team = assertOwnedUnlockedTeam(snaps[0], userId);
    if ((team.drivers || []).length > 0 || getTeamCtor(team)) {
      throw new functions.https.HttpsError('failed-precondition',
        'Team already has a roster — use add/remove operations instead');
    }

    let budget: number = typeof team.budget === 'number' ? team.budget : BUDGET;
    const drivers: any[] = [];

    for (let i = 0; i < driverIds.length; i++) {
      const snap = snaps[1 + i];
      if (!snap.exists) throw new functions.https.HttpsError('not-found', `Driver ${driverIds[i]} not found`);
      const d = snap.data()!;
      if (d.isActive === false) {
        throw new functions.https.HttpsError('failed-precondition', `Driver ${driverIds[i]} is not active`);
      }
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
        contractLength,
        addedAtRace: completedRaceCount,
      };
    }

    if (budget < 0) {
      throw new functions.https.HttpsError('failed-precondition',
        `Selection exceeds budget by $${-budget}`);
    }

    const startingBudget: number = typeof team.budget === 'number' ? team.budget : BUDGET;
    tx.update(teamRef, {
      drivers,
      constructor: fantasyCtor,
      budget,
      totalSpent: (team.totalSpent || 0) + (startingBudget - budget),
      racesSinceTransfer: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

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
