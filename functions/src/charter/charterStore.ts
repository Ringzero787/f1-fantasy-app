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
  const leagueId = i.leagueId;
  const leagueRef = db.doc(`leagues/${leagueId}`);

  const outcome = await db.runTransaction(async (tx) => {
    const [leagueSnap, recordSnap] = await Promise.all([tx.get(leagueRef), tx.get(record)]);
    const league = leagueSnap.exists ? leagueSnap.data() : null;
    // A purchase whose charter was taken back (refund, dispute) never charters again: a replayed
    // receipt must not undo a refund.
    if (recordSnap.exists && recordSnap.data()?.clearedAt) return { applied: false as const, reason: 'refunded' as const };
    const decision = charterGrantDecision({ league, buyerId: i.buyerId, season: i.season, ref: i.ref, now });
    if (decision.kind === 'refuse') {
      tx.set(record, { leagueId, buyerId: i.buyerId, season: i.season, source: i.source, refusedAt: now, refused: decision.reason }, { merge: true });
      return { applied: false as const, reason: decision.reason };
    }
    if (decision.kind === 'replay') {
      return { applied: true as const, charter: league!.charter as Charter, ownerId: league!.ownerId as string, replay: true };
    }
    const charter = newCharter(i.season, i.buyerId, i.source, i.ref, now, seasonExpiry(i.season));
    tx.set(leagueRef, charterLeaguePatch(charter), { merge: true });
    tx.set(record, { leagueId, buyerId: i.buyerId, season: i.season, source: i.source, grantedAt: now, expiresAt: charter.expiresAt }, { merge: true });
    return { applied: true as const, charter, ownerId: league!.ownerId as string, replay: false };
  });
  if (!outcome.applied) return outcome;

  // Access for the members. Outside the transaction (a league holds 22 approved members, but a
  // transaction over every user document is not needed for correctness): each write is an
  // idempotent merge of the same value, so a retry, or a replay, converges.
  const members = await leagueRef.collection('members').get();
  const ids = charterMemberIds(outcome.ownerId, members.docs.map((d) => ({ id: d.id, status: d.data()?.status })));
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
 */
export async function clearCharter(db: Db, i: ClearCharterInput): Promise<boolean> {
  const now = i.now ?? Date.now();
  if (!isUsableLeagueId(i.leagueId)) return false;
  const leagueRef = db.doc(`leagues/${i.leagueId}`);
  const del = admin.firestore.FieldValue.delete();

  const cleared = await db.runTransaction(async (tx) => {
    const snap = await tx.get(leagueRef);
    const league = snap.exists ? snap.data() : null;
    const charter = league?.charter as Partial<Charter> | undefined;
    if (!league || !charter) return false;
    if (i.ref !== null && charter.ref !== i.ref) return false;
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
  if (!cleared) return false;

  // Everyone holding access through this league: the users whose map names it, and the current
  // members in case a map write was missed. Removing a key that is not there is a no-op.
  const path = new admin.firestore.FieldPath('charterAccess', 'leagues', i.leagueId);
  const [holders, members] = await Promise.all([
    db.collection('users').where(path, '>', 0).get(),
    leagueRef.collection('members').get(),
  ]);
  const uids = new Set<string>([...holders.docs.map((d) => d.id), ...members.docs.map((d) => d.id)]);
  const list = [...uids];
  for (let k = 0; k < list.length; k += 400) {
    const batch = db.batch();
    for (const uid of list.slice(k, k + 400)) {
      batch.set(db.doc(`users/${uid}`), { charterAccess: { leagues: { [i.leagueId]: del } } }, { merge: true });
    }
    await batch.commit();
  }
  return true;
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
