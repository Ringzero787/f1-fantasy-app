// Per-driver insurance callables. Premium = 7% of driver price (1.6x with a
// backup driver). Server-authoritative pricing + cash. Settled by
// tlOnRaceCompleted (insured DNF/DSQ → backup scores at 50%).

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import {
  INSURANCE_PCT,
  BACKUP_PREMIUM_MULT,
  INSURANCE_DROP_REFUND_PCT,
  requireAuth,
  fail,
  garageRef,
  normaliseGarage,
  recordTransaction,
  getDriver,
  db,
} from './shared';

const insRef = (uid: string, raceId: string) => db.doc(`tl_insurance/${uid}_${raceId}`);

function premiumFor(price: number, hasBackup: boolean): number {
  const base = Math.round(price * INSURANCE_PCT);
  return hasBackup ? Math.round(base * BACKUP_PREMIUM_MULT) : base;
}

export const tlActivateInsurance = functions.https.onCall(
  async (data: { raceId?: string; insuredDriverId?: string; backupDriverId?: string | null }, context) => {
    const uid = requireAuth(context);
    if (!data?.raceId || !data?.insuredDriverId) fail('invalid-argument', 'raceId, insuredDriverId required.');
    const driver = await getDriver(data.insuredDriverId!);
    const backupDriverId = data.backupDriverId ?? null;
    const premium = premiumFor(driver.price, !!backupDriverId);

    return db.runTransaction(async (tx) => {
      const gSnap = await tx.get(garageRef(uid));
      if (!gSnap.exists) fail('not-found', 'Garage not found.');
      const g = normaliseGarage(gSnap.data()!);

      const iSnap = await tx.get(insRef(uid, data.raceId!));
      const existing = iSnap.exists ? (iSnap.data() as admin.firestore.DocumentData) : null;
      const existingPolicy = existing?.policies?.[driver.id];
      const refund = (existingPolicy?.premium as number | undefined) ?? 0;

      const effectiveCash = g.cash + refund;
      if (effectiveCash < premium) fail('failed-precondition', `Not enough cash. Need $${premium}, have $${g.cash}.`);
      const newCash = effectiveCash - premium;

      const policies = { ...(existing?.policies ?? {}) };
      policies[driver.id] = {
        insuredDriverId: driver.id,
        backupDriverId,
        premium,
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const totalPremium = Object.values(policies).reduce(
        (s: number, p) => s + ((p as { premium: number }).premium ?? 0),
        0,
      );

      tx.set(
        insRef(uid, data.raceId!),
        {
          userId: uid,
          raceId: data.raceId,
          policies,
          totalPremium,
          createdAt: existing?.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.update(garageRef(uid), { cash: newCash, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      recordTransaction(tx, uid, {
        type: 'insurance',
        delta: -premium,
        cashAfter: newCash,
        entityId: driver.id,
        entityName: driver.name,
        raceId: data.raceId,
        description: `Insured ${driver.name} for race`,
      });
      return { premium, cashAfter: newCash };
    });
  },
);

export const tlDropInsurance = functions.https.onCall(
  async (data: { raceId?: string; driverId?: string }, context) => {
    const uid = requireAuth(context);
    if (!data?.raceId || !data?.driverId) fail('invalid-argument', 'raceId, driverId required.');
    return db.runTransaction(async (tx) => {
      const iSnap = await tx.get(insRef(uid, data.raceId!));
      if (!iSnap.exists) return { refund: 0, cashAfter: 0 };
      const ins = iSnap.data() as admin.firestore.DocumentData;
      const policy = ins.policies?.[data.driverId!];
      if (!policy) return { refund: 0, cashAfter: 0 };
      const refund = Math.round((policy.premium as number) * INSURANCE_DROP_REFUND_PCT);

      const gSnap = await tx.get(garageRef(uid));
      if (!gSnap.exists) fail('not-found', 'Garage not found.');
      const g = normaliseGarage(gSnap.data()!);
      const newCash = g.cash + refund;

      const remaining = { ...ins.policies };
      delete remaining[data.driverId!];
      const totalPremium = Object.values(remaining).reduce(
        (s: number, p) => s + ((p as { premium: number }).premium ?? 0),
        0,
      );

      if (Object.keys(remaining).length === 0) {
        tx.delete(insRef(uid, data.raceId!));
      } else {
        tx.update(insRef(uid, data.raceId!), {
          [`policies.${data.driverId}`]: admin.firestore.FieldValue.delete(),
          totalPremium,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      tx.update(garageRef(uid), { cash: newCash, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      recordTransaction(tx, uid, {
        type: 'insurance_refund',
        delta: refund,
        cashAfter: newCash,
        entityId: data.driverId,
        raceId: data.raceId,
        description: 'Dropped insurance · 80% refund',
      });
      return { refund, cashAfter: newCash };
    });
  },
);
