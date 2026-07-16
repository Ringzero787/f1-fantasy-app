import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  runTransaction,
  collection,
  addDoc,
} from 'firebase/firestore';
import { db, functions, httpsCallable } from '../config/firebase';
import { withOfflineFallback } from '../utils/offlineCache';
import type { Driver, Constructor, Garage, TransactionType } from '../types';

const STARTING_CASH = 250;
const RELEASE_REFUND_PCT = 0.75;
const REROLL_BASE_COST = 5;
const ROSTER_DRIVER_SLOTS = 4;
const ROSTER_CONSTRUCTOR_SLOTS = 2;
const ROLL_BUDGET = 1000;
const ROLL_REJECT_TOKENS = 3;
const ROLL_MACRO_REROLLS = 3;
const ROLL_STARTING_CASH = 100;

const garageDoc = (userId: string) => doc(db, 'tl_garages', userId);

// ---------------------------------------------------------------------------
// Server-authoritative economy. Every cash-moving operation runs in a Cloud
// Function callable (functions/src/economy/*) keyed on the caller's auth uid;
// tl_garages.cash/owned/totals/streaks are immutable from the client (see
// firestore.rules). The methods below keep their old signatures so UI call
// sites are unchanged — they just delegate to the callable and pass the
// result through. The `userId` arg is retained for signature compatibility
// but ignored server-side (the server trusts context.auth.uid only).
// ---------------------------------------------------------------------------
const callInitialRoll = httpsCallable(functions, 'tlInitialRoll');
const callCommitRoll = httpsCallable(functions, 'tlCommitRoll');
const callBuyDriver = httpsCallable(functions, 'tlBuyDriver');
const callBuyConstructor = httpsCallable(functions, 'tlBuyConstructor');
const callReleaseDriver = httpsCallable(functions, 'tlReleaseDriver');
const callReleaseConstructor = httpsCallable(functions, 'tlReleaseConstructor');
const callChargeReroll = httpsCallable(functions, 'tlChargeReroll');

// Migrates a freshly-loaded garage doc forward to the roster/bench model. The
// roster slot counts are derived on read and NOT persisted from the client
// (slots are server-managed — IAP slot grants happen server-side); only the
// rostered arrays are written back, which is all the rules permit.
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
    !Array.isArray(original.rosteredConstructorIds);
  if (!needsWrite) return;
  // Only the rostered arrays are client-writable; slot counts are derived on
  // read and managed server-side, so we don't persist them here.
  await updateDoc(garageDoc(userId), {
    rosteredDriverIds: migrated.rosteredDriverIds,
    rosteredConstructorIds: migrated.rosteredConstructorIds,
    updatedAt: serverTimestamp(),
  });
}

export const garageService = {
  async getGarage(userId: string): Promise<Garage | null> {
    return withOfflineFallback(`garage:${userId}`, async () => {
      const snap = await getDoc(garageDoc(userId));
      if (!snap.exists()) return null;
      const raw = { id: snap.id, ...snap.data() } as Garage;
      const migrated = migrateGarageShape(raw);
      // Best-effort: the shape migration write can wait for the next online
      // session; a flaky connection must not fail the read.
      await persistMigrationIfNeeded(userId, raw, migrated).catch(() => {});
      return migrated;
    });
  },

  // Silent legacy initial roll (server-rolled, $250). Idempotent.
  async performInitialRoll(userId: string): Promise<Garage> {
    const r = await callInitialRoll();
    return r.data as Garage;
  },

  async releaseDriver(userId: string, driverId: string): Promise<{ refund: number; cashAfter: number }> {
    const r = await callReleaseDriver({ driverId });
    return r.data as { refund: number; cashAfter: number };
  },

  async releaseConstructor(
    userId: string,
    constructorId: string
  ): Promise<{ refund: number; cashAfter: number }> {
    const r = await callReleaseConstructor({ constructorId });
    return r.data as { refund: number; cashAfter: number };
  },

  async buyDriver(userId: string, driver: Driver): Promise<{ cashAfter: number; autoRostered: boolean }> {
    const r = await callBuyDriver({ driverId: driver.id });
    return r.data as { cashAfter: number; autoRostered: boolean };
  },

  async buyConstructor(userId: string, constructor: Constructor): Promise<{ cashAfter: number; autoRostered: boolean }> {
    const r = await callBuyConstructor({ constructorId: constructor.id });
    return r.data as { cashAfter: number; autoRostered: boolean };
  },

  // ---- Roster / bench moves stay client-side: they touch only the rostered
  // arrays, which the rules permit the owner to write. No cash involved. ----
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

  // Onboarding wizard commit — server validates the hand and sets the flat
  // starting bankroll. driverIds/constructorIds come from the (free) opening
  // roll the player locked in. Idempotent.
  async commitRoll(
    userId: string,
    driverIds: string[],
    constructorIds: string[],
    _cashRemaining: number
  ): Promise<Garage> {
    const r = await callCommitRoll({ driverIds, constructorIds });
    return r.data as Garage;
  },

  async chargeReroll(userId: string): Promise<{ cashAfter: number; cost: number }> {
    const r = await callChargeReroll();
    return r.data as { cashAfter: number; cost: number };
  },

  // Append-only transaction log. Server callables write their own entries; this
  // client method only remains for the dev/mock IAP path (USE_REAL_IAP=false).
  // In production the transactions subcollection is create:false, so this is a
  // no-op-at-the-rules-layer — real IAP fulfilment logs server-side.
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
    const payload: Record<string, unknown> = { userId, ...data, timestamp: serverTimestamp() };
    for (const k of Object.keys(payload)) {
      if (payload[k] === undefined) delete payload[k];
    }
    await addDoc(collection(db, 'tl_garages', userId, 'transactions'), payload);
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
  ROLL_STARTING_CASH,
};
