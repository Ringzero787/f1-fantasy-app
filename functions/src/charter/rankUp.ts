/**
 * Rank Up (F-175) — pure week, climb and search-order rules, no Firestore.
 *
 * Chartered leagues only. Each approved member may give one Rank Up per ISO week to another
 * approved member; the league's count for the week lifts it in public search, at most three
 * places. See docs/design/charter/BUILD.md, "Rank Up" and "Search".
 */
import { charterActive, type CharterLeagueFields } from './charter';

const DAY_MS = 86400000;

/**
 * The ISO 8601 week of an instant, as "YYYY-Www". Weeks start Monday 00:00 UTC, and the year is the
 * ISO week-numbering year (the year of that week's Thursday), so 2027-01-01 is "2026-W53".
 */
export function weekId(utcMs: number): string {
  if (typeof utcMs !== 'number' || !Number.isFinite(utcMs)) throw new Error(`bad instant ${utcMs}`);
  const d = new Date(utcMs);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const isoDay = (d.getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
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

/**
 * A league's Rank Ups for the week containing `now`: `rankUpsWeek.count` only when
 * `rankUpsWeek.weekId === weekId(now)`. A stale week's count is 0, so a missed week does not carry.
 */
export function rankUpsThisWeek(league: Pick<CharterLeagueFields, 'rankUpsWeek'> | null | undefined, now: number): number {
  const w = league?.rankUpsWeek;
  if (!w || w.weekId !== weekId(now) || typeof w.count !== 'number' || !Number.isFinite(w.count)) return 0;
  return Math.max(0, w.count);
}

export interface SearchLeague extends CharterLeagueFields {
  id: string;
  isPublic?: boolean | null;
  memberCount?: number | null;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The public search order.
 *
 * 1. Chartered leagues (`charterActive` at `now`) by `searchPoints` desc, then id asc.
 * 2. Walking that points order from the top, each league moves up `climb(rankUpsThisWeek)` places
 *    in the list as it stands at that moment. Going top-down means a league is moved once, at its
 *    turn, and is never moved back by a climber below it acting first: two climbers do not swap
 *    twice. A league already at the top cannot climb.
 * 3. Then every other league in the input that is public (`isPublic === true`), by `memberCount`
 *    desc, then id asc — what `getPublicLeagues` does today.
 *
 * `now` is passed in so the week is the caller's, and the function stays pure.
 */
export function orderChartered<T extends SearchLeague>(leagues: readonly T[], now: number): T[] {
  const chartered = leagues.filter((l) => charterActive(l, now));
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
  const rest = leagues
    .filter((l) => !charterActive(l, now) && l.isPublic === true)
    .sort((a, b) => num(b.memberCount) - num(a.memberCount) || byId(a, b));
  return [...order, ...rest];
}
