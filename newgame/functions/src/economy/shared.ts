// Shared server-side economy helpers. All cash-mutating game operations live in
// Cloud Functions (see garageCallables / betCallables / insuranceCallables) so
// the player's bankroll is server-authoritative — the client can never write
// cash/owned/points directly (see firestore.rules: tl_garages).
//
// Constants here MUST stay in sync with the client display constants in
// src/services/{garage,bets,insurance}.service.ts. The client keeps its copies
// only for previews (e.g. "Max stake", payout-if-win); the server values are
// the ones that actually move money.

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ---- Economy constants (authoritative) -----------------------------------
export const STARTING_CASH = 250;
export const RELEASE_REFUND_PCT = 0.75;
export const REROLL_BASE_COST = 5;
export const ROSTER_DRIVER_SLOTS = 4;
export const ROSTER_CONSTRUCTOR_SLOTS = 2;

export const POLE_ODDS: Record<'A' | 'B' | 'C', number> = { A: 2, B: 5, C: 15 };
export const STAKE_MAX_PCT = 0.25;
export const BET_CANCEL_REFUND_PCT = 0.8;

export const INSURANCE_PCT = 0.07;
export const BACKUP_PREMIUM_MULT = 1.6;
export const INSURANCE_DROP_REFUND_PCT = 0.8;

// ---- Types ----------------------------------------------------------------
export interface Garage {
  cash: number;
  totalCashEarned: number;
  totalPoints: number;
  ownedDriverIds: string[];
  ownedConstructorIds: string[];
  rosteredDriverIds: string[];
  rosteredConstructorIds: string[];
  rosterDriverSlots: number;
  rosterConstructorSlots: number;
  raceWinStreak: number;
  raceLossStreak: number;
  lastStreakRaceId?: string;
}

export type TransactionType =
  | 'initial_roll'
  | 'reroll'
  | 'buy_driver'
  | 'buy_constructor'
  | 'release_driver'
  | 'release_constructor'
  | 'race_payout'
  | 'streak_bonus'
  | 'interest'
  | 'bet'
  | 'bet_refund'
  | 'bet_payout'
  | 'insurance'
  | 'insurance_refund';

// ---- Auth + doc helpers ---------------------------------------------------
export function requireAuth(context: functions.https.CallableContext): string {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign-in required.');
  }
  return uid;
}

export function fail(
  code: functions.https.FunctionsErrorCode,
  message: string,
): never {
  throw new functions.https.HttpsError(code, message);
}

export const garageRef = (uid: string) => db.doc(`tl_garages/${uid}`);

// Server-authoritative session lock. Picks and side-bets must be placed BEFORE
// the session that decides them starts; the client clock is never trusted, so
// every cash-moving placement re-checks the race's own schedule here.
//   pole bet      → 'qualifying' (pole is decided in qualifying)
//   league bet    → 'race'       (decided by race-day lineup scores)
//   pick (q/r/s)  → that same session
// A missing race/session time is treated as OPEN (mirrors the client's
// isScopeLocked fallback); a completed/cancelled race is always closed.
export async function assertSessionOpen(
  raceId: string,
  session: 'qualifying' | 'race' | 'sprint',
): Promise<void> {
  const snap = await db.doc(`races/${raceId}`).get();
  if (!snap.exists) fail('not-found', 'Race not found.');
  const race = snap.data()!;
  if (race.status === 'completed' || race.status === 'cancelled') {
    fail('failed-precondition', 'This race is closed.');
  }
  const start = (race.schedule as Record<string, unknown> | undefined)?.[session];
  const startMs =
    start && typeof (start as { toMillis?: () => number }).toMillis === 'function'
      ? (start as { toMillis: () => number }).toMillis()
      : null;
  if (startMs != null && Date.now() >= startMs) {
    fail('failed-precondition', `The ${session} session is locked — it has already started.`);
  }
}

// Normalise an older garage doc to the roster/bench shape (mirrors the client's
// migrateGarageShape) so server transactions never read undefined arrays.
export function normaliseGarage(raw: admin.firestore.DocumentData): Garage {
  const owned = (raw.ownedDriverIds as string[] | undefined) ?? [];
  const ownedC = (raw.ownedConstructorIds as string[] | undefined) ?? [];
  return {
    cash: (raw.cash as number | undefined) ?? 0,
    totalCashEarned: (raw.totalCashEarned as number | undefined) ?? 0,
    totalPoints: (raw.totalPoints as number | undefined) ?? 0,
    ownedDriverIds: owned,
    ownedConstructorIds: ownedC,
    rosteredDriverIds:
      (raw.rosteredDriverIds as string[] | undefined) ?? owned.slice(0, ROSTER_DRIVER_SLOTS),
    rosteredConstructorIds:
      (raw.rosteredConstructorIds as string[] | undefined) ?? ownedC.slice(0, ROSTER_CONSTRUCTOR_SLOTS),
    rosterDriverSlots: (raw.rosterDriverSlots as number | undefined) ?? ROSTER_DRIVER_SLOTS,
    rosterConstructorSlots:
      (raw.rosterConstructorSlots as number | undefined) ?? ROSTER_CONSTRUCTOR_SLOTS,
    raceWinStreak: (raw.raceWinStreak as number | undefined) ?? 0,
    raceLossStreak: (raw.raceLossStreak as number | undefined) ?? 0,
    lastStreakRaceId: raw.lastStreakRaceId as string | undefined,
  };
}

// Append a transaction-log entry. The client can only read this subcollection;
// all appends come from the server (firestore.rules: transactions create:false).
export function recordTransaction(
  tx: admin.firestore.Transaction | null,
  uid: string,
  data: {
    type: TransactionType;
    delta: number;
    cashAfter: number;
    entityId?: string;
    entityName?: string;
    raceId?: string;
    description: string;
  },
): void {
  const ref = db.collection(`tl_garages/${uid}/transactions`).doc();
  const payload: admin.firestore.DocumentData = {
    userId: uid,
    ...data,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  };
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  if (tx) {
    tx.set(ref, payload);
  } else {
    void ref.set(payload);
  }
}

// ---- Pricing lookups (drivers/constructors are Undercut-owned, read-only) --
export interface PricedDriver {
  id: string;
  name: string;
  shortName?: string;
  price: number;
  tier: 'A' | 'B' | 'C';
}
export interface PricedConstructor {
  id: string;
  name: string;
  shortName?: string;
  price: number;
}

export async function getDriver(id: string): Promise<PricedDriver> {
  const snap = await db.doc(`drivers/${id}`).get();
  if (!snap.exists) fail('not-found', 'Driver not found.');
  const d = snap.data() as admin.firestore.DocumentData;
  return {
    id: snap.id,
    name: (d.name as string) ?? snap.id,
    shortName: d.shortName as string | undefined,
    price: (d.price as number | undefined) ?? 0,
    tier: (d.tier as 'A' | 'B' | 'C' | undefined) ?? 'B',
  };
}

export async function getConstructor(id: string): Promise<PricedConstructor> {
  const snap = await db.doc(`constructors/${id}`).get();
  if (!snap.exists) fail('not-found', 'Constructor not found.');
  const d = snap.data() as admin.firestore.DocumentData;
  return {
    id: snap.id,
    name: (d.name as string) ?? snap.id,
    shortName: d.shortName as string | undefined,
    price: (d.price as number | undefined) ?? 0,
  };
}

// ---- Rarity (ported from src/utils/rarity.ts) -----------------------------
export function pickWeighted<T>(items: T[], weightFn: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weightFn(item), 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (const item of items) {
    r -= weightFn(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

export function pickN<T>(items: T[], n: number, weightFn: (item: T) => number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < n && pool.length > 0) {
    const choice = pickWeighted(pool, weightFn);
    picked.push(choice);
    pool.splice(pool.indexOf(choice), 1);
  }
  return picked;
}

export function rollInitialDriverMix(): { a: number; b: number; c: number } {
  const variants = [
    { a: 1, b: 2, c: 1 },
    { a: 1, b: 1, c: 2 },
    { a: 2, b: 1, c: 1 },
    { a: 1, b: 3, c: 0 },
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

export { db };
