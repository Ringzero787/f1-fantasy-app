/**
 * Writing entitlements (F-068). Every path into a pass — Stripe, a store purchase, an admin
 * grant, a league trial — ends here, so the rules for what a pass does live in one place.
 */
import * as admin from 'firebase-admin';
import { mergePass, newPass, passClaim, PASS_CLAIM, trialPass, type Pass, type PassSource } from './pass';

/**
 * This module writes Firestore only. The auth claim that gates paid payloads is stamped by the
 * `onUserPassWritten` trigger in index.ts, which fires on every change to `users/{uid}.pass`
 * whatever wrote it: Stripe, a store purchase, an admin grant or a support fix. One owner for the
 * claim means it can never drift from the document, and this module stays testable without auth.
 */

type Db = FirebaseFirestore.Firestore;

/** True when this reference has already been applied, so a replayed webhook is a no-op. */
export async function alreadyApplied(db: Db, ref: string): Promise<boolean> {
  return (await db.collection('pw_grants').doc(ref).get()).exists;
}

/**
 * Grant a pass and everything derived from it, in one transaction:
 * the user's pass field, the `pro` flag on every league they own, and a grant record for idempotency.
 * The auth claim is stamped afterwards (it is not transactional).
 */
export async function grantPass(db: Db, uid: string, season: string, source: PassSource, ref: string | null, now = Date.now()): Promise<Pass> {
  const userRef = db.doc(`users/${uid}`);
  const grantRef = ref ? db.collection('pw_grants').doc(ref) : null;
  const pass = await db.runTransaction(async (tx) => {
    // Firestore requires every read before any write, so both reads happen up front.
    const [userSnap, grantSnap] = await Promise.all([tx.get(userRef), grantRef ? tx.get(grantRef) : Promise.resolve(null)]);
    const existing = userSnap.data()?.pass as Partial<Pass> | undefined;
    // A retried webhook (same event id) must not extend or re-date the pass it already created.
    if (grantSnap?.exists) return (existing ?? newPass(season, source, now, ref)) as Pass;
    const next = mergePass(existing, newPass(season, source, now, ref));
    if (grantRef) tx.set(grantRef, { uid, season, source, at: now });
    tx.set(userRef, { pass: next }, { merge: true });
    return next;
  });
  await markOwnedLeaguesPro(db, uid, pass);
  return pass;
}

/** A member of a Pro league may take one trial, once, ever. */
export async function grantTrial(db: Db, uid: string, season: string, now = Date.now()): Promise<Pass | null> {
  const userRef = db.doc(`users/${uid}`);
  const pass = await db.runTransaction(async (tx) => {
    const user = (await tx.get(userRef)).data() ?? {};
    if (user.pwTrialUsed === true) return null;
    const existing = user.pass as Partial<Pass> | undefined;
    if (existing && typeof existing.expiresAt === 'number' && existing.expiresAt > now) return null;
    const next = trialPass(season, now);
    tx.set(userRef, { pass: next, pwTrialUsed: true }, { merge: true });
    return next;
  });
  return pass;
}

export async function revokePass(db: Db, uid: string, reason: string, now = Date.now()): Promise<void> {
  await db.doc(`users/${uid}`).set({ pass: admin.firestore.FieldValue.delete(), pwRevoked: { at: now, reason } }, { merge: true });
  const leagues = await db.collection('leagues').where('ownerId', '==', uid).get();
  const batch = db.batch();
  leagues.docs.forEach((l) => batch.set(l.ref, { pro: false }, { merge: true }));
  if (!leagues.empty) await batch.commit();
}

/**
 * Mirror the pass into the auth token so Firestore rules gate paid payloads without an extra read.
 * Called only by the onUserPassWritten trigger (see the note at the top of this file).
 */
export async function stampClaim(uid: string, pass: Partial<Pass> | null): Promise<void> {
  const user = await admin.auth().getUser(uid);
  const claims = { ...(user.customClaims ?? {}) };
  const value = passClaim(pass);
  if (value === null) delete claims[PASS_CLAIM]; else claims[PASS_CLAIM] = value;
  await admin.auth().setCustomUserClaims(uid, claims);
}

/** League Pro is derived, never bought: every league this user owns is Pro while their pass lasts. */
export async function markOwnedLeaguesPro(db: Db, uid: string, pass: Pass): Promise<number> {
  const leagues = await db.collection('leagues').where('ownerId', '==', uid).get();
  if (leagues.empty) return 0;
  const batch = db.batch();
  leagues.docs.forEach((l) => batch.set(l.ref, { pro: true, proUntil: pass.expiresAt }, { merge: true }));
  await batch.commit();
  return leagues.size;
}

/** Daily sweep: drop expired passes and their claims, and un-Pro their leagues. */
export async function expirePasses(db: Db, now = Date.now()): Promise<number> {
  const snap = await db.collection('users').where('pass.expiresAt', '<=', now).limit(500).get();
  for (const doc of snap.docs) await revokePass(db, doc.id, 'expired', now);
  return snap.size;
}
