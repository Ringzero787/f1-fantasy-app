import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  runTransaction,
  collection,
  addDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { dataService } from './data.service';
import { pickN, rollInitialDriverMix } from '../utils/rarity';
import type { Driver, Constructor, Garage, TransactionType } from '../types';

const STARTING_CASH = 250;
const RELEASE_REFUND_PCT = 0.75;
const REROLL_BASE_COST = 5;
const ROSTER_DRIVER_SLOTS = 4;
const ROSTER_CONSTRUCTOR_SLOTS = 2;
// Opening-roll budget — user must compose a 4-driver + 2-constructor hand within this.
// Sized to Undercut's price scale where top drivers run ~$200–$600, midfield
// $80–$150, backmarkers $20–$60. $1000 gives realistic headroom: a top-shelf
// hand spends most of it; a balanced hand leaves $200–$400 as starting cash.
const ROLL_BUDGET = 1000;
const ROLL_REJECT_TOKENS = 3;
const ROLL_MACRO_REROLLS = 1;

const garageDoc = (userId: string) => doc(db, 'tl_garages', userId);
const txCollection = (userId: string) => collection(db, 'tl_garages', userId, 'transactions');

// Migrates a freshly-loaded garage doc forward to the roster/bench model.
// Older docs only had ownedDriverIds (capped at maxDrivers); the roster fields
// might be missing. Promote up to ROSTER_DRIVER_SLOTS owned ids into the active
// roster so existing users don't lose their lineup.
function migrateGarageShape(g: Garage): Garage {
  const next: Garage = { ...g };
  if (!Array.isArray(next.rosteredDriverIds)) {
    next.rosteredDriverIds = (next.ownedDriverIds ?? []).slice(0, ROSTER_DRIVER_SLOTS);
  }
  if (!Array.isArray(next.rosteredConstructorIds)) {
    next.rosteredConstructorIds = (next.ownedConstructorIds ?? []).slice(0, ROSTER_CONSTRUCTOR_SLOTS);
  }
  if (typeof next.rosterDriverSlots !== 'number') next.rosterDriverSlots = ROSTER_DRIVER_SLOTS;
  if (typeof next.rosterConstructorSlots !== 'number') next.rosterConstructorSlots = ROSTER_CONSTRUCTOR_SLOTS;
  return next;
}

async function persistMigrationIfNeeded(userId: string, original: Garage, migrated: Garage) {
  const needsWrite =
    !Array.isArray(original.rosteredDriverIds) ||
    !Array.isArray(original.rosteredConstructorIds) ||
    typeof original.rosterDriverSlots !== 'number' ||
    typeof original.rosterConstructorSlots !== 'number';
  if (!needsWrite) return;
  await updateDoc(garageDoc(userId), {
    rosteredDriverIds: migrated.rosteredDriverIds,
    rosteredConstructorIds: migrated.rosteredConstructorIds,
    rosterDriverSlots: migrated.rosterDriverSlots,
    rosterConstructorSlots: migrated.rosterConstructorSlots,
    updatedAt: serverTimestamp(),
  });
}

export const garageService = {
  async getGarage(userId: string): Promise<Garage | null> {
    const snap = await getDoc(garageDoc(userId));
    if (!snap.exists()) return null;
    const raw = { id: snap.id, ...snap.data() } as Garage;
    const migrated = migrateGarageShape(raw);
    await persistMigrationIfNeeded(userId, raw, migrated);
    return migrated;
  },

  // Creates the user's initial garage with 4 drivers + 2 constructors. The full
  // initial roll is auto-rostered (active = owned at start). Idempotent.
  async performInitialRoll(userId: string): Promise<Garage> {
    const existing = await this.getGarage(userId);
    if (existing) return existing;

    const [drivers, constructors] = await Promise.all([
      dataService.getActiveDrivers(),
      dataService.getActiveConstructors(),
    ]);

    if (drivers.length < 4 || constructors.length < 2) {
      throw new Error('Not enough active drivers or constructors to initialize a garage');
    }

    const mix = rollInitialDriverMix();
    const aTier = drivers.filter((d) => d.tier === 'A');
    const bTier = drivers.filter((d) => d.tier === 'B');
    const cTier = drivers.filter((d) => d.tier === 'C');

    const pickFromTier = (pool: Driver[], n: number, fallback: Driver[]): Driver[] => {
      const picked = pickN(pool, n, (d) => d.price + 1);
      const remaining = n - picked.length;
      if (remaining > 0) {
        const fallbackPool = fallback.filter((d) => !picked.find((p) => p.id === d.id));
        picked.push(...pickN(fallbackPool, remaining, (d) => d.price + 1));
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

    const garage: Omit<Garage, 'id'> = {
      ownedDriverIds: driverIds,
      ownedConstructorIds: constructorIds,
      rosteredDriverIds: driverIds.slice(0, ROSTER_DRIVER_SLOTS),
      rosteredConstructorIds: constructorIds.slice(0, ROSTER_CONSTRUCTOR_SLOTS),
      rosterDriverSlots: ROSTER_DRIVER_SLOTS,
      rosterConstructorSlots: ROSTER_CONSTRUCTOR_SLOTS,
      cash: STARTING_CASH,
      totalCashEarned: 0,
      totalPoints: 0,
      raceWinStreak: 0,
      raceLossStreak: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await setDoc(garageDoc(userId), {
      ...garage,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await this.recordTransaction(userId, {
      type: 'initial_roll',
      delta: 0,
      cashAfter: STARTING_CASH,
      description: `Opened with ${pickedDrivers.map((d) => d.shortName).join(', ')} and ${pickedConstructors.map((c) => c.shortName).join(', ')}`,
    });

    return { id: userId, ...garage };
  },

  async releaseDriver(userId: string, driverId: string): Promise<{ refund: number; cashAfter: number }> {
    const driver = await dataService.getDriver(driverId);
    if (!driver) throw new Error('Driver not found');
    const refund = Math.round(driver.price * RELEASE_REFUND_PCT);

    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(garageDoc(userId));
      if (!snap.exists()) throw new Error('Garage not found');
      const garage = migrateGarageShape(snap.data() as Garage);
      if (!garage.ownedDriverIds.includes(driverId)) {
        throw new Error('You do not own this driver');
      }
      // Releasing the last rostered driver would empty the active roster — block it.
      if (garage.rosteredDriverIds.includes(driverId) && garage.rosteredDriverIds.length <= 2) {
        throw new Error('You must keep at least 2 drivers in your active roster. Bench-swap first.');
      }

      const newOwned = garage.ownedDriverIds.filter((id) => id !== driverId);
      let newRostered = garage.rosteredDriverIds.filter((id) => id !== driverId);
      // If we removed someone from the active roster, auto-promote the first available bench
      // driver so the roster stays at full slots.
      if (newRostered.length < garage.rosterDriverSlots) {
        const benchPool = newOwned.filter((id) => !newRostered.includes(id));
        if (benchPool.length > 0) newRostered = [...newRostered, benchPool[0]];
      }

      const newCash = garage.cash + refund;
      tx.update(garageDoc(userId), {
        ownedDriverIds: newOwned,
        rosteredDriverIds: newRostered,
        cash: newCash,
        totalCashEarned: garage.totalCashEarned + refund,
        updatedAt: serverTimestamp(),
      });
      return { refund, cashAfter: newCash };
    });

    await this.recordTransaction(userId, {
      type: 'release_driver',
      delta: result.refund,
      cashAfter: result.cashAfter,
      entityId: driverId,
      entityName: driver.name,
      description: `Released ${driver.name} for ${result.refund}`,
    });

    return result;
  },

  async releaseConstructor(
    userId: string,
    constructorId: string
  ): Promise<{ refund: number; cashAfter: number }> {
    const constructor = (await dataService.getConstructorsByIds([constructorId]))[0];
    if (!constructor) throw new Error('Constructor not found');
    const refund = Math.round(constructor.price * RELEASE_REFUND_PCT);

    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(garageDoc(userId));
      if (!snap.exists()) throw new Error('Garage not found');
      const garage = migrateGarageShape(snap.data() as Garage);
      if (!garage.ownedConstructorIds.includes(constructorId)) {
        throw new Error('You do not own this constructor');
      }
      if (garage.rosteredConstructorIds.includes(constructorId) && garage.rosteredConstructorIds.length <= 1) {
        throw new Error('You must keep at least 1 constructor in your active roster. Bench-swap first.');
      }

      const newOwned = garage.ownedConstructorIds.filter((id) => id !== constructorId);
      let newRostered = garage.rosteredConstructorIds.filter((id) => id !== constructorId);
      if (newRostered.length < garage.rosterConstructorSlots) {
        const benchPool = newOwned.filter((id) => !newRostered.includes(id));
        if (benchPool.length > 0) newRostered = [...newRostered, benchPool[0]];
      }

      const newCash = garage.cash + refund;
      tx.update(garageDoc(userId), {
        ownedConstructorIds: newOwned,
        rosteredConstructorIds: newRostered,
        cash: newCash,
        totalCashEarned: garage.totalCashEarned + refund,
        updatedAt: serverTimestamp(),
      });
      return { refund, cashAfter: newCash };
    });

    await this.recordTransaction(userId, {
      type: 'release_constructor',
      delta: result.refund,
      cashAfter: result.cashAfter,
      entityId: constructorId,
      entityName: constructor.name,
      description: `Released ${constructor.name} for ${result.refund}`,
    });

    return result;
  },

  // Buying always succeeds (subject to cash). The driver joins the owned
  // collection. If the active roster has a free slot, the new driver is
  // auto-deployed; otherwise they sit on the bench until the user swaps them in.
  async buyDriver(userId: string, driver: Driver): Promise<{ cashAfter: number; autoRostered: boolean }> {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(garageDoc(userId));
      if (!snap.exists()) throw new Error('Garage not found');
      const garage = migrateGarageShape(snap.data() as Garage);
      if (garage.ownedDriverIds.includes(driver.id)) {
        throw new Error('You already own this driver');
      }
      if (garage.cash < driver.price) {
        throw new Error(`Not enough cash. Need ${driver.price}, have ${garage.cash}`);
      }
      const newOwned = [...garage.ownedDriverIds, driver.id];
      const hasRosterRoom = garage.rosteredDriverIds.length < garage.rosterDriverSlots;
      const newRostered = hasRosterRoom
        ? [...garage.rosteredDriverIds, driver.id]
        : garage.rosteredDriverIds;
      const newCash = garage.cash - driver.price;
      tx.update(garageDoc(userId), {
        ownedDriverIds: newOwned,
        rosteredDriverIds: newRostered,
        cash: newCash,
        updatedAt: serverTimestamp(),
      });
      return { cashAfter: newCash, autoRostered: hasRosterRoom };
    });

    await this.recordTransaction(userId, {
      type: 'buy_driver',
      delta: -driver.price,
      cashAfter: result.cashAfter,
      entityId: driver.id,
      entityName: driver.name,
      description: `Bought ${driver.name} for ${driver.price}${result.autoRostered ? ' (deployed)' : ' (to bench)'}`,
    });

    return result;
  },

  async buyConstructor(userId: string, constructor: Constructor): Promise<{ cashAfter: number; autoRostered: boolean }> {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(garageDoc(userId));
      if (!snap.exists()) throw new Error('Garage not found');
      const garage = migrateGarageShape(snap.data() as Garage);
      if (garage.ownedConstructorIds.includes(constructor.id)) {
        throw new Error('You already own this constructor');
      }
      if (garage.cash < constructor.price) {
        throw new Error(`Not enough cash. Need ${constructor.price}, have ${garage.cash}`);
      }
      const newOwned = [...garage.ownedConstructorIds, constructor.id];
      const hasRosterRoom = garage.rosteredConstructorIds.length < garage.rosterConstructorSlots;
      const newRostered = hasRosterRoom
        ? [...garage.rosteredConstructorIds, constructor.id]
        : garage.rosteredConstructorIds;
      const newCash = garage.cash - constructor.price;
      tx.update(garageDoc(userId), {
        ownedConstructorIds: newOwned,
        rosteredConstructorIds: newRostered,
        cash: newCash,
        updatedAt: serverTimestamp(),
      });
      return { cashAfter: newCash, autoRostered: hasRosterRoom };
    });

    await this.recordTransaction(userId, {
      type: 'buy_constructor',
      delta: -constructor.price,
      cashAfter: result.cashAfter,
      entityId: constructor.id,
      entityName: constructor.name,
      description: `Bought ${constructor.name} for ${constructor.price}${result.autoRostered ? ' (deployed)' : ' (to bench)'}`,
    });

    return result;
  },

  async swapRosterDriver(userId: string, outDriverId: string, inDriverId: string): Promise<void> {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(garageDoc(userId));
      if (!snap.exists()) throw new Error('Garage not found');
      const garage = migrateGarageShape(snap.data() as Garage);
      if (!garage.ownedDriverIds.includes(inDriverId)) throw new Error('You do not own that driver');
      if (!garage.rosteredDriverIds.includes(outDriverId)) throw new Error('That driver is not rostered');
      if (garage.rosteredDriverIds.includes(inDriverId)) throw new Error('Driver is already rostered');
      const newRostered = garage.rosteredDriverIds.map((id) => (id === outDriverId ? inDriverId : id));
      tx.update(garageDoc(userId), {
        rosteredDriverIds: newRostered,
        updatedAt: serverTimestamp(),
      });
    });
  },

  async swapRosterConstructor(userId: string, outConstructorId: string, inConstructorId: string): Promise<void> {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(garageDoc(userId));
      if (!snap.exists()) throw new Error('Garage not found');
      const garage = migrateGarageShape(snap.data() as Garage);
      if (!garage.ownedConstructorIds.includes(inConstructorId)) throw new Error('You do not own that constructor');
      if (!garage.rosteredConstructorIds.includes(outConstructorId)) throw new Error('That constructor is not rostered');
      if (garage.rosteredConstructorIds.includes(inConstructorId)) throw new Error('Constructor is already rostered');
      const newRostered = garage.rosteredConstructorIds.map((id) =>
        id === outConstructorId ? inConstructorId : id
      );
      tx.update(garageDoc(userId), {
        rosteredConstructorIds: newRostered,
        updatedAt: serverTimestamp(),
      });
    });
  },

  async benchDriver(userId: string, driverId: string): Promise<void> {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(garageDoc(userId));
      if (!snap.exists()) throw new Error('Garage not found');
      const garage = migrateGarageShape(snap.data() as Garage);
      if (!garage.rosteredDriverIds.includes(driverId)) throw new Error('Driver not on roster');
      if (garage.rosteredDriverIds.length <= 2) {
        throw new Error('Active roster needs at least 2 drivers to start a race');
      }
      tx.update(garageDoc(userId), {
        rosteredDriverIds: garage.rosteredDriverIds.filter((id) => id !== driverId),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async deployDriver(userId: string, driverId: string): Promise<void> {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(garageDoc(userId));
      if (!snap.exists()) throw new Error('Garage not found');
      const garage = migrateGarageShape(snap.data() as Garage);
      if (!garage.ownedDriverIds.includes(driverId)) throw new Error('You do not own this driver');
      if (garage.rosteredDriverIds.includes(driverId)) return;
      if (garage.rosteredDriverIds.length >= garage.rosterDriverSlots) {
        throw new Error(`Active roster is full (${garage.rosterDriverSlots}). Swap one out first.`);
      }
      tx.update(garageDoc(userId), {
        rosteredDriverIds: [...garage.rosteredDriverIds, driverId],
        updatedAt: serverTimestamp(),
      });
    });
  },

  async benchConstructor(userId: string, constructorId: string): Promise<void> {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(garageDoc(userId));
      if (!snap.exists()) throw new Error('Garage not found');
      const garage = migrateGarageShape(snap.data() as Garage);
      if (!garage.rosteredConstructorIds.includes(constructorId)) throw new Error('Constructor not on roster');
      if (garage.rosteredConstructorIds.length <= 1) {
        throw new Error('Active roster needs at least 1 constructor to start a race');
      }
      tx.update(garageDoc(userId), {
        rosteredConstructorIds: garage.rosteredConstructorIds.filter((id) => id !== constructorId),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async deployConstructor(userId: string, constructorId: string): Promise<void> {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(garageDoc(userId));
      if (!snap.exists()) throw new Error('Garage not found');
      const garage = migrateGarageShape(snap.data() as Garage);
      if (!garage.ownedConstructorIds.includes(constructorId)) throw new Error('You do not own this constructor');
      if (garage.rosteredConstructorIds.includes(constructorId)) return;
      if (garage.rosteredConstructorIds.length >= garage.rosterConstructorSlots) {
        throw new Error(`Active roster is full (${garage.rosterConstructorSlots}). Swap one out first.`);
      }
      tx.update(garageDoc(userId), {
        rosteredConstructorIds: [...garage.rosteredConstructorIds, constructorId],
        updatedAt: serverTimestamp(),
      });
    });
  },

  // Commit the result of the opening-roll mechanic. Caller already enforced the
  // budget and slot counts client-side; we just persist the chosen IDs as both
  // the owned collection AND the active roster. Idempotent: if a garage already
  // exists, the existing one is returned untouched.
  async commitRoll(
    userId: string,
    driverIds: string[],
    constructorIds: string[],
    cashRemaining: number
  ): Promise<Garage> {
    const existing = await this.getGarage(userId);
    if (existing) return existing;

    const garage: Omit<Garage, 'id'> = {
      ownedDriverIds: driverIds.slice(0, ROSTER_DRIVER_SLOTS),
      ownedConstructorIds: constructorIds.slice(0, ROSTER_CONSTRUCTOR_SLOTS),
      rosteredDriverIds: driverIds.slice(0, ROSTER_DRIVER_SLOTS),
      rosteredConstructorIds: constructorIds.slice(0, ROSTER_CONSTRUCTOR_SLOTS),
      rosterDriverSlots: ROSTER_DRIVER_SLOTS,
      rosterConstructorSlots: ROSTER_CONSTRUCTOR_SLOTS,
      cash: Math.max(0, cashRemaining),
      totalCashEarned: 0,
      totalPoints: 0,
      raceWinStreak: 0,
      raceLossStreak: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await setDoc(garageDoc(userId), {
      ...garage,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await this.recordTransaction(userId, {
      type: 'initial_roll',
      delta: 0,
      cashAfter: garage.cash,
      description: `Opening roll · ${driverIds.length}D + ${constructorIds.length}C · $${garage.cash} budget`,
    });

    return { id: userId, ...garage };
  },

  async chargeReroll(userId: string): Promise<{ cashAfter: number; cost: number }> {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(garageDoc(userId));
      if (!snap.exists()) throw new Error('Garage not found');
      const garage = snap.data() as Garage;
      if (garage.cash < REROLL_BASE_COST) {
        throw new Error(`Not enough cash to reroll (need ${REROLL_BASE_COST})`);
      }
      const newCash = garage.cash - REROLL_BASE_COST;
      tx.update(garageDoc(userId), {
        cash: newCash,
        updatedAt: serverTimestamp(),
      });
      return { cashAfter: newCash, cost: REROLL_BASE_COST };
    });

    await this.recordTransaction(userId, {
      type: 'reroll',
      delta: -result.cost,
      cashAfter: result.cashAfter,
      description: `Rerolled the shop`,
    });

    return result;
  },

  async recordTransaction(
    userId: string,
    data: {
      type: TransactionType;
      delta: number;
      cashAfter: number;
      entityId?: string;
      entityName?: string;
      raceId?: string;
      description: string;
    }
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      userId,
      ...data,
      timestamp: serverTimestamp(),
    };
    for (const k of Object.keys(payload)) {
      if (payload[k] === undefined) delete payload[k];
    }
    await addDoc(txCollection(userId), payload);
  },
};

export const garageConfig = {
  STARTING_CASH,
  RELEASE_REFUND_PCT,
  REROLL_BASE_COST,
  ROSTER_DRIVER_SLOTS,
  ROSTER_CONSTRUCTOR_SLOTS,
  ROLL_BUDGET,
  ROLL_REJECT_TOKENS,
  ROLL_MACRO_REROLLS,
};
