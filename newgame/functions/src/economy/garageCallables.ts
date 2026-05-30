// Garage cash callables. Every operation that moves cash or changes ownership
// runs here, server-side, keyed on context.auth.uid. The client can only read
// its garage and change roster/bench arrays (see firestore.rules: tl_garages).
//
// Return shapes mirror the legacy client garageService method returns so the
// rewired client wrappers can pass results straight through to the UI.

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import {
  STARTING_CASH,
  RELEASE_REFUND_PCT,
  REROLL_BASE_COST,
  ROSTER_DRIVER_SLOTS,
  ROSTER_CONSTRUCTOR_SLOTS,
  Garage,
  requireAuth,
  fail,
  garageRef,
  normaliseGarage,
  recordTransaction,
  getDriver,
  getConstructor,
  pickN,
  rollInitialDriverMix,
  db,
} from './shared';

const ROLL_STARTING_CASH = 100; // flat bankroll after the (free) opening roll

interface DriverLite { id: string; price: number; tier: 'A' | 'B' | 'C'; shortName?: string; }
interface ConstructorLite { id: string; price: number; shortName?: string; }

async function loadActiveDrivers(): Promise<DriverLite[]> {
  const snap = await db.collection('drivers').where('isActive', '==', true).get();
  return snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, price: (x.price as number) ?? 0, tier: (x.tier as 'A' | 'B' | 'C') ?? 'B', shortName: x.shortName as string | undefined };
  });
}
async function loadActiveConstructors(): Promise<ConstructorLite[]> {
  const snap = await db.collection('constructors').where('isActive', '==', true).get();
  return snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, price: (x.price as number) ?? 0, shortName: x.shortName as string | undefined };
  });
}

function newGarageDoc(driverIds: string[], constructorIds: string[], cash: number): Omit<Garage, never> & { createdAt: unknown; updatedAt: unknown } {
  return {
    ownedDriverIds: driverIds,
    ownedConstructorIds: constructorIds,
    rosteredDriverIds: driverIds.slice(0, ROSTER_DRIVER_SLOTS),
    rosteredConstructorIds: constructorIds.slice(0, ROSTER_CONSTRUCTOR_SLOTS),
    rosterDriverSlots: ROSTER_DRIVER_SLOTS,
    rosterConstructorSlots: ROSTER_CONSTRUCTOR_SLOTS,
    cash,
    totalCashEarned: 0,
    totalPoints: 0,
    raceWinStreak: 0,
    raceLossStreak: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

// Silent legacy initial roll — server picks the hand, $250 starting cash.
// Idempotent: returns the existing garage if one already exists.
export const tlInitialRoll = functions.https.onCall(async (_data, context) => {
  const uid = requireAuth(context);
  const ref = garageRef(uid);
  const existing = await ref.get();
  if (existing.exists) return { id: uid, ...normaliseGarage(existing.data()!) };

  const [drivers, constructors] = await Promise.all([loadActiveDrivers(), loadActiveConstructors()]);
  if (drivers.length < 4 || constructors.length < 2) {
    fail('failed-precondition', 'Not enough active drivers or constructors to initialize a garage.');
  }
  const mix = rollInitialDriverMix();
  const aTier = drivers.filter((d) => d.tier === 'A');
  const bTier = drivers.filter((d) => d.tier === 'B');
  const cTier = drivers.filter((d) => d.tier === 'C');
  const pickFromTier = (pool: DriverLite[], n: number, fallback: DriverLite[]): DriverLite[] => {
    const picked = pickN(pool, n, (d) => d.price + 1);
    const remaining = n - picked.length;
    if (remaining > 0) {
      const fb = fallback.filter((d) => !picked.find((p) => p.id === d.id));
      picked.push(...pickN(fb, remaining, (d) => d.price + 1));
    }
    return picked;
  };
  const pickedDrivers = [
    ...pickFromTier(aTier, mix.a, [...bTier, ...cTier]),
    ...pickFromTier(bTier, mix.b, [...aTier, ...cTier]),
    ...pickFromTier(cTier, mix.c, [...bTier, ...aTier]),
  ].slice(0, 4);
  const pickedConstructors = pickN(constructors, 2, (c) => Math.max(c.price, 5));

  const driverIds = pickedDrivers.map((d) => d.id);
  const constructorIds = pickedConstructors.map((c) => c.id);
  const doc = newGarageDoc(driverIds, constructorIds, STARTING_CASH);
  await ref.set(doc);
  recordTransaction(null, uid, {
    type: 'initial_roll',
    delta: 0,
    cashAfter: STARTING_CASH,
    description: `Opened with ${pickedDrivers.map((d) => d.shortName ?? d.id).join(', ')}`,
  });
  return { id: uid, ...normaliseGarage((await ref.get()).data()!) };
});

// Onboarding wizard commit. The opening roll is free + unconstrained, so we
// accept the player's chosen hand but (a) validate every id is a real active
// entity, (b) enforce 4 drivers + 2 constructors, and (c) set cash to the flat
// ROLL_STARTING_CASH server-side — the client can no longer dictate the
// balance. Idempotent: returns the existing garage untouched if present.
export const tlCommitRoll = functions.https.onCall(async (data: { driverIds?: string[]; constructorIds?: string[] }, context) => {
  const uid = requireAuth(context);
  const ref = garageRef(uid);
  const existing = await ref.get();
  if (existing.exists) return { id: uid, ...normaliseGarage(existing.data()!) };

  const driverIds = Array.isArray(data?.driverIds) ? data.driverIds.slice(0, ROSTER_DRIVER_SLOTS) : [];
  const constructorIds = Array.isArray(data?.constructorIds) ? data.constructorIds.slice(0, ROSTER_CONSTRUCTOR_SLOTS) : [];
  if (driverIds.length !== ROSTER_DRIVER_SLOTS || constructorIds.length !== ROSTER_CONSTRUCTOR_SLOTS) {
    fail('invalid-argument', `Opening hand must be ${ROSTER_DRIVER_SLOTS} drivers + ${ROSTER_CONSTRUCTOR_SLOTS} constructors.`);
  }
  if (new Set(driverIds).size !== driverIds.length || new Set(constructorIds).size !== constructorIds.length) {
    fail('invalid-argument', 'Duplicate entity in opening hand.');
  }
  const [activeDrivers, activeConstructors] = await Promise.all([loadActiveDrivers(), loadActiveConstructors()]);
  const dOk = new Set(activeDrivers.map((d) => d.id));
  const cOk = new Set(activeConstructors.map((c) => c.id));
  if (!driverIds.every((id) => dOk.has(id)) || !constructorIds.every((id) => cOk.has(id))) {
    fail('invalid-argument', 'Opening hand contains an unknown or inactive entity.');
  }

  const doc = newGarageDoc(driverIds, constructorIds, ROLL_STARTING_CASH);
  await ref.set(doc);
  recordTransaction(null, uid, {
    type: 'initial_roll',
    delta: 0,
    cashAfter: ROLL_STARTING_CASH,
    description: `Opening roll · ${driverIds.length}D + ${constructorIds.length}C · $${ROLL_STARTING_CASH} budget`,
  });
  return { id: uid, ...normaliseGarage((await ref.get()).data()!) };
});

export const tlBuyDriver = functions.https.onCall(async (data: { driverId?: string }, context) => {
  const uid = requireAuth(context);
  if (!data?.driverId) fail('invalid-argument', 'driverId required.');
  const driver = await getDriver(data.driverId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(garageRef(uid));
    if (!snap.exists) fail('not-found', 'Garage not found.');
    const g = normaliseGarage(snap.data()!);
    if (g.ownedDriverIds.includes(driver.id)) fail('already-exists', 'You already own this driver.');
    if (g.cash < driver.price) fail('failed-precondition', `Not enough cash. Need ${driver.price}, have ${g.cash}.`);
    const hasRoom = g.rosteredDriverIds.length < g.rosterDriverSlots;
    const newCash = g.cash - driver.price;
    tx.update(garageRef(uid), {
      ownedDriverIds: [...g.ownedDriverIds, driver.id],
      rosteredDriverIds: hasRoom ? [...g.rosteredDriverIds, driver.id] : g.rosteredDriverIds,
      cash: newCash,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    recordTransaction(tx, uid, {
      type: 'buy_driver',
      delta: -driver.price,
      cashAfter: newCash,
      entityId: driver.id,
      entityName: driver.name,
      description: `Bought ${driver.name} for ${driver.price}${hasRoom ? ' (deployed)' : ' (to bench)'}`,
    });
    return { cashAfter: newCash, autoRostered: hasRoom };
  });
});

export const tlBuyConstructor = functions.https.onCall(async (data: { constructorId?: string }, context) => {
  const uid = requireAuth(context);
  if (!data?.constructorId) fail('invalid-argument', 'constructorId required.');
  const ctor = await getConstructor(data.constructorId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(garageRef(uid));
    if (!snap.exists) fail('not-found', 'Garage not found.');
    const g = normaliseGarage(snap.data()!);
    if (g.ownedConstructorIds.includes(ctor.id)) fail('already-exists', 'You already own this constructor.');
    if (g.cash < ctor.price) fail('failed-precondition', `Not enough cash. Need ${ctor.price}, have ${g.cash}.`);
    const hasRoom = g.rosteredConstructorIds.length < g.rosterConstructorSlots;
    const newCash = g.cash - ctor.price;
    tx.update(garageRef(uid), {
      ownedConstructorIds: [...g.ownedConstructorIds, ctor.id],
      rosteredConstructorIds: hasRoom ? [...g.rosteredConstructorIds, ctor.id] : g.rosteredConstructorIds,
      cash: newCash,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    recordTransaction(tx, uid, {
      type: 'buy_constructor',
      delta: -ctor.price,
      cashAfter: newCash,
      entityId: ctor.id,
      entityName: ctor.name,
      description: `Bought ${ctor.name} for ${ctor.price}${hasRoom ? ' (deployed)' : ' (to bench)'}`,
    });
    return { cashAfter: newCash, autoRostered: hasRoom };
  });
});

export const tlReleaseDriver = functions.https.onCall(async (data: { driverId?: string }, context) => {
  const uid = requireAuth(context);
  if (!data?.driverId) fail('invalid-argument', 'driverId required.');
  const driver = await getDriver(data.driverId);
  const refund = Math.round(driver.price * RELEASE_REFUND_PCT);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(garageRef(uid));
    if (!snap.exists) fail('not-found', 'Garage not found.');
    const g = normaliseGarage(snap.data()!);
    if (!g.ownedDriverIds.includes(driver.id)) fail('failed-precondition', 'You do not own this driver.');
    if (g.rosteredDriverIds.includes(driver.id) && g.rosteredDriverIds.length <= 2) {
      fail('failed-precondition', 'You must keep at least 2 drivers in your active roster. Bench-swap first.');
    }
    const newOwned = g.ownedDriverIds.filter((id) => id !== driver.id);
    let newRostered = g.rosteredDriverIds.filter((id) => id !== driver.id);
    if (newRostered.length < g.rosterDriverSlots) {
      const bench = newOwned.filter((id) => !newRostered.includes(id));
      if (bench.length > 0) newRostered = [...newRostered, bench[0]];
    }
    const newCash = g.cash + refund;
    tx.update(garageRef(uid), {
      ownedDriverIds: newOwned,
      rosteredDriverIds: newRostered,
      cash: newCash,
      totalCashEarned: g.totalCashEarned + refund,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    recordTransaction(tx, uid, {
      type: 'release_driver',
      delta: refund,
      cashAfter: newCash,
      entityId: driver.id,
      entityName: driver.name,
      description: `Released ${driver.name} for ${refund}`,
    });
    return { refund, cashAfter: newCash };
  });
});

export const tlReleaseConstructor = functions.https.onCall(async (data: { constructorId?: string }, context) => {
  const uid = requireAuth(context);
  if (!data?.constructorId) fail('invalid-argument', 'constructorId required.');
  const ctor = await getConstructor(data.constructorId);
  const refund = Math.round(ctor.price * RELEASE_REFUND_PCT);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(garageRef(uid));
    if (!snap.exists) fail('not-found', 'Garage not found.');
    const g = normaliseGarage(snap.data()!);
    if (!g.ownedConstructorIds.includes(ctor.id)) fail('failed-precondition', 'You do not own this constructor.');
    if (g.rosteredConstructorIds.includes(ctor.id) && g.rosteredConstructorIds.length <= 1) {
      fail('failed-precondition', 'You must keep at least 1 constructor in your active roster. Bench-swap first.');
    }
    const newOwned = g.ownedConstructorIds.filter((id) => id !== ctor.id);
    let newRostered = g.rosteredConstructorIds.filter((id) => id !== ctor.id);
    if (newRostered.length < g.rosterConstructorSlots) {
      const bench = newOwned.filter((id) => !newRostered.includes(id));
      if (bench.length > 0) newRostered = [...newRostered, bench[0]];
    }
    const newCash = g.cash + refund;
    tx.update(garageRef(uid), {
      ownedConstructorIds: newOwned,
      rosteredConstructorIds: newRostered,
      cash: newCash,
      totalCashEarned: g.totalCashEarned + refund,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    recordTransaction(tx, uid, {
      type: 'release_constructor',
      delta: refund,
      cashAfter: newCash,
      entityId: ctor.id,
      entityName: ctor.name,
      description: `Released ${ctor.name} for ${refund}`,
    });
    return { refund, cashAfter: newCash };
  });
});

export const tlChargeReroll = functions.https.onCall(async (_data, context) => {
  const uid = requireAuth(context);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(garageRef(uid));
    if (!snap.exists) fail('not-found', 'Garage not found.');
    const g = normaliseGarage(snap.data()!);
    if (g.cash < REROLL_BASE_COST) fail('failed-precondition', `Not enough cash to reroll (need ${REROLL_BASE_COST}).`);
    const newCash = g.cash - REROLL_BASE_COST;
    tx.update(garageRef(uid), { cash: newCash, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    recordTransaction(tx, uid, {
      type: 'reroll',
      delta: -REROLL_BASE_COST,
      cashAfter: newCash,
      description: 'Rerolled the shop',
    });
    return { cashAfter: newCash, cost: REROLL_BASE_COST };
  });
});
