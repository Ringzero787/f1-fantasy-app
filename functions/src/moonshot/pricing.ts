/**
 * Chance → band and multiplier (F-106). Two modes, both server-side and configurable:
 *
 * `banded` — the design document's table: a fixed multiplier per probability band.
 * `continuous` — multiplier = (1 − p) / p × (1 − vig), rounded, floored and capped,
 *   with the same band labels for the player. The document's fixed multipliers make
 *   the top edge of every band generous (a 64% call at 1.25× is +0.46 expected value
 *   per stake); this is the alternative the launch simulation can switch to without
 *   a release.
 *
 * "Reward" means the net gain on a hit: a stake of 100 at 5× pays +500 and keeps the
 * stake; a miss loses the 100.
 */
import type { MoonshotConfig, RewardBand } from './config';

export interface Price { band: string; multiplier: number }

/** The band a probability falls in: `min <= p < max`, with the top band closed at 1. */
export function bandFor(p: number, bands: RewardBand[]): RewardBand {
  const sorted = [...bands].sort((a, b) => b.minProbability - a.minProbability);
  for (const b of sorted) if (p >= b.minProbability && (p < b.maxProbability || (b.maxProbability >= 1 && p <= 1))) return b;
  return sorted[sorted.length - 1];
}

export const roundTo = (x: number, step: number): number => Math.round(x / step) * step;

export function price(p: number, pricing: MoonshotConfig['pricing']): Price {
  const band = bandFor(p, pricing.bands);
  if (pricing.mode === 'banded') return { band: band.label, multiplier: band.multiplier };
  const clamped = Math.min(Math.max(p, 1e-4), 1 - 1e-4);
  const fair = (1 - clamped) / clamped;
  const m = Math.min(pricing.maxMultiplier, Math.max(pricing.minMultiplier, roundTo(fair * (1 - pricing.vig), pricing.rounding)));
  return { band: band.label, multiplier: Math.round(m * 100) / 100 };
}

/** Net gain on a hit, whole points or dollars. */
export const potentialReward = (stake: number, multiplier: number): number => Math.round(stake * multiplier);

/** Expected value per unit staked: what a sharp player sees. Positive means the house is giving points away. */
export const expectedValue = (p: number, multiplier: number): number => p * multiplier - (1 - p);
