/**
 * Tests for price progression as races progress
 *
 * Verifies:
 * - PPM-based price changes per tier (A, B, C)
 * - Multi-race price evolution with rolling averages
 * - DNF price penalties scale correctly
 * - Price bounds ($5 min, $700 max, $60 max change)
 * - Tier transitions (C→B→A when crossing $120/$240)
 * - Initial price calculation from season points
 *
 * Uses pure functions to avoid Firebase dependencies (same pattern as pricing.integration.test.ts)
 */

import {
  PRICING_CONFIG,
  calculateInitialPrice,
  calculateRollingAverage,
  calculatePriceChange,
  getPriceTier,
} from '../../src/config/pricing.config';
import {
  PPM_GREAT,
  PPM_GOOD,
  PPM_POOR,
  PRICE_CHANGES,
  DNF_PRICE_PENALTY_MAX,
  DNF_PRICE_PENALTY_MIN,
} from '../../src/config/constants';

// ============================================
// Local helpers (avoid Firebase-dependent pricingService)
// ============================================

const calculatePPM = (points: number, price: number): number => {
  if (price === 0) return 0;
  return points / price;
};

const getPerformanceTier = (ppm: number): 'great' | 'good' | 'poor' | 'terrible' => {
  if (ppm >= PPM_GREAT) return 'great';
  if (ppm >= PPM_GOOD) return 'good';
  if (ppm >= PPM_POOR) return 'poor';
  return 'terrible';
};

const getLocalPriceTier = (price: number): 'A' | 'B' | 'C' => {
  if (price > 240) return 'A';
  if (price > 120) return 'B';
  return 'C';
};

const getPriceChangesForTier = (tier: 'A' | 'B' | 'C') => {
  switch (tier) {
    case 'A': return PRICE_CHANGES.A_TIER;
    case 'B': return PRICE_CHANGES.B_TIER;
    case 'C': return PRICE_CHANGES.C_TIER;
  }
};

const calculateDriverPriceChange = (points: number, currentPrice: number): {
  newPrice: number;
  change: number;
  ppm: number;
  performanceTier: 'great' | 'good' | 'poor' | 'terrible';
} => {
  const ppm = calculatePPM(points, currentPrice);
  const performanceTier = getPerformanceTier(ppm);
  const tier = getLocalPriceTier(currentPrice);
  const priceChanges = getPriceChangesForTier(tier);
  const change = priceChanges[performanceTier];
  let newPrice = currentPrice + change;
  newPrice = Math.max(PRICING_CONFIG.MIN_PRICE, Math.min(PRICING_CONFIG.MAX_PRICE, newPrice));
  return { newPrice, change, ppm, performanceTier };
};

/**
 * Calculate DNF price penalty (replicates pricingService.calculateDnfPricePenalty)
 */
const calculateDnfPricePenalty = (dnfLap: number, totalLaps: number): number => {
  if (totalLaps <= 1) return DNF_PRICE_PENALTY_MIN;
  if (dnfLap <= 0) return DNF_PRICE_PENALTY_MAX;
  if (dnfLap >= totalLaps) return DNF_PRICE_PENALTY_MIN;
  const progress = (dnfLap - 1) / (totalLaps - 1);
  const penalty = DNF_PRICE_PENALTY_MIN +
    (DNF_PRICE_PENALTY_MAX - DNF_PRICE_PENALTY_MIN) * (1 - progress);
  return Math.ceil(penalty);
};

const applyDnfPenalty = (currentPrice: number, dnfLap: number, totalLaps: number) => {
  const penalty = calculateDnfPricePenalty(dnfLap, totalLaps);
  const newPrice = Math.max(50, currentPrice - penalty);
  return { newPrice, penalty };
};

const getPriceTrend = (current: number, previous: number): 'up' | 'down' | 'neutral' => {
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'neutral';
};

const getPriceChangePercentage = (current: number, previous: number): number => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

// ============================================
// PPM-Based Price Changes
// ============================================

describe('PPM Classification', () => {
  it('should classify great PPM (>=0.06)', () => {
    expect(getPerformanceTier(0.06)).toBe('great');
    expect(getPerformanceTier(0.10)).toBe('great');
    expect(getPerformanceTier(1.0)).toBe('great');
  });

  it('should classify good PPM (0.04-0.059)', () => {
    expect(getPerformanceTier(0.04)).toBe('good');
    expect(getPerformanceTier(0.059)).toBe('good');
  });

  it('should classify poor PPM (0.02-0.039)', () => {
    expect(getPerformanceTier(0.02)).toBe('poor');
    expect(getPerformanceTier(0.039)).toBe('poor');
  });

  it('should classify terrible PPM (<0.02)', () => {
    expect(getPerformanceTier(0.019)).toBe('terrible');
    expect(getPerformanceTier(0.0)).toBe('terrible');
  });
});

describe('A-Tier Price Changes (price > $240)', () => {
  it('great performance → +$36', () => {
    // Price 250 (A-tier), PPM = 250/250 = 1.0 → great (>=0.06)
    const result = calculateDriverPriceChange(250, 250);
    expect(result.change).toBe(36);
    expect(result.newPrice).toBe(286);
    expect(result.performanceTier).toBe('great');
  });

  it('good performance → +$12', () => {
    // Price 250 (A-tier), PPM = 13/250 = 0.052 → good (0.04-0.06)
    const result = calculateDriverPriceChange(13, 250);
    expect(result.performanceTier).toBe('good');
    expect(result.change).toBe(12);
    expect(result.newPrice).toBe(262);
  });

  it('poor performance → -$12', () => {
    // Price 250 (A-tier), PPM = 8/250 = 0.032 → poor (0.02-0.04)
    const result = calculateDriverPriceChange(8, 250);
    expect(result.performanceTier).toBe('poor');
    expect(result.change).toBe(-12);
    expect(result.newPrice).toBe(238);
  });

  it('terrible performance → -$36', () => {
    // Price 300 (A-tier), PPM = 3/300 = 0.01 → terrible (<0.02)
    const result = calculateDriverPriceChange(3, 300);
    expect(result.performanceTier).toBe('terrible');
    expect(result.change).toBe(-36);
    expect(result.newPrice).toBe(264);
  });
});

describe('B-Tier Price Changes (price $121-$240)', () => {
  it('great performance → +$24', () => {
    // Price 150 (B-tier), PPM = 15/150 = 0.1 → great (>=0.06)
    const result = calculateDriverPriceChange(15, 150);
    expect(result.performanceTier).toBe('great');
    expect(result.change).toBe(24);
    expect(result.newPrice).toBe(174);
  });

  it('good performance → +$7', () => {
    // Price 150 (B-tier), PPM = 7/150 ≈ 0.047 → good (0.04-0.06)
    const result = calculateDriverPriceChange(7, 150);
    expect(result.performanceTier).toBe('good');
    expect(result.change).toBe(7);
    expect(result.newPrice).toBe(157);
  });

  it('poor performance → -$7', () => {
    // Price 150 (B-tier), PPM = 5/150 ≈ 0.033 → poor (0.02-0.04)
    const result = calculateDriverPriceChange(5, 150);
    expect(result.performanceTier).toBe('poor');
    expect(result.change).toBe(-7);
    expect(result.newPrice).toBe(143);
  });

  it('terrible performance → -$24', () => {
    // Price 150 (B-tier), PPM = 2/150 ≈ 0.013 → terrible (<0.02)
    const result = calculateDriverPriceChange(2, 150);
    expect(result.performanceTier).toBe('terrible');
    expect(result.change).toBe(-24);
    expect(result.newPrice).toBe(126);
  });
});

// ============================================
// Multi-Race Price Progression
// ============================================

describe('Multi-Race Price Progression', () => {
  it('consistently great performance should increase price steadily', () => {
    let price = 150; // Start B-tier (>120, <=240)

    for (let i = 0; i < 5; i++) {
      const points = price * 1.0; // PPM = 1.0 → great
      const result = calculateDriverPriceChange(points, price);
      price = result.newPrice;
    }

    // B-tier great = +24 per race × 5 races = +120
    // 150 → 174 → 198 → 222 → 246 (now A-tier!) → 282
    expect(price).toBe(282);
  });

  it('consistently terrible performance should decrease price', () => {
    let price = 300; // Start A-tier (>240)

    for (let i = 0; i < 5; i++) {
      const points = price * 0.005; // very low PPM → terrible (<0.02)
      const result = calculateDriverPriceChange(points, price);
      price = result.newPrice;
    }

    // A-tier terrible = -36/race, then transitions to B at <=240, then C at <=120
    // 300 → 264 → 228 (B-tier) → 204 (B) → 180 (B) → 156 (B)
    expect(price).toBeLessThan(300);
    expect(price).toBe(156);
  });

  it('tier transition: B→A when crossing $240 threshold', () => {
    let price = 230; // B-tier

    // Great B-tier: +24 → 254 (now A-tier)
    const r1 = calculateDriverPriceChange(230, price);
    expect(r1.newPrice).toBe(254);
    expect(getPriceTier(r1.newPrice)).toBe('A');

    // Great A-tier: +36 → 290
    const r2 = calculateDriverPriceChange(254, r1.newPrice);
    expect(r2.change).toBe(36);
    expect(r2.newPrice).toBe(290);
  });

  it('tier transition: A→B when dropping below $240', () => {
    // Terrible A-tier: -36 → 214 (now B-tier)
    const r1 = calculateDriverPriceChange(1, 250);
    expect(r1.newPrice).toBe(214);
    expect(getPriceTier(r1.newPrice)).toBe('B');

    // Terrible B-tier (PPM = 1/214 ≈ 0.005): -24 → 190
    const r2 = calculateDriverPriceChange(1, r1.newPrice);
    expect(r2.change).toBe(-24);
    expect(r2.newPrice).toBe(190);
  });
});

// ============================================
// DNF Price Penalties
// ============================================

describe('DNF Price Penalties', () => {
  it('lap 1 DNF = maximum penalty (24 pts)', () => {
    const penalty = calculateDnfPricePenalty(1, 50);
    expect(penalty).toBe(DNF_PRICE_PENALTY_MAX);
  });

  it('final lap DNF = minimum penalty (2 pts)', () => {
    const penalty = calculateDnfPricePenalty(50, 50);
    expect(penalty).toBe(DNF_PRICE_PENALTY_MIN);
  });

  it('mid-race DNF = intermediate penalty', () => {
    const penalty = calculateDnfPricePenalty(25, 50);
    // progress = (25-1)/(50-1) ≈ 0.4898
    // penalty = 2 + (24-2) * (1-0.4898) = 2 + 22 * 0.5102 = 2 + 11.224 = 13.224 → ceil = 14
    expect(penalty).toBeGreaterThan(DNF_PRICE_PENALTY_MIN);
    expect(penalty).toBeLessThan(DNF_PRICE_PENALTY_MAX);
    expect(penalty).toBe(14);
  });

  it('DNF penalty respects $50 minimum price', () => {
    const { newPrice } = applyDnfPenalty(55, 1, 50);
    // Penalty = 24, 55 - 24 = 31, but min is 50
    expect(newPrice).toBe(50);
  });

  it('DNF on low-price driver maintains minimum', () => {
    const { newPrice } = applyDnfPenalty(50, 1, 50);
    expect(newPrice).toBe(50);
  });

  it('edge case: totalLaps = 1', () => {
    const penalty = calculateDnfPricePenalty(1, 1);
    expect(penalty).toBe(DNF_PRICE_PENALTY_MIN);
  });

  it('edge case: dnfLap = 0 (didn\'t start)', () => {
    const penalty = calculateDnfPricePenalty(0, 50);
    expect(penalty).toBe(DNF_PRICE_PENALTY_MAX);
  });
});

// ============================================
// Price Bounds Enforcement
// ============================================

describe('Price Bounds', () => {
  it('minimum price is $5 (from calculateDriverPriceChange)', () => {
    const result = calculateDriverPriceChange(0, 10);
    // PPM = 0 → terrible → C-tier: -12 → 10-12 = -2, clamped to 5
    expect(result.newPrice).toBe(PRICING_CONFIG.MIN_PRICE);
  });

  it('price cannot go below minimum even with continued bad performance', () => {
    let price = 20;
    for (let i = 0; i < 10; i++) {
      const result = calculateDriverPriceChange(0, price);
      price = result.newPrice;
    }
    expect(price).toBe(PRICING_CONFIG.MIN_PRICE);
  });

  it('max price change per race is bounded ($60)', () => {
    const change = calculatePriceChange(100, 200);
    expect(change).toBe(60); // Capped at MAX_CHANGE_PER_RACE
  });

  it('negative price change is bounded (-$60)', () => {
    const change = calculatePriceChange(200, 100);
    expect(change).toBe(-60); // Capped at -MAX_CHANGE_PER_RACE
  });

  it('small changes are not capped', () => {
    const change = calculatePriceChange(100, 110);
    expect(change).toBe(10); // Within bounds, not capped
  });

  it('absolute min price is $5 (from config)', () => {
    expect(PRICING_CONFIG.MIN_PRICE).toBe(5);
  });

  it('absolute max price is $700 (from config)', () => {
    expect(PRICING_CONFIG.MAX_PRICE).toBe(700);
  });
});

// ============================================
// Rolling Average
// ============================================

describe('Rolling Average', () => {
  it('single race → equals that race\'s points', () => {
    const avg = calculateRollingAverage([25]);
    expect(avg).toBe(25);
  });

  it('5 races → averages last 5', () => {
    const avg = calculateRollingAverage([10, 20, 30, 40, 50]);
    expect(avg).toBe(30); // (10+20+30+40+50)/5
  });

  it('more than 5 races → uses only most recent 5', () => {
    const avg = calculateRollingAverage([10, 20, 30, 40, 50, 100, 200]);
    // Window = [10, 20, 30, 40, 50] (first 5, most recent)
    expect(avg).toBe(30);
  });

  it('sprint weekend races weighted at 0.75', () => {
    // 2 races: [20 (sprint), 30 (normal)]
    const avg = calculateRollingAverage([20, 30], [true, false]);
    // (20*0.75 + 30*1) / (0.75 + 1) = (15+30)/1.75 ≈ 25.71
    expect(avg).toBeCloseTo(25.71, 1);
  });

  it('empty points → 0 average', () => {
    const avg = calculateRollingAverage([]);
    expect(avg).toBe(0);
  });

  it('all sprints weighted correctly', () => {
    const avg = calculateRollingAverage([20, 20, 20], [true, true, true]);
    // All weighted at 0.75: (20*0.75*3) / (0.75*3) = 20
    expect(avg).toBe(20);
  });
});

// ============================================
// Initial Price Calculation
// ============================================

describe('Initial Price from Season Points', () => {
  it('Verstappen-level (500 pts) → $500', () => {
    const price = calculateInitialPrice(500);
    // 500/24 * 24 = 500
    expect(price).toBe(500);
  });

  it('mid-tier driver (200 pts) → $200', () => {
    const price = calculateInitialPrice(200);
    // 200/24 * 24 = 200
    expect(price).toBe(200);
  });

  it('low scorer (20 pts) → $20', () => {
    const price = calculateInitialPrice(20);
    // 20/24 * 24 = 20
    expect(price).toBe(20);
  });

  it('zero points → minimum price ($5)', () => {
    const price = calculateInitialPrice(0);
    expect(price).toBe(PRICING_CONFIG.MIN_PRICE);
  });

  it('extremely high scorer → capped at $700', () => {
    const price = calculateInitialPrice(2000);
    // 2000/24 * 24 = 2000 → capped at 700
    expect(price).toBe(PRICING_CONFIG.MAX_PRICE);
  });
});

// ============================================
// Driver Tier Classification
// ============================================

describe('Driver Tier', () => {
  it('price $241 → A-tier', () => {
    expect(getPriceTier(241)).toBe('A');
  });

  it('price $240 → B-tier (threshold > 240, exclusive)', () => {
    expect(getPriceTier(240)).toBe('B');
  });

  it('price $200 → B-tier', () => {
    expect(getPriceTier(200)).toBe('B');
  });

  it('price $121 → B-tier', () => {
    expect(getPriceTier(121)).toBe('B');
  });

  it('price $120 → C-tier (threshold > 120, exclusive)', () => {
    expect(getPriceTier(120)).toBe('C');
  });

  it('price $500 → A-tier', () => {
    expect(getPriceTier(500)).toBe('A');
  });

  it('price $5 → C-tier', () => {
    expect(getPriceTier(5)).toBe('C');
  });
});

// ============================================
// Price Trend Helpers
// ============================================

describe('Price Trend', () => {
  it('higher price → up trend', () => {
    expect(getPriceTrend(110, 100)).toBe('up');
  });

  it('lower price → down trend', () => {
    expect(getPriceTrend(90, 100)).toBe('down');
  });

  it('same price → neutral', () => {
    expect(getPriceTrend(100, 100)).toBe('neutral');
  });

  it('percentage change calculated correctly', () => {
    expect(getPriceChangePercentage(110, 100)).toBe(10);
    expect(getPriceChangePercentage(90, 100)).toBe(-10);
    expect(getPriceChangePercentage(100, 100)).toBe(0);
  });

  it('handles zero previous price', () => {
    expect(getPriceChangePercentage(100, 0)).toBe(0);
  });
});

// ============================================
// Realistic Season Simulation
// ============================================

describe('Season Price Simulation', () => {
  it('top driver: consistent great performance maintains high price', () => {
    let price = 310; // Verstappen starting price (A-tier)

    for (let i = 0; i < 10; i++) {
      const points = price * 0.9; // PPM = 0.9 → great
      const result = calculateDriverPriceChange(points, price);
      price = result.newPrice;
    }

    // Should be above starting price (all great = +36/race for A-tier)
    // 310 + 36*10 = 670
    expect(price).toBe(670);
    expect(price).toBeLessThanOrEqual(PRICING_CONFIG.MAX_PRICE);
  });

  it('inconsistent driver: price oscillates around a midpoint', () => {
    let price = 150; // B-tier
    const prices: number[] = [price];

    for (let i = 0; i < 10; i++) {
      const isGreat = i % 2 === 0;
      const points = isGreat ? price * 1.0 : price * 0.005;
      const result = calculateDriverPriceChange(points, price);
      price = result.newPrice;
      prices.push(price);
    }

    // B-tier: great +24, terrible -24 → roughly stable (oscillates)
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    expect(maxPrice - minPrice).toBeLessThan(100);
  });

  it('breakout rookie: low price + great performance climbs fast', () => {
    let price = 80; // C-tier (<=120)

    for (let i = 0; i < 5; i++) {
      const points = price * 1.2; // PPM = 1.2 → great
      const result = calculateDriverPriceChange(points, price);
      price = result.newPrice;
    }

    // C-tier great = +12 per race for first few, then B-tier great = +24
    // 80 → 92 → 104 → 116 → 128 (now B-tier!) → 152
    expect(price).toBe(152);
  });
});
