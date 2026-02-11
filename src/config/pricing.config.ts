/**
 * Driver Pricing Configuration
 *
 * Rules documented in: docs/pricing-rules.txt
 *
 * Prices are calculated based on rolling average performance.
 * Initial prices derived from previous season total points.
 *
 * Currency: Dollars ($)
 */

export const PRICING_CONFIG = {
  // Season structure
  RACES_PER_SEASON: 24,
  SPRINTS_PER_SEASON: 4,

  // Price calculation
  DOLLARS_PER_POINT: 10, // Dollars per average point per race

  // Rolling average
  ROLLING_WINDOW: 5, // Number of races for rolling average

  // Sprint weekend adjustment
  SPRINT_WEIGHT: 0.75, // Weight multiplier for sprint weekend points

  // Price bounds
  MIN_PRICE: 3,              // V3: was 5
  MAX_PRICE: 500,
  MAX_CHANGE_PER_RACE: 25,   // V3: was 15 (more volatility)

  // Tier thresholds
  A_TIER_THRESHOLD: 100, // Price above this = A-tier
  B_TIER_THRESHOLD: 50,  // Price above this (but <= A) = B-tier, at or below = C-tier

  // Team budget
  STARTING_BUDGET: 1000, // $1,000 starting budget
  TEAM_SIZE: 5, // 5 drivers
  CONSTRUCTORS: 1, // 1 constructor

  // V3: Captain System
  CAPTAIN_MULTIPLIER: 2.0, // Captain scores 2x points
  CAPTAIN_MAX_PRICE: 100,  // Drivers over this price cannot be captain (ace)

  // V3: Stale Roster Penalty (encourages active management)
  STALE_ROSTER_THRESHOLD: 5,  // Races before penalty kicks in
  STALE_ROSTER_PENALTY: 5,    // Points lost per race after threshold

  // V3: Transfer Bonuses
  HOT_HAND_BONUS: 10,         // Bonus if new transfer scores 15+ points
  HOT_HAND_PODIUM_BONUS: 15,  // Bonus if new transfer finishes on podium
  VALUE_CAPTURE_RATE: 5,      // Points earned per $10 profit when selling

  // V4: Late Joiner Catch-Up
  LATE_JOINER_POINTS_PER_RACE: 30, // Flat points awarded per missed race

  // V5: Contract System
  CONTRACT_LENGTH: 5, // Drivers auto-sell after this many races
  CONTRACT_LOCKOUT_RACES: 1, // Races a driver is locked out after contract expiry (per team)

  // V6: Early Termination Fee
  EARLY_TERMINATION_RATE: 0.05, // 5% of purchase price per race remaining on contract
} as const;

// Points awarded per position
export const RACE_POINTS = {
  1: 25,
  2: 18,
  3: 15,
  4: 12,
  5: 10,
  6: 8,
  7: 6,
  8: 4,
  9: 2,
  10: 1,
} as const;

export const SPRINT_POINTS = {
  1: 8,
  2: 7,
  3: 6,
  4: 5,
  5: 4,
  6: 3,
  7: 2,
  8: 1,
} as const;

export const BONUS_POINTS = {
  FASTEST_LAP: 1, // Must finish in top 10
  POSITION_GAINED: 1, // Per position gained (grid vs finish)
} as const;

/**
 * Calculate initial price from previous season points
 * Formula: (totalPoints / 24 races) * $10 per point
 */
export function calculateInitialPrice(previousSeasonPoints: number): number {
  const avgPointsPerRace = previousSeasonPoints / PRICING_CONFIG.RACES_PER_SEASON;
  const price = Math.round(avgPointsPerRace * PRICING_CONFIG.DOLLARS_PER_POINT);
  return Math.max(PRICING_CONFIG.MIN_PRICE, Math.min(PRICING_CONFIG.MAX_PRICE, price));
}

/**
 * Calculate new price based on rolling average
 */
export function calculatePriceFromRollingAvg(rollingAvgPoints: number): number {
  const price = Math.round(rollingAvgPoints * PRICING_CONFIG.DOLLARS_PER_POINT);
  return Math.max(PRICING_CONFIG.MIN_PRICE, Math.min(PRICING_CONFIG.MAX_PRICE, price));
}

/**
 * Calculate rolling average from recent race results
 * @param recentPoints - Array of points from recent races (most recent first)
 * @param isSprintWeekend - Array indicating if each race was a sprint weekend
 */
export function calculateRollingAverage(
  recentPoints: number[],
  isSprintWeekend: boolean[] = []
): number {
  if (recentPoints.length === 0) return 0;

  const windowSize = Math.min(recentPoints.length, PRICING_CONFIG.ROLLING_WINDOW);
  const pointsWindow = recentPoints.slice(0, windowSize);
  const sprintWindow = isSprintWeekend.slice(0, windowSize);

  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < pointsWindow.length; i++) {
    const weight = sprintWindow[i] ? PRICING_CONFIG.SPRINT_WEIGHT : 1;
    weightedSum += pointsWindow[i] * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Calculate price change with bounds
 */
export function calculatePriceChange(
  currentPrice: number,
  newPrice: number
): number {
  const rawChange = newPrice - currentPrice;
  const boundedChange = Math.max(
    -PRICING_CONFIG.MAX_CHANGE_PER_RACE,
    Math.min(PRICING_CONFIG.MAX_CHANGE_PER_RACE, rawChange)
  );
  return boundedChange;
}

/**
 * Get price-based tier (used for price-change volatility, NOT display)
 */
export function getPriceTier(price: number): 'A' | 'B' | 'C' {
  if (price > PRICING_CONFIG.A_TIER_THRESHOLD) return 'A';
  if (price > PRICING_CONFIG.B_TIER_THRESHOLD) return 'B';
  return 'C';
}

/**
 * Assign value-based tiers using points-per-dollar percentile ranking.
 * Top 30% = Tier A (best value), middle 40% = Tier B, bottom 30% = Tier C.
 * Falls back to existing tiers if no points data is available.
 */
export function assignValueTiers<T extends {
  id: string;
  price: number;
  seasonPoints: number;
  currentSeasonPoints?: number;
  tier: 'A' | 'B' | 'C';
  isActive: boolean;
}>(items: T[]): T[] {
  const active = items.filter(d => d.isActive);
  if (active.length === 0) return items;

  const withPPD = active.map(d => {
    const relevantPoints = (d.currentSeasonPoints && d.currentSeasonPoints > 0)
      ? d.currentSeasonPoints
      : d.seasonPoints;
    const ppd = d.price > 0 ? relevantPoints / d.price : 0;
    return { id: d.id, ppd };
  });

  // If no one has any points, keep existing tiers
  if (!withPPD.some(d => d.ppd > 0)) return items;

  // Sort by PPD descending (best value first)
  withPPD.sort((a, b) => b.ppd - a.ppd);

  const total = withPPD.length;
  const tierACount = Math.max(1, Math.round(total * 0.3));
  const tierCCount = Math.max(1, Math.round(total * 0.3));

  const tierMap = new Map<string, 'A' | 'B' | 'C'>();
  withPPD.forEach((entry, index) => {
    if (index < tierACount) {
      tierMap.set(entry.id, 'A');
    } else if (index >= total - tierCCount) {
      tierMap.set(entry.id, 'C');
    } else {
      tierMap.set(entry.id, 'B');
    }
  });

  return items.map(d => {
    const newTier = tierMap.get(d.id);
    return newTier !== undefined ? { ...d, tier: newTier } : d;
  });
}

/**
 * Get points for a race position
 */
export function getRacePoints(position: number): number {
  return RACE_POINTS[position as keyof typeof RACE_POINTS] || 0;
}

/**
 * Get points for a sprint position
 */
export function getSprintPoints(position: number): number {
  return SPRINT_POINTS[position as keyof typeof SPRINT_POINTS] || 0;
}

/**
 * Format price as dollars
 */
export function formatPrice(price: number): string {
  return `$${price}`;
}
