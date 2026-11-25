/**
 * Charter membership rules (F-175 slice 3) — pure, no Firestore.
 *
 * A chartered league's approved members read Pit Wall through `users/{uid}.charterAccess`. These
 * functions decide, from one member document's before and after, what has to happen: access
 * given or taken, the search points recounted, and which email (if any) goes out.
 */
import { CHARTER_MEMBER_CAP } from './charter';
import { weekId } from './rankUp';

type Member = { status?: unknown; totalPoints?: unknown; displayName?: unknown } | null | undefined;

/** The same test the rules, memberCount and Charter grant use: anything but `pending` is approved. */
export const isApproved = (m: Member): boolean => !!m && m.status !== 'pending';

export interface MemberChange {
  /** became an approved member (created approved, or pending → approved): give access */
  joined: boolean;
  /** stopped being an approved member (left, removed, rejected after approval, set back to pending): take access */
  left: boolean;
  /** a join request: the document was created pending — tell the owner */
  requested: boolean;
  /** pending → approved: tell the player they are in */
  approvedNow: boolean;
  /** the search points sum may have changed */
  pointsMayChange: boolean;
}

export function memberChange(before: Member, after: Member): MemberChange {
  const was = isApproved(before);
  const is = isApproved(after);
  const pts = (m: Member) => (typeof m?.totalPoints === 'number' && Number.isFinite(m.totalPoints) ? m.totalPoints : 0);
  return {
    joined: !was && is,
    left: was && !is,
    requested: !before && !!after && after.status === 'pending',
    approvedNow: !!before && before.status === 'pending' && is,
    pointsMayChange: was !== is || (is && pts(before) !== pts(after)),
  };
}

/**
 * `searchPoints`: the sum, over approved members only, of the member's season total. The member
 * document's `totalPoints` IS `memberSeasonTotal()` — every scoring sync writes it from that one
 * definition (standingsFields.ts) — so summing it covers every place the total is written.
 */
export function searchPoints(members: Member[]): number {
  let sum = 0;
  for (const m of members) {
    if (!isApproved(m)) continue;
    const v = m!.totalPoints;
    if (typeof v === 'number' && Number.isFinite(v)) sum += v;
  }
  return sum;
}

export type ApproveRefusal = 'not-owner' | 'not-pending' | 'full';

/**
 * Whether the owner may approve a pending request. A chartered league is capped at
 * CHARTER_MEMBER_CAP approved players (owner included); an ordinary one at its own `maxMembers`.
 */
export function approveDecision(i: {
  callerId: string;
  ownerId: unknown;
  member: Member;
  approvedCount: number;
  chartered: boolean;
  maxMembers: unknown;
}): { ok: true } | { ok: false; reason: ApproveRefusal } {
  if (typeof i.ownerId !== 'string' || i.ownerId !== i.callerId) return { ok: false, reason: 'not-owner' };
  if (!i.member || i.member.status !== 'pending') return { ok: false, reason: 'not-pending' };
  const cap = i.chartered
    ? CHARTER_MEMBER_CAP
    : typeof i.maxMembers === 'number' && Number.isFinite(i.maxMembers) && i.maxMembers > 0 ? i.maxMembers : CHARTER_MEMBER_CAP;
  if (i.approvedCount >= cap) return { ok: false, reason: 'full' };
  return { ok: true };
}

export type RankUpRefusal = 'not-chartered' | 'not-member' | 'self' | 'target-not-member' | 'already-given';

/**
 * `giveRankUp` (BUILD.md, "Rank Up"): an approved member of a chartered league gives one Rank Up a
 * week to a different approved member. The gift moves the LEAGUE in search; it never touches points.
 */
export function rankUpDecision(i: {
  chartered: boolean;
  from: Member;
  to: Member;
  fromUid: string;
  toUid: string;
  alreadyGiven: boolean;
}): { ok: true } | { ok: false; reason: RankUpRefusal } {
  if (!i.chartered) return { ok: false, reason: 'not-chartered' };
  if (!isApproved(i.from)) return { ok: false, reason: 'not-member' };
  if (i.fromUid === i.toUid) return { ok: false, reason: 'self' };
  if (!isApproved(i.to)) return { ok: false, reason: 'target-not-member' };
  if (i.alreadyGiven) return { ok: false, reason: 'already-given' };
  return { ok: true };
}

/** The league's received-this-week counter after one more gift: +1 in the same week, else reset to 1. */
export function nextRankUpsWeek(current: { weekId?: unknown; count?: unknown } | null | undefined, now: number): { weekId: string; count: number } {
  const w = weekId(now);
  if (current && current.weekId === w && typeof current.count === 'number' && current.count >= 0) return { weekId: w, count: current.count + 1 };
  return { weekId: w, count: 1 };
}

/** Monday 00:00 UTC of the week containing `now`, in epoch ms. */
export function weekStartMs(now: number): number {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

/**
 * The Monday "Your rank up is back" mail (BUILD.md, "Email"): to a chartered member who has not
 * given a Rank Up this week and has not opened the app since the week began.
 */
export function wantsRankUpReminder(i: { gaveThisWeek: boolean; lastOpenAtMs: number | null; now: number; optedOut: boolean }): boolean {
  if (i.optedOut || i.gaveThisWeek) return false;
  return i.lastOpenAtMs === null || i.lastOpenAtMs < weekStartMs(i.now);
}
