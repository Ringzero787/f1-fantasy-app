/**
 * League slot packs (owner decision 2026-11-25, F-175): +3 member slots per pack, stackable with no
 * ceiling, bought by the league's owner. Two store products, because a store product has one price:
 *
 *   league.slots3          $4.99   any league           (Play, App Store, Amazon)
 *   league.slots3.charter  $3.99   a chartered league   (Play, App Store; Charter is not on Amazon)
 *
 * In a chartered league every approved member reads Pit Wall, so each extra slot is one more
 * player with Pit Wall: "buy more, get more".
 *
 * Unlike the retired `league.expansion` (+20, a credit the device applied later), a pack is
 * applied by the server when the purchase validates, to the league the purchase names, so there is
 * no client credit and no client write of `maxMembers`. Idempotent on the purchase record.
 */
import * as admin from 'firebase-admin';
import { isUsableLeagueId } from '../utils/leagueId';
import { charterActive } from '../charter/charter';

type Db = FirebaseFirestore.Firestore;

export const SLOT_PACK_PRODUCT = 'league.slots3';
export const SLOT_PACK_CHARTER_PRODUCT = 'league.slots3.charter';
export const SLOTS_PER_PACK = 3;

export const isSlotPack = (productId: unknown): boolean => productId === SLOT_PACK_PRODUCT || productId === SLOT_PACK_CHARTER_PRODUCT;

export type SlotPackRefusal = 'no-league' | 'not-owner';
export type SlotPackResult =
  | { applied: true; leagueId: string; maxMembers: number; replay: boolean; charterPriceOnUnchartered: boolean }
  | { applied: false; reason: SlotPackRefusal };

/** The league's size after one more pack. A missing or broken `maxMembers` counts as the free 22. */
export function nextMaxMembers(current: unknown): number {
  const base = typeof current === 'number' && Number.isFinite(current) && current > 0 ? Math.floor(current) : 22;
  return base + SLOTS_PER_PACK;
}

/**
 * Apply a validated slot-pack purchase to `leagueId`. The purchase record is the idempotency key:
 * once applied it is never applied again, and a replay reports the league it went to. A refusal is
 * recorded on the purchase (the buyer has paid) for support, not thrown.
 */
export async function applySlotPack(db: Db, purchaseId: string, buyerId: string, leagueId: unknown, productId: string, now = Date.now()): Promise<SlotPackResult> {
  const purchaseRef = db.collection('purchases').doc(purchaseId);
  return db.runTransaction(async (tx) => {
    const purchase = (await tx.get(purchaseRef)).data() ?? {};
    if (purchase.slotsApplied === true && typeof purchase.appliedToLeagueId === 'string') {
      const l = (await tx.get(db.doc(`leagues/${purchase.appliedToLeagueId}`))).data();
      return { applied: true as const, leagueId: purchase.appliedToLeagueId, maxMembers: (l?.maxMembers as number) ?? 0, replay: true, charterPriceOnUnchartered: false };
    }
    // The league first recorded on the purchase wins over one sent on a replay.
    const target = typeof purchase.leagueId === 'string' ? purchase.leagueId : leagueId;
    if (typeof target !== 'string' || !isUsableLeagueId(target)) {
      tx.set(purchaseRef, { slotsApplied: false, slotsRefused: 'no-league' }, { merge: true });
      return { applied: false as const, reason: 'no-league' as const };
    }
    const leagueRef = db.doc(`leagues/${target}`);
    const league = (await tx.get(leagueRef)).data();
    if (!league || league.ownerId !== buyerId) {
      const reason: SlotPackRefusal = league ? 'not-owner' : 'no-league';
      tx.set(purchaseRef, { leagueId: target, slotsApplied: false, slotsRefused: reason }, { merge: true });
      return { applied: false as const, reason };
    }
    const maxMembers = nextMaxMembers(league.maxMembers);
    // The Charter price on a league that is not chartered (a stale screen, a charter that just
    // ended) is applied anyway: the buyer paid, and a $1 difference is not worth a refund. Logged.
    const charterPriceOnUnchartered = productId === SLOT_PACK_CHARTER_PRODUCT && !charterActive(league, now);
    // `paidSlots` is the server's own count of slots bought (charterCap reads it); maxMembers can
    // also be raised from released builds, so it is not proof of payment.
    const paidSlots = (typeof league.paidSlots === 'number' && league.paidSlots > 0 ? league.paidSlots : 0) + SLOTS_PER_PACK;
    tx.set(leagueRef, { maxMembers, paidSlots, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    tx.set(purchaseRef, {
      leagueId: target,
      slotsApplied: true,
      status: 'applied',
      appliedToLeagueId: target,
      appliedAt: admin.firestore.FieldValue.serverTimestamp(),
      slots: SLOTS_PER_PACK,
      ...(charterPriceOnUnchartered ? { charterPriceOnUnchartered: true } : {}),
    }, { merge: true });
    return { applied: true as const, leagueId: target, maxMembers, replay: false, charterPriceOnUnchartered };
  });
}
