/**
 * Pit Wall Pass entitlement (F-068) — pure rules, no Firestore.
 *
 * One product: `pitwall.pass.season`, $14.99, valid for one season. The pass is the single
 * source of a user's access; League Pro is derived from it (a league is Pro while its owner
 * holds one), so there is one purchase flow, one store product and one thing to support.
 */
/** Where a pass came from. Every route ends at the same entitlement (ADR-001). */
export type PassSource = 'stripe' | 'play' | 'apple' | 'amazon' | 'grant';
export const PASS_PRODUCT = 'pitwall.pass.season';
export const PASS_PRICE_USD = 14.99;
export const PASS_TIER = 'pitwall';
/** A member of a Pro league gets this once, so they can see what their commissioner sees. */
export const TRIAL_DAYS = 7;

export interface Pass {
  tier: string;
  season: string;
  /** epoch ms; access ends here */
  expiresAt: number;
  source: PassSource;
  grantedAt: number;
  /** stripe event / store order that created it, for idempotency and support */
  ref?: string | null;
}

/**
 * A season pass runs until the season is over. Seasons end in December, so the pass is valid
 * to the end of January the following year: the off-season and pre-season testing are included,
 * which is when the portal is most useful for planning.
 */
export function seasonExpiry(season: string): number {
  const year = Number(season);
  if (!Number.isFinite(year)) throw new Error(`bad season "${season}"`);
  return Date.UTC(year + 1, 0, 31, 23, 59, 59, 999);
}

export function newPass(season: string, source: PassSource, now: number, ref?: string | null): Pass {
  return { tier: PASS_TIER, season, expiresAt: seasonExpiry(season), source, grantedAt: now, ref: ref ?? null };
}

export function trialPass(season: string, now: number): Pass {
  return { tier: PASS_TIER, season, expiresAt: Math.min(now + TRIAL_DAYS * 86400000, seasonExpiry(season)), source: 'grant', grantedAt: now, ref: 'league_trial' };
}

export function passActive(pass: Partial<Pass> | undefined | null, now: number): boolean {
  return !!pass && pass.tier === PASS_TIER && typeof pass.expiresAt === 'number' && pass.expiresAt > now;
}

/**
 * The custom auth claim. Firestore rules read it instead of fetching the user document on every
 * read, so a paid page costs one read, not two. Claims are capped at 1000 bytes, so it is one
 * number: the epoch seconds the access ends.
 */
export const PASS_CLAIM = 'pw';
export function passClaim(pass: Partial<Pass> | undefined | null): number | null {
  return passActive(pass, 0) && typeof pass!.expiresAt === 'number' ? Math.floor(pass!.expiresAt / 1000) : null;
}

/** An existing pass is never shortened by a new grant: a buyer who already has a trial keeps the longer one. */
export function mergePass(existing: Partial<Pass> | undefined | null, next: Pass): Pass {
  if (!existing || typeof existing.expiresAt !== 'number' || existing.expiresAt <= next.expiresAt) return next;
  return { ...next, expiresAt: existing.expiresAt };
}

/** Season for a date: the calendar year, except January, which still belongs to the season just ended. */
export function currentSeason(now: number): string {
  const d = new Date(now);
  return String(d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear());
}
