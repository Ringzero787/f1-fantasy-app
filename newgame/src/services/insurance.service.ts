// Insurance service — per-driver insurance for a given race weekend.
// Premium = 7% of driver price (1.6x with a backup driver).
//
// All cash-moving operations are server-authoritative Cloud Function callables
// (functions/src/economy/insuranceCallables.ts) — premium pricing and the cash
// debit/refund happen server-side. The methods below keep their old signatures
// so the insurance sheet is unchanged; they delegate to the callable. The
// constants here are kept for client-side previews only and are NOT
// authoritative.
//
// Settlement: insured driver DNF/DSQ → backup scores at 50% (tlOnRaceCompleted).

import { doc, getDoc } from 'firebase/firestore';
import { db, functions, httpsCallable } from '../config/firebase';
import type { RaceInsurance, Driver } from '../types';

const INSURANCE_PCT = 0.07;
const BACKUP_PREMIUM_MULT = 1.6;

const insuranceDoc = (userId: string, raceId: string) =>
  doc(db, 'tl_insurance', `${userId}_${raceId}`);

const callActivate = httpsCallable(functions, 'tlActivateInsurance');
const callDrop = httpsCallable(functions, 'tlDropInsurance');

export const insuranceService = {
  // Client-side preview only — the server recomputes the premium authoritatively.
  computePremium(driver: Driver, hasBackup: boolean): number {
    const base = Math.round(driver.price * INSURANCE_PCT);
    return hasBackup ? Math.round(base * BACKUP_PREMIUM_MULT) : base;
  },

  async getForRace(userId: string, raceId: string): Promise<RaceInsurance | null> {
    const snap = await getDoc(insuranceDoc(userId, raceId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as RaceInsurance;
  },

  async activate(args: {
    userId: string;
    raceId: string;
    insuredDriver: Driver;
    backupDriverId: string | null;
  }): Promise<{ premium: number; cashAfter: number }> {
    const r = await callActivate({
      raceId: args.raceId,
      insuredDriverId: args.insuredDriver.id,
      backupDriverId: args.backupDriverId,
    });
    return r.data as { premium: number; cashAfter: number };
  },

  async drop(args: { userId: string; raceId: string; driverId: string }): Promise<{ refund: number; cashAfter: number }> {
    const r = await callDrop({ raceId: args.raceId, driverId: args.driverId });
    return r.data as { refund: number; cashAfter: number };
  },
};

export const insuranceConfig = { INSURANCE_PCT, BACKUP_PREMIUM_MULT };
