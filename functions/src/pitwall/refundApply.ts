/**
 * What a definite store refund takes back (F-085, F-175). One place for it, so the daily sweep
 * (Play, Amazon, legacy Apple receipts) and the App Store refund notification (StoreKit 2) agree.
 *
 * Callers decide that a purchase WAS refunded; this decides what that purchase paid for and takes
 * back only that: the pass it granted, the charter it bought, or the slots it added. Each path
 * writes `status: 'refunded'` on the purchase last, so a failure part-way leaves the purchase in
 * the sweep's query and it is tried again.
 */
import * as admin from 'firebase-admin';
import { PASS_PRODUCT } from './pass';
import { revokePass } from './passStore';
import { CHARTER_PRODUCT } from '../charter/charter';
import { clearCharter, markRefunded } from '../charter/charterStore';
import { SLOT_PACK_CHARTER_PRODUCT, SLOT_PACK_PRODUCT } from '../purchases/slotPack';
import { isKnownProduct } from '../purchases/productGuards';
import { purchaseIdFor } from '../purchases/purchaseId';

type Db = FirebaseFirestore.Firestore;
type Ref = FirebaseFirestore.DocumentReference;

export type RefundOutcome =
  | 'revoked' | 'superseded' | 'no-pass' | 'no-user'
  | 'uncharted' | 'charter-recorded'
  | 'unslotted'
  | 'already' | 'not-ours'
  /** App Store: refunded before the app validated it; a refunded record now blocks a replay */
  | 'tombstone';

const refundedNow = () => ({ status: 'refunded', refundedAt: admin.firestore.FieldValue.serverTimestamp() });

/** Only the pass this purchase granted is taken: the buyer may have bought again since. */
async function refundPass(db: Db, doc: Ref, purchase: Record<string, unknown>, reason: string): Promise<RefundOutcome> {
  const uid = String(purchase.userId ?? '');
  if (!uid) return 'no-user';

  // A refund is about one transaction, and the user may well have bought again since: refund,
  // repurchase, and the new pass is live under a different purchase document. Revoking on the
  // user id alone would reach the wrong one, delete a pass somebody had just paid for, and not
  // heal — validatePurchase answers a replayed receipt with `duplicate: true` before it ever
  // reaches the grant. The same shape across seasons: a late refund of last year's purchase
  // taking this year's pass. grantPass records the purchase it came from in `pass.ref`.
  const pass = (await db.doc(`users/${uid}`).get()).data()?.pass as { ref?: string | null } | undefined;
  if (!pass) {
    // Nothing to take. Mark it so the refund is recorded and the sweep stops re-asking.
    await doc.set(refundedNow(), { merge: true });
    return 'no-pass';
  }
  if (pass.ref !== doc.id) {
    // The live pass was paid for by something else. Record the refund, leave the pass, and say
    // so — this is the case worth seeing in a log rather than silently skipping.
    await doc.set({ ...refundedNow(), supersededBy: pass.ref ?? null }, { merge: true });
    console.log(`[refunds] ${uid} refunded ${doc.id} but holds a pass from ${pass.ref ?? 'elsewhere'}; left alone`);
    return 'superseded';
  }

  // Revoke first, then mark. The other order looked safer and was not: the sweep selects
  // `status == validated`, so a document marked before a revoke that then failed would drop
  // out of scope forever and the refunded pass would survive with nothing to surface it.
  await revokePass(db, uid, reason);
  await doc.set(refundedNow(), { merge: true });
  console.log(`[refunds] revoked the pass for ${uid} (${reason})`);
  return 'revoked';
}

/** A refunded charter clears that league's charter and its members' access; never anyone's pass. */
async function refundCharter(db: Db, doc: Ref, purchase: Record<string, unknown>, reason: string): Promise<RefundOutcome> {
  const leagueId = typeof purchase.charterLeagueId === 'string' ? purchase.charterLeagueId : null;
  // Clear first, then mark, for the reason given for the pass. clearCharter only touches a
  // charter this purchase paid for (its ref is the purchase id).
  const cleared = leagueId ? await clearCharter(db, { leagueId, ref: doc.id, reason }) : false;
  // Not applied (refused, or never sent a league): record the refund anyway, so a later
  // replay of this receipt can never charter.
  if (!leagueId) await markRefunded(db, doc.id, reason);
  await doc.set(refundedNow(), { merge: true });
  console.log(`[refunds] charter purchase ${doc.id} refunded${leagueId ? ` (league ${leagueId})` : ''} (${reason})`);
  return cleared ? 'uncharted' : 'charter-recorded';
}

/**
 * Slot packs (owner decision 2026-11-25): an applied pack that the store refunded takes its slots
 * back out of `paidSlots`, so a charter no longer covers them. maxMembers is left as it is:
 * approved players are not removed, and an ordinary league's size is free anyway.
 */
async function refundSlotPack(db: Db, doc: Ref, purchase: Record<string, unknown>): Promise<RefundOutcome> {
  const leagueId = typeof purchase.appliedToLeagueId === 'string' ? purchase.appliedToLeagueId : null;
  const slots = typeof purchase.slots === 'number' ? purchase.slots : 3;
  const done = await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(doc)).data();
    if (fresh?.status === 'refunded') return false;
    if (fresh?.status !== 'applied' || fresh?.slotsApplied !== true) {
      // Validated but never applied (refused, no league): record the refund so a replay never applies it.
      tx.set(doc, refundedNow(), { merge: true });
      return true;
    }
    if (leagueId) {
      const leagueRef = db.doc(`leagues/${leagueId}`);
      const league = (await tx.get(leagueRef)).data();
      if (league) tx.set(leagueRef, { paidSlots: Math.max(0, (typeof league.paidSlots === 'number' ? league.paidSlots : 0) - slots) }, { merge: true });
    }
    tx.set(doc, refundedNow(), { merge: true });
    return true;
  });
  if (done) console.log(`[refunds] slot pack ${doc.id} refunded${leagueId ? ` (league ${leagueId}, -${slots} paid slots)` : ''}`);
  return done ? 'unslotted' : 'already';
}

/**
 * Take back what one refunded purchase paid for. `purchase` is the purchase document's data.
 * A purchase already marked refunded is left alone, so a repeated notification is a no-op.
 */
export async function refundPurchase(db: Db, doc: Ref, purchase: Record<string, unknown>, reason: string): Promise<RefundOutcome> {
  if (purchase.status === 'refunded') return 'already';
  const productId = String(purchase.productId ?? '');
  if (productId === PASS_PRODUCT) return refundPass(db, doc, purchase, reason);
  if (productId === CHARTER_PRODUCT) return refundCharter(db, doc, purchase, reason);
  if (productId === SLOT_PACK_PRODUCT || productId === SLOT_PACK_CHARTER_PRODUCT) return refundSlotPack(db, doc, purchase);
  return 'not-ours';
}

/**
 * A StoreKit 2 refund from App Store Server Notifications (appleNotifications.ts): find the purchase
 * by the id validatePurchase writes (or, for records older than that id, by the transaction field)
 * and take back what it paid for.
 */
export async function refundAppleTransaction(db: Db, a: { transactionId: string; productId: string; reason: string }): Promise<RefundOutcome> {
  const id = purchaseIdFor('ios', a.transactionId);
  let doc = db.collection('purchases').doc(id);
  let snap = await doc.get();
  if (!snap.exists) {
    const byField = await db.collection('purchases').where('storeTransactionId', '==', a.transactionId).where('platform', '==', 'ios').limit(1).get();
    if (!byField.empty) { doc = byField.docs[0].ref; snap = byField.docs[0]; }
  }
  if (snap.exists) return refundPurchase(db, doc, snap.data() ?? {}, a.reason);
  // Refunded before the app ever validated it. For a product we sell, leave a refunded record under
  // the id a later validation would use, so replaying the old transaction is refused, never granted.
  if (!isKnownProduct(a.productId)) return 'not-ours';
  try {
    // create, not set: if validation wins the race and writes the purchase first, take back what it granted.
    await doc.create({ status: 'refunded', productId: a.productId, platform: 'ios', storeTransactionId: a.transactionId, refundedBeforeValidation: true, refundedAt: admin.firestore.FieldValue.serverTimestamp() });
  } catch (err) {
    const code = (err as { code?: number | string } | null)?.code;
    if (code !== 6 && code !== 'already-exists') throw err;
    const fresh = await doc.get();
    return refundPurchase(db, doc, fresh.data() ?? {}, a.reason);
  }
  if (a.productId === CHARTER_PRODUCT) await markRefunded(db, id, a.reason);
  return 'tombstone';
}
