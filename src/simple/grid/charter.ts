/**
 * Charter in the grid (F-175 slice 4) — the pure parts: whether a league is chartered, whether the
 * offer may show, the fixed copy, the request caption, and the search order.
 *
 * `weekId`, `climb`, `rankUpsThisWeek` and `orderChartered` are copies of
 * functions/src/charter/rankUp.ts (the app does not bundle server code). A parity test runs both
 * over the same inputs, so the two cannot drift.
 */
import type { League } from '../../types';

/** The Charter accent: the square, the card labels and the buttons. */
export const CHARTER_RED = '#FF2E2E';

/** The free size of a league; a chartered league covers this plus every slot actually paid for. */
export const FREE_CHARTER_MEMBERS = 22;

const DAY_MS = 86400000;

type CharterFields = Pick<League, 'chartered' | 'charter' | 'rankUpsWeek'>;

/** Chartered right now: the flag AND an unexpired `charter.expiresAt` (either alone is not a charter). */
export function isChartered(league: Partial<CharterFields> | null | undefined, now: number): boolean {
  if (!league || league.chartered !== true) return false;
  const c = league.charter;
  return !!c && typeof c === 'object' && typeof c.expiresAt === 'number' && Number.isFinite(c.expiresAt) && c.expiresAt > now;
}

/** `config/app.charter.enabled`, fail-closed: anything but a literal `true` is off. */
export function charterFlagOn(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && (raw as { enabled?: unknown }).enabled === true;
}

/**
 * Whether any Charter price or purchase button may show (BUILD.md, "App UI": "Hide every price and
 * every purchase button while the charter flag is off"). Also off while paid Pit Wall content is
 * open to everyone (PITWALL_CONTENT_OPEN), on Amazon (Charter is not sold there), in demo mode, and
 * until the store has priced the product (nothing is offered that the store cannot sell).
 */
export function charterOfferVisible(o: { flagOn: boolean; contentOpen: boolean; amazon: boolean; demo: boolean; price: string | null | undefined }): boolean {
  return o.flagOn && !o.contentOpen && !o.amazon && !o.demo && typeof o.price === 'string' && o.price.length > 0;
}

/** The approved-member cap the owner approves against: 22 + paid slots while chartered, else maxMembers. */
export function approvalCap(league: Pick<League, 'maxMembers' | 'paidSlots'> & Partial<CharterFields>, now: number): number {
  const max = typeof league.maxMembers === 'number' && league.maxMembers > 0 ? league.maxMembers : FREE_CHARTER_MEMBERS;
  if (!isChartered(league, now)) return max;
  const paid = typeof league.paidSlots === 'number' && league.paidSlots > 0 ? league.paidSlots : 0;
  return Math.min(max, FREE_CHARTER_MEMBERS + paid);
}

/** The owner's share text after a charter (BUILD.md; the link is the `/join?code=` route the app handles). */
export function charterShareText(leagueName: string, ownerName: string, code: string): string {
  return [
    `${leagueName.toUpperCase()} is chartered.`,
    'Pit Wall is on for everyone in it.',
    `${ownerName} paid for the season.`,
    '',
    `Ask to join with ${code}`,
    `https://undercut.humannpc.com/join?code=${encodeURIComponent(code)}`,
  ].join('\n');
}

/** "{League} · {n} of {cap}" under a join request. */
export function requestCaption(leagueName: string, approved: number, cap: number): string {
  return `${leagueName} · ${approved} of ${cap}`;
}

/**
 * Whether the joiner's one-time "PIT WALL IS ON" sheet shows: a chartered league, not its owner, an
 * approved member, and not seen before (`charterUnlockSeen` on the member doc survives a reinstall).
 */
export function shouldShowUnlock(o: { chartered: boolean; isOwner: boolean; pending: boolean; seen: boolean }): boolean {
  return o.chartered && !o.isOwner && !o.pending && !o.seen;
}

/** Rank Ups each player received this week, from that week's `rankUps` documents. */
export function rankUpsReceived(gifts: readonly { toUid?: unknown }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of gifts) if (typeof g.toUid === 'string') out.set(g.toUid, (out.get(g.toUid) ?? 0) + 1);
  return out;
}

/** "RANK UP" until this week's is spent, then the count only (BUILD.md, "Rank Up"). */
export function rankUpLabel(spent: boolean, received: number): string {
  return spent ? String(received) : 'RANK UP';
}

// ─── copies of functions/src/charter/rankUp.ts (parity-tested) ───

/** ISO 8601 week "YYYY-Www"; weeks start Monday 00:00 UTC. */
export function weekId(utcMs: number): string {
  if (typeof utcMs !== 'number' || !Number.isFinite(utcMs)) throw new Error(`bad instant ${utcMs}`);
  const d = new Date(utcMs);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const isoDay = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(midnight + (3 - isoDay) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Places a league climbs for `count` Rank Ups this week: at most three, never negative. */
export function climb(count: number): number {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return 0;
  return Math.min(Math.floor(count), 3);
}

/** The league's Rank Ups for the week containing `now`; a stale week counts 0. */
export function rankUpsThisWeek(league: Partial<CharterFields> | null | undefined, now: number): number {
  const w = league?.rankUpsWeek;
  if (!w || w.weekId !== weekId(now) || typeof w.count !== 'number' || !Number.isFinite(w.count)) return 0;
  return Math.max(0, w.count);
}

export type SearchLeague = Partial<CharterFields> & { id: string; isPublic?: boolean | null; memberCount?: number | null; searchPoints?: number | null };

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Public search order: chartered by points with the weekly climb, then the rest by size. */
export function orderChartered<T extends SearchLeague>(leagues: readonly T[], now: number): T[] {
  const chartered: T[] = [];
  const unchartered: T[] = [];
  for (const l of leagues) {
    if (l.isPublic !== true) continue;
    (isChartered(l, now) ? chartered : unchartered).push(l);
  }
  const byPoints = [...chartered].sort((a, b) => num(b.searchPoints) - num(a.searchPoints) || byId(a, b));
  const order = [...byPoints];
  for (const league of byPoints) {
    const places = climb(rankUpsThisWeek(league, now));
    if (places === 0) continue;
    const at = order.indexOf(league);
    const to = Math.max(0, at - places);
    if (to === at) continue;
    order.splice(at, 1);
    order.splice(to, 0, league);
  }
  const rest = unchartered.sort((a, b) => num(b.memberCount) - num(a.memberCount) || byId(a, b));
  return [...order, ...rest];
}

/** How many places a chartered league moved up this week ("UP n THIS WEEK" when above zero). */
export function climbedThisWeek(league: SearchLeague, now: number): number {
  return isChartered(league, now) ? climb(rankUpsThisWeek(league, now)) : 0;
}
