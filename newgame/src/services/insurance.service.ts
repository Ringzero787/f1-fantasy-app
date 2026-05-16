// Insurance service — per-driver insurance for a given race weekend.
// Premium = 7% of driver price (from game-rules.md §8.1). Optional backup
// driver chosen from the player's bench; backup multiplier 1.6x premium.
//
// Triggers: insured driver DNF/DSQ → backup scores at 50% in the started
// driver's place. Settled by tlOnRaceCompleted Cloud Function.

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { garageService } from './garage.service';
import type { RaceInsurance, Driver } from '../types';

const INSURANCE_PCT = 0.07;
const BACKUP_PREMIUM_MULT = 1.6;

const insuranceDoc = (userId: string, raceId: string) =>
  doc(db, 'tl_insurance', `${userId}_${raceId}`);
const garageDoc = (userId: string) => doc(db, 'tl_garages', userId);

export const insuranceService = {
  computePremium(driver: Driver, hasBackup: boolean): number {
    const base = Math.round(driver.price * INSURANCE_PCT);
    return hasBackup ? Math.round(base * BACKUP_PREMIUM_MULT) : base;
  },

  async getForRace(userId: string, raceId: string): Promise<RaceInsurance | null> {
    const snap = await getDoc(insuranceDoc(userId, raceId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as RaceInsurance;
  },

  // Activate insurance on a driver (charges cash, optionally with a backup).
  async activate(args: {
    userId: string;
    raceId: string;
    insuredDriver: Driver;
    backupDriverId: string | null;
  }): Promise<{ premium: number; cashAfter: number }> {
    const premium = this.computePremium(args.insuredDriver, !!args.backupDriverId);

    const result = await runTransaction(db, async (tx) => {
      const garageSnap = await tx.get(garageDoc(args.userId));
      if (!garageSnap.exists()) throw new Error('Garage not found');
      const garage = garageSnap.data();
      const cash = (garage.cash as number | undefined) ?? 0;
      if (cash < premium) {
        throw new Error(`Not enough cash. Need $${premium}, have $${cash}.`);
      }

      // Read existing insurance to handle replacement (refund old premium first).
      const insSnap = await tx.get(insuranceDoc(args.userId, args.raceId));
      const existing = insSnap.exists() ? (insSnap.data() as Omit<RaceInsurance, 'id'>) : null;
      const existingPolicy = existing?.policies?.[args.insuredDriver.id];
      const refund = existingPolicy?.premium ?? 0;

      const newCash = cash - premium + refund;

      // Build new policies map
      const policies = { ...(existing?.policies ?? {}) };
      policies[args.insuredDriver.id] = {
        insuredDriverId: args.insuredDriver.id,
        backupDriverId: args.backupDriverId,
        premium,
        active: true,
        createdAt: new Date(),
      };
      const totalPremium = Object.values(policies).reduce((sum, p) => sum + p.premium, 0);

      tx.set(
        insuranceDoc(args.userId, args.raceId),
        {
          userId: args.userId,
          raceId: args.raceId,
          policies,
          totalPremium,
          createdAt: existing ? existing.createdAt : serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      tx.update(garageDoc(args.userId), {
        cash: newCash,
        updatedAt: serverTimestamp(),
      });
      return { premium, cashAfter: newCash };
    });

    await garageService.recordTransaction(args.userId, {
      type: 'reroll', // reusing the cash-out tx type; could add 'insurance_premium' to TransactionType
      delta: -result.premium,
      cashAfter: result.cashAfter,
      entityId: args.insuredDriver.id,
      entityName: args.insuredDriver.name,
      raceId: args.raceId,
      description: `Insured ${args.insuredDriver.name} for race`,
    });
    return result;
  },

  // Drop insurance on a driver (refunds 80% of premium — house keeps 20%).
  async drop(args: { userId: string; raceId: string; driverId: string }): Promise<{ refund: number; cashAfter: number }> {
    const result = await runTransaction(db, async (tx) => {
      const insSnap = await tx.get(insuranceDoc(args.userId, args.raceId));
      if (!insSnap.exists()) return { refund: 0, cashAfter: 0 };
      const data = insSnap.data() as Omit<RaceInsurance, 'id'>;
      const policy = data.policies?.[args.driverId];
      if (!policy) return { refund: 0, cashAfter: 0 };
      const refund = Math.round(policy.premium * 0.8);

      const garageSnap = await tx.get(garageDoc(args.userId));
      const cash = (garageSnap.data()?.cash as number | undefined) ?? 0;
      const newCash = cash + refund;

      const remainingPolicies = { ...data.policies };
      delete remainingPolicies[args.driverId];
      const totalPremium = Object.values(remainingPolicies).reduce((sum, p) => sum + p.premium, 0);

      if (Object.keys(remainingPolicies).length === 0) {
        tx.delete(insuranceDoc(args.userId, args.raceId));
      } else {
        tx.update(insuranceDoc(args.userId, args.raceId), {
          [`policies.${args.driverId}`]: deleteField(),
          totalPremium,
          updatedAt: serverTimestamp(),
        });
      }
      tx.update(garageDoc(args.userId), {
        cash: newCash,
        updatedAt: serverTimestamp(),
      });
      return { refund, cashAfter: newCash };
    });

    if (result.refund > 0) {
      await garageService.recordTransaction(args.userId, {
        type: 'release_driver', // cash-in pattern
        delta: result.refund,
        cashAfter: result.cashAfter,
        entityId: args.driverId,
        raceId: args.raceId,
        description: `Dropped insurance · 80% refund`,
      });
    }
    return result;
  },
};

export const insuranceConfig = { INSURANCE_PCT, BACKUP_PREMIUM_MULT };
