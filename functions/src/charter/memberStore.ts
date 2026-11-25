/**
 * Charter membership writes (F-175 slice 3). Firestore side of membership.ts; the Cloud Functions
 * in functions.ts are thin wrappers, so these run against the emulator in tests.
 */
import * as admin from 'firebase-admin';
import { charterActive } from './charter';
import { weekId } from './rankUp';
import { approveDecision, isApproved, memberChange, nextRankUpsWeek, rankUpDecision, searchPoints, type ApproveRefusal, type MemberChange, type RankUpRefusal } from './membership';

type Db = FirebaseFirestore.Firestore;
type Data = FirebaseFirestore.DocumentData;

/**
 * Keep a chartered league's access and search points in step with one member write.
 * Returns the league (for the emails) and what changed, or null when there is nothing to do.
 */
export async function syncCharterMember(
  db: Db, leagueId: string, memberId: string, before: Data | undefined, after: Data | undefined, now = Date.now(),
): Promise<{ league: Data; change: MemberChange } | null> {
  const change = memberChange(before, after);
  if (!change.joined && !change.left && !change.requested && !change.pointsMayChange) return null;
  const leagueRef = db.doc(`leagues/${leagueId}`);
  const userRef = db.doc(`users/${memberId}`);
  const del = admin.firestore.FieldValue.delete();

  // Access is set from the member as they are NOW, read in a transaction with the write, never
  // from this event's before/after: deliveries are not ordered and a retry can arrive days later,
  // so an old "approved" event must not give access back to someone who has since left. The owner
  // keeps access while the league is chartered, whatever happens to their own member document.
  const league = await db.runTransaction(async (tx) => {
    const [leagueSnap, memberSnap] = await Promise.all([tx.get(leagueRef), tx.get(leagueRef.collection('members').doc(memberId))]);
    const l = leagueSnap.data();
    if (!l || !charterActive(l, now)) return null;
    if (change.joined || change.left) {
      const inLeague = memberId === l.ownerId || (memberSnap.exists && isApproved(memberSnap.data()));
      tx.set(userRef, { charterAccess: { leagues: { [leagueId]: inLeague ? (l.charter.expiresAt as number) : del } } }, { merge: true });
    }
    return l;
  });
  if (!league) return null;

  if (change.pointsMayChange) await recomputeSearchPoints(db, leagueId, now);
  return { league, change };
}

/**
 * Recount `searchPoints` from the approved members, in a transaction, so two recounts racing each
 * other cannot leave the older sum behind. Only for a chartered league. Returns the new value.
 */
export async function recomputeSearchPoints(db: Db, leagueId: string, now = Date.now()): Promise<number | null> {
  const leagueRef = db.doc(`leagues/${leagueId}`);
  return db.runTransaction(async (tx) => {
    const [leagueSnap, members] = await Promise.all([tx.get(leagueRef), tx.get(leagueRef.collection('members'))]);
    const league = leagueSnap.data();
    if (!league || !charterActive(league, now)) return null;
    const sp = searchPoints(members.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => d.data()));
    if (league.searchPoints !== sp) tx.set(leagueRef, { searchPoints: sp }, { merge: true });
    return sp;
  });
}

export class Refused<R extends string> extends Error {
  constructor(public reason: R) { super(reason); }
}

/** Approve a pending request in one transaction, with the cap counted inside it. */
export async function approve(db: Db, leagueId: string, userId: string, callerId: string, now = Date.now()): Promise<void> {
  const leagueRef = db.doc(`leagues/${leagueId}`);
  const memberRef = leagueRef.collection('members').doc(userId);
  await db.runTransaction(async (tx) => {
    const [leagueSnap, memberSnap, members] = await Promise.all([tx.get(leagueRef), tx.get(memberRef), tx.get(leagueRef.collection('members'))]);
    const league = leagueSnap.data();
    if (!league) throw new Refused<ApproveRefusal | 'no-league'>('no-league');
    const approvedCount = members.docs.filter((d: FirebaseFirestore.QueryDocumentSnapshot) => isApproved(d.data())).length;
    const decision = approveDecision({
      callerId,
      ownerId: league.ownerId,
      member: memberSnap.exists ? memberSnap.data() : null,
      approvedCount,
      chartered: charterActive(league, now),
      maxMembers: league.maxMembers,
    });
    if (!decision.ok) throw new Refused<ApproveRefusal | 'no-league'>(decision.reason);
    tx.update(memberRef, { status: 'approved', rank: approvedCount + 1 });
  });
}

/** Give a Rank Up in one transaction: the gift document is created (a second this week fails) and the league's weekly count moves. */
export async function giveRankUp(db: Db, leagueId: string, fromUid: string, toUid: string, now = Date.now()): Promise<{ weekId: string; count: number }> {
  const week = weekId(now);
  const leagueRef = db.doc(`leagues/${leagueId}`);
  const giftRef = leagueRef.collection('rankUps').doc(`${week}_${fromUid}`);
  return db.runTransaction(async (tx) => {
    const [leagueSnap, fromSnap, toSnap, giftSnap] = await Promise.all([
      tx.get(leagueRef), tx.get(leagueRef.collection('members').doc(fromUid)), tx.get(leagueRef.collection('members').doc(toUid)), tx.get(giftRef),
    ]);
    const league = leagueSnap.data();
    const decision = rankUpDecision({
      chartered: charterActive(league, now),
      from: fromSnap.exists ? fromSnap.data() : null,
      to: toSnap.exists ? toSnap.data() : null,
      fromUid,
      toUid,
      alreadyGiven: giftSnap.exists,
    });
    if (!decision.ok) throw new Refused<RankUpRefusal>(decision.reason);
    const next = nextRankUpsWeek(league?.rankUpsWeek, now);
    tx.create(giftRef, { weekId: week, fromUid, toUid, at: now });
    tx.set(leagueRef, { rankUpsWeek: next }, { merge: true });
    return next;
  });
}
