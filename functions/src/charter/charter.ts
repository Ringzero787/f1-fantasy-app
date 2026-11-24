/**
 * Charter (F-175, ADR-004) — pure state rules, no Firestore.
 *
 * Charter is the second product beside the Pit Wall Pass: `pitwall.charter.season` charters ONE
 * league for one season, and every approved member of that league reads paid Pit Wall while they
 * stay in it. The plan is docs/design/charter/BUILD.md.
 *
 * Two fields, never one:
 *   - `users/{uid}.pass` is the personal pass. A Charter purchase, a join, a leave and a Charter
 *     refund never write it (see "The entitlement trap" in BUILD.md).
 *   - `users/{uid}.charterAccess.leagues[leagueId] = expiresAt` is access through a chartered
 *     league, kept by the server in step with approval.
 * The `pw` auth claim is the later of the two (`claimExpiry`).
 */
import { passActive, type Pass } from '../pitwall/pass';

export const CHARTER_PRODUCT = 'pitwall.charter.season';
export const CHARTER_PRICE_CENTS = 3999;

/** Where a charter came from. Amazon is not a Charter source (BUILD.md, "Do not build"). */
export type CharterSource = 'stripe' | 'play' | 'apple';

/** `leagues/{id}.charter`. Server-written; firestore.rules deny every client write. */
export interface Charter {
  season: string;
  /** epoch ms; the league stops being chartered here (seasonExpiry(season), as for the pass) */
  expiresAt: number;
  buyerId: string;
  source: CharterSource;
  /** stripe event / store order that created it, for idempotency and support */
  ref: string;
  purchasedAt: number;
}

/** `leagues/{id}.rankUpsWeek`: Rank Ups this league received in the ISO week `weekId`. */
export interface RankUpsWeek {
  weekId: string;
  count: number;
}

/** The league fields Charter reads. Every one is server-written. */
export interface CharterLeagueFields {
  charter?: Partial<Charter> | null;
  /** query flag, cleared on expiry or refund */
  chartered?: boolean | null;
  /** sum of memberSeasonTotal() over approved members */
  searchPoints?: number | null;
  rankUpsWeek?: Partial<RankUpsWeek> | null;
}

/** `users/{uid}.charterAccess`. Server-written; firestore.rules deny every client write. */
export interface CharterAccess {
  leagues: Record<string, number>;
}

/**
 * A league is chartered while BOTH server fields agree: the `chartered` query flag is set and the
 * charter has not expired. Either one alone (a stale flag after expiry, or a charter object left
 * behind by a partial refund) is not a charter.
 */
export function charterActive(league: CharterLeagueFields | null | undefined, now: number): boolean {
  if (!league || league.chartered !== true) return false;
  const c = league.charter;
  return !!c && typeof c === 'object' && typeof c.expiresAt === 'number' && Number.isFinite(c.expiresAt) && c.expiresAt > now;
}

/**
 * The latest unexpired `charterAccess.leagues` value, in epoch ms, or null when the user has no
 * live access through any league. Malformed entries are ignored, not trusted.
 */
export function charterAccessExpiry(
  user: { charterAccess?: Partial<CharterAccess> | null } | null | undefined,
  now: number,
): number | null {
  const leagues = user?.charterAccess?.leagues;
  if (!leagues || typeof leagues !== 'object') return null;
  let best: number | null = null;
  for (const v of Object.values(leagues)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= now) continue;
    if (best === null || v > best) best = v;
  }
  return best;
}

/**
 * When paid Pit Wall access ends, in epoch ms: the later of an active personal pass and the latest
 * charter access. Null when neither is live, which is when the `pw` claim is dropped.
 */
export function claimExpiry(
  pass: Partial<Pass> | null | undefined,
  charterAccess: Partial<CharterAccess> | null | undefined,
  now: number,
): number | null {
  const fromPass = passActive(pass, now) ? (pass!.expiresAt as number) : null;
  const fromCharter = charterAccessExpiry({ charterAccess }, now);
  if (fromPass === null) return fromCharter;
  if (fromCharter === null) return fromPass;
  return Math.max(fromPass, fromCharter);
}

/**
 * Charter checkout is allowed only when `config/app.charter.enabled === true`. Anything else —
 * no document, no block, a string "true" — is off. It defaults to off; the flip is an ops change
 * after 50 store ratings and is not part of F-175's first slices.
 */
export function charterEnabled(appConfig: unknown): boolean {
  if (!appConfig || typeof appConfig !== 'object') return false;
  const charter = (appConfig as { charter?: unknown }).charter;
  return !!charter && typeof charter === 'object' && (charter as { enabled?: unknown }).enabled === true;
}
