/**
 * Undercut's price rules, as applied by onRaceCompleted Phase 2.
 *
 * The originals are private to functions/src/scoring/calculatePoints.ts, which
 * imports firebase and cannot be loaded here. Until they are extracted into a
 * shared pure module (planned with F-070's production job), this is a copy and
 * test/priceRulesParity.test.js reads the constants out of that source file
 * and fails if they differ.
 */
export const TIER_A_THRESHOLD = 240;
export const TIER_B_THRESHOLD = 120;
export const PPM_GREAT = 0.06;
export const PPM_GOOD = 0.04;
export const PPM_POOR = 0.02;
export const PRICE_CHANGES = {
  A_TIER: { great: 36, good: 12, poor: -12, terrible: -36 },
  B_TIER: { great: 24, good: 7, poor: -7, terrible: -24 },
  C_TIER: { great: 12, good: 5, poor: -5, terrible: -12 },
} as const;
export const MIN_PRICE = 5;
export const MAX_PRICE = 700;
export const DIMINISH_FLOOR = 400;
export const DIMINISH_MIN_FACTOR = 0.25;
export const DNF_PRICE_PENALTY_MAX = 24;
export const DNF_PRICE_PENALTY_MIN = 2;
export const PRICING_RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const PRICING_SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

type Tier = 'great' | 'good' | 'poor' | 'terrible';

function tier(ppm: number): Tier {
  if (ppm >= PPM_GREAT) return 'great';
  if (ppm >= PPM_GOOD) return 'good';
  if (ppm >= PPM_POOR) return 'poor';
  return 'terrible';
}

function diminish(change: number, price: number): number {
  if (change <= 0 || price <= DIMINISH_FLOOR) return change;
  const progress = Math.min(1, (price - DIMINISH_FLOOR) / (MAX_PRICE - DIMINISH_FLOOR));
  return Math.round(change * (1 - progress * (1 - DIMINISH_MIN_FACTOR)));
}

export function performancePriceChange(pricingPoints: number, price: number): number {
  const ppm = price === 0 ? 0 : pricingPoints / price;
  const map = price > TIER_A_THRESHOLD ? PRICE_CHANGES.A_TIER : price > TIER_B_THRESHOLD ? PRICE_CHANGES.B_TIER : PRICE_CHANGES.C_TIER;
  return diminish(map[tier(ppm)], price);
}

export function dnfPricePenalty(dnfLap: number, totalLaps: number): number {
  if (totalLaps <= 1) return DNF_PRICE_PENALTY_MIN;
  if (dnfLap <= 0) return DNF_PRICE_PENALTY_MAX;
  if (dnfLap >= totalLaps) return DNF_PRICE_PENALTY_MIN;
  const progress = (dnfLap - 1) / (totalLaps - 1);
  return Math.ceil(DNF_PRICE_PENALTY_MIN + (DNF_PRICE_PENALTY_MAX - DNF_PRICE_PENALTY_MIN) * (1 - progress));
}

/** The change scoring would apply, clamped to the price bounds. */
export function appliedPriceChange(pricingPoints: number, dnfPenalty: number, price: number): number {
  const next = Math.min(MAX_PRICE, Math.max(MIN_PRICE, price + performancePriceChange(pricingPoints, price) - dnfPenalty));
  return next - price;
}

/**
 * What a pick has to score, from the real rule rather than a round number.
 *
 * Undercut's pricing has no neutral band: the tiers are great, good, poor and terrible, and only
 * the first two raise a price. So a pick that scores below `pointsToRise` loses value every race,
 * and `pointsToSoftFall` is only the line between a small fall and a large one. "Price-implied
 * points", the number the portal compares a projection against, is therefore `pointsToRise`.
 */
export const pointsToRise = (price: number): number => Math.ceil(price * PPM_GOOD);
export const pointsToSoftFall = (price: number): number => Math.ceil(price * PPM_POOR);

/** Blend of the simulation's expected change and what the last three races' pricing points would produce. */
export const DEFAULT_PRICE_BLEND = 0.5;
export function blendPriceChange(simExpected: number, recentPricingPoints: number[], price: number, blend = DEFAULT_PRICE_BLEND): number {
  if (recentPricingPoints.length === 0) return simExpected;
  const mean = recentPricingPoints.slice(-3).reduce((s, v) => s + v, 0) / Math.min(3, recentPricingPoints.length);
  const last3 = appliedPriceChange(mean, 0, price);
  return (1 - blend) * simExpected + blend * last3;
}
