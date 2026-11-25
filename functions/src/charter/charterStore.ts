/**
 * Writing Charter (F-175, slice 2). Every path into a charter — a Play or Apple purchase through
 * validatePurchase, a Stripe checkout through the webhook — ends at `grantCharter`, and every way
 * out — a store refund, a Stripe refund or dispute, the season ending — ends at `clearCharter`.
 *
 * Never `grantPass` or `revokePass` here (BUILD.md, "The entitlement trap"): a charter writes
 * `leagues/{id}.charter` and each member's `users/{uid}.charterAccess`, and never `users/{uid}.pass`.
 * The `pw` claim follows `charterAccess` through the onUserPassWritten trigger.
 *
 * `charter_grants/{ref}` is the idempotency and support record, one per paid purchase. It is
 * server-only (firestore.rules) and is how a replay of a refunded purchase is told apart from a
 * new one: a cleared grant is never granted again.
 */
import * as admin from 'firebase-admin';
import { seasonExpiry, passActive, type Pass } from '../pitwall/pass';
import {
  charterActive,
  charterGrantDecision,
  charterLeaguePatch,
  charterMemberIds,
  newCharter,
  ownerProPatch,
  type Charter,
  type CharterRefusal,
  type CharterSource,
} from './charter';
import { isUsableLeagueId } from '../utils/leagueId';
import { searchPoints } from './membership';

type Db = FirebaseFirestore.Firestore;

export interface GrantCharterInput {
  leagueId: unknown;
  buyerId: string;
  season: string;
  source: CharterSource;
  /** the purchase this charter is paid by: purchases/{id} for a store, `stripe:{payment_intent}` for Stripe */
  ref: string;
  now?: number;
}

export type GrantCharterResult =
  | { applied: true; leagueId: string; charter: Charter; members: number; replay: boolean }
  | { applied: false; reason: CharterRefusal };

const grantRef = (db: Db, ref: string) => db.collection('charter_grants').doc(ref.replace(/\//g, '_'));

/**
 * Charter one league for one season, and give every approved member (and the owner) access.
 * Idempotent on `ref`. A refusal is recorded, not thrown: the buyer has paid by the time this runs,
 * and the record is what support refunds from.
 */
export async function grantCharter(db: Db, i: GrantCharterInput): Promise<GrantCharterResult> {
  const now = i.now ?? Date.now();
  const record = grantRef(db, i.ref);
  if (typeof i.leagueId !== 'string' || !isUsableLeagueId(i.leagueId)) {
    await record.set({ leagueId: null, buyerId: i.buyerId, season: i.season, source: i.source, refusedAt: now, refused: 'no-league' }, { merge: true });
    return { applied: false, reason: 'no-league' };
  }
  const outcome = await db.runTransaction(async (tx) => {
    const recordSnap = await tx.get(record);
    const rec = recordSnap.exists ? recordSnap.data() : undefined;
    // A purchase whose charter was taken back (refund, dispute) never charters again: a replayed
    // receipt must not undo a refund.
    if (rec?.clearedAt) return { applied: false as const, reason: 'refunded' as const };
    // One purchase, one league. Once this purchase has chartered a league, a replay naming another
    // league is answered with the first one: parallel replays with different league ids conflict on
    // this record, and the retry lands here.
    const leagueId = rec?.grantedAt && typeof rec.leagueId === 'string' ? rec.leagueId : (i.leagueId as string);
    const leagueRef = db.doc(`leagues/${leagueId}`);
    const leagueSnap = await tx.get(leagueRef);
    const league = leagueSnap.exists ? leagueSnap.data() : null;
    const [members, ownerSnap] = await Promise.all([
      tx.get(leagueRef.collection('members')),
      typeof league?.ownerId === 'string' ? tx.get(db.doc(`users/${league.ownerId}`)) : Promise.resolve(null),
    ]);
    const ids = charterMemberIds(league?.ownerId, members.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: d.id, status: d.data()?.status })));
    const decision = charterGrantDecision({ league, buyerId: i.buyerId, season: i.season, ref: i.ref, now, memberCount: ids.length });
    if (decision.kind === 'refuse') {
      tx.set(record, { leagueId, buyerId: i.buyerId, season: i.season, source: i.source, refusedAt: now, refused: decision.reason }, { merge: true });
      return { applied: false as const, reason: decision.reason };
    }
    if (decision.kind === 'replay') {
      return { applied: true as const, leagueId, charter: league!.charter as Charter, ids, replay: true };
    }
    const charter = newCharter(i.season, i.buyerId, i.source, i.ref, now, seasonExpiry(i.season));
    const ownerPass = ownerSnap?.data()?.pass as Partial<Pass> | undefined;
    tx.set(leagueRef, {
      ...charterLeaguePatch(charter, passActive(ownerPass, now) ? (ownerPass!.expiresAt as number) : null),
      // slice 3: the search order starts from the approved members' totals at the moment of purchase
      searchPoints: searchPoints(members.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => d.data())),
    }, { merge: true });
    tx.set(record, { leagueId, buyerId: i.buyerId, season: i.season, source: i.source, grantedAt: now, expiresAt: charter.expiresAt }, { merge: true });
    return { applied: true as const, leagueId, charter, ids, replay: false };
  });
  if (!outcome.applied) return outcome;

  // Access for the members, outside the transaction: each write is an idempotent merge of the same
  // value, so a retry, or a replay, converges. Approval changes after this are slice 3's trigger.
  const { leagueId, ids } = outcome;
  await setAccess(db, ids, leagueId, outcome.charter.expiresAt);
  return { applied: true, leagueId, charter: outcome.charter, members: ids.length, replay: outcome.replay };
}

/** `users/{uid}.charterAccess.leagues[leagueId] = expiresAt` for each uid. Never touches `pass`. */
async function setAccess(db: Db, uids: string[], leagueId: string, expiresAt: number): Promise<void> {
  for (let k = 0; k < uids.length; k += 400) {
    const batch = db.batch();
    for (const uid of uids.slice(k, k + 400)) {
      batch.set(db.doc(`users/${uid}`), { charterAccess: { leagues: { [leagueId]: expiresAt } } }, { merge: true });
    }
    await batch.commit();
  }
}

/** Record that a purchase was refunded when there is no league to clear (a dispute with no grant yet). */
export async function markRefunded(db: Db, ref: string, reason: string, now = Date.now()): Promise<void> {
  await grantRef(db, ref).set({ clearedAt: now, clearedReason: reason }, { merge: true });
}

export interface ClearCharterInput {
  leagueId: string;
  /** Only the charter this purchase paid for is cleared; null clears whatever is there (expiry, support). */
  ref: string | null;
  reason: string;
  now?: number;
}

/**
 * Take a charter back: refund, dispute or expiry (BUILD.md, "League document").
 * Clears `charter` and `chartered`, turns approval and public listing off, and removes the league
 * from every member's `charterAccess`. Members stay in the league; a personal pass stays. League
 * Pro falls back to what the owner's own pass gives (ownerProPatch). Never calls `revokePass`.
 *
 * A refund of an older purchase does not clear a charter a newer purchase paid for: `ref` must
 * match the charter on the league. Returns false when there was nothing of this purchase's to clear.
 *
 * Retryable: the league is cleared in a transaction and members' access after it, so a failure in
 * between would leave access behind. A retry for the same purchase therefore finishes the access
 * sweep whenever that purchase's grant record says it was cleared and the league is not chartered
 * again by someone else — it does not stop at "nothing to clear".
 */
export async function clearCharter(db: Db, i: ClearCharterInput): Promise<boolean> {
  const now = i.now ?? Date.now();
  if (!isUsableLeagueId(i.leagueId)) return false;
  const leagueRef = db.doc(`leagues/${i.leagueId}`);
  const del = admin.firestore.FieldValue.delete();

  const cleared = await db.runTransaction(async (tx) => {
    const snap = await tx.get(leagueRef);
    const recSnap = i.ref !== null ? await tx.get(grantRef(db, i.ref)) : null;
    const league = snap.exists ? snap.data() : null;
    const charter = league?.charter as Partial<Charter> | undefined;
    if (!league || !charter || (i.ref !== null && charter.ref !== i.ref)) {
      // Nothing of this purchase's is live: the refund still counts. Recording it is what stops a
      // grant that arrives after its own refund (out-of-order webhooks, a replayed receipt).
      if (i.ref !== null && !recSnap?.data()?.clearedAt) {
        tx.set(grantRef(db, i.ref), { leagueId: recSnap?.data()?.leagueId ?? i.leagueId, clearedAt: now, clearedReason: i.reason }, { merge: true });
      }
      return false;
    }
    const owner = typeof league.ownerId === 'string' ? (await tx.get(db.doc(`users/${league.ownerId}`))).data() : undefined;
    const pass = owner?.pass as Partial<Pass> | undefined;
    const pro = ownerProPatch(null, passActive(pass, now) ? (pass!.expiresAt as number) : null, now);
    tx.set(leagueRef, {
      charter: del,
      chartered: del,
      isPublic: false,
      settings: { requireApproval: false },
      pro: pro.pro,
      proUntil: pro.proUntil ?? del,
    }, { merge: true });
    if (charter.ref) tx.set(grantRef(db, charter.ref), { clearedAt: now, clearedReason: i.reason }, { merge: true });
    return true;
  });
  if (!cleared) {
    if (i.ref === null) return false;
    // Finish a sweep an earlier attempt for this purchase started (see above).
    const [grant, now2] = await Promise.all([grantRef(db, i.ref).get(), leagueRef.get()]);
    const g = grant.data();
    if (!g?.clearedAt || !g.grantedAt || g.leagueId !== i.leagueId || charterActive(now2.data(), now)) return false;
    await sweepAccess(db, leagueRef, i.leagueId);
    return false;
  }
  await sweepAccess(db, leagueRef, i.leagueId);
  return true;
}

/** Remove `leagueId` from the charterAccess of everyone holding it, and of every current member. */
async function sweepAccess(db: Db, leagueRef: FirebaseFirestore.DocumentReference, leagueId: string): Promise<void> {
  const del = admin.firestore.FieldValue.delete();
  // Everyone holding access through this league: the users whose map names it, and the current
  // members in case a map write was missed. Removing a key that is not there is a no-op.
  const path = new admin.firestore.FieldPath('charterAccess', 'leagues', leagueId);
  const [holders, members] = await Promise.all([
    db.collection('users').where(path, '>', 0).get(),
    leagueRef.collection('members').get(),
  ]);
  const uids = new Set<string>([...holders.docs.map((d) => d.id), ...members.docs.map((d) => d.id)]);
  const list = [...uids];
  for (let k = 0; k < list.length; k += 400) {
    const batch = db.batch();
    for (const uid of list.slice(k, k + 400)) {
      batch.set(db.doc(`users/${uid}`), { charterAccess: { leagues: { [leagueId]: del } } }, { merge: true });
    }
    await batch.commit();
  }
}

/**
 * Nightly: clear charters whose season has ended. One range query on `charter.expiresAt` (no
 * composite index); a league already cleared has no `charter` and is not returned.
 */
export async function expireCharters(db: Db, now = Date.now()): Promise<number> {
  const snap = await db.collection('leagues').where('charter.expiresAt', '<=', now).limit(500).get();
  let n = 0;
  for (const doc of snap.docs) {
    if (charterActive(doc.data(), now)) continue;
    if (await clearCharter(db, { leagueId: doc.id, ref: null, reason: 'expired', now })) n += 1;
  }
  return n;
}
