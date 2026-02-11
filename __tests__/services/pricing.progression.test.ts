/**
 * Tests for price progression as races progress
 *
 * Verifies:
 * - PPM-based price changes per tier (A vs B)
 * - Multi-race price evolution with rolling averages
 * - DNF price penalties scale correctly
 * - Price bounds ($3 min, $500 max, $25 max change)
 * - Tier transitions (B→A and A→B when crossing $200)
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

const getLocalPriceTier = (price: number): 'A' | 'B' => {
  return price > 200 ? 'A' : 'B';
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
  const priceChanges = tier === 'A' ? PRICE_CHANGES.A_TIER : PRICE_CHANGES.B_TIER;
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
  it('should classify great PPM (>=0.8)', () => {
    expect(getPerformanceTier(0.8)).toBe('great');
    expect(getPerformanceTier(1.0)).toBe('great');
    expect(getPerformanceTier(2.5)).toBe('great');
  });

  it('should classify good PPM (0.6-0.79)', () => {
    expect(getPerformanceTier(0.6)).toBe('good');
    expect(getPerformanceTier(0.79)).toBe('good');
  });

  it('should classify poor PPM (0.4-0.59)', () => {
    expect(getPerformanceTier(0.4)).toBe('poor');
    expect(getPerformanceTier(0.59)).toBe('poor');
  });

  it('should classify terrible PPM (<0.4)', () => {
    expect(getPerformanceTier(0.39)).toBe('terrible');
    expect(getPerformanceTier(0.0)).toBe('terrible');
  });
});

describe('A-Tier Price Changes (price >= $200)', () => {
  it('great performance → +$15', () => {
    const result = calculateDriverPriceChange(250, 250);
    expect(result.change).toBe(15);
    expect(result.newPrice).toBe(265);
    expect(result.performanceTier).toBe('great');
  });

  it('good performance → +$5', () => {
    // Price 210 (A-tier), PPM = 140/210 ≈ 0.667 → good
    const result = calculateDriverPriceChange(140, 210);
    expect(result.performanceTier).toBe('good');
    expect(result.change).toBe(5);
    expect(result.newPrice).toBe(215);
  });

  it('poor performance → -$5', () => {
    // Price 210 (A-tier), PPM = 100/210 ≈ 0.476 → poor
    const result = calculateDriverPriceChange(100, 210);
    expect(result.performanceTier).toBe('poor');
    expect(result.change).toBe(-5);
    expect(result.newPrice).toBe(205);
  });

  it('terrible performance → -$15', () => {
    const result = calculateDriverPriceChange(90, 300);
    expect(result.performanceTier).toBe('terrible');
    expect(result.change).toBe(-15);
    expect(result.newPrice).toBe(285);
  });
});

describe('B-Tier Price Changes (price < $200)', () => {
  it('great performance → +$10', () => {
    const result = calculateDriverPriceChange(100, 100);
    expect(result.performanceTier).toBe('great');
    expect(result.change).toBe(10);
    expect(result.newPrice).toBe(110);
  });

  it('good performance → +$3', () => {
    const result = calculateDriverPriceChange(70, 100);
    expect(result.performanceTier).toBe('good');
    expect(result.change).toBe(3);
    expect(result.newPrice).toBe(103);
  });

  it('poor performance → -$3', () => {
    const result = calculateDriverPriceChange(75, 150);
    expect(result.performanceTier).toBe('poor');
    expect(result.change).toBe(-3);
    expect(result.newPrice).toBe(147);
  });

  it('terrible performance → -$10', () => {
    const result = calculateDriverPriceChange(20, 100);
    expect(result.performanceTier).toBe('terrible');
    expect(result.change).toBe(-10);
    expect(result.newPrice).toBe(90);
  });
});

// ============================================
// Multi-Race Price Progression
// ============================================

describe('Multi-Race Price Progression', () => {
  it('consistently great performance should increase price steadily', () => {
    let price = 150; // Start B-tier

    for (let i = 0; i < 5; i++) {
      const points = price * 1.0; // PPM = 1.0 → great
      const result = calculateDriverPriceChange(points, price);
      price = result.newPrice;
    }

    // B-tier great = +10 per race × 5 races = +50
    // 150 → 160 → 170 → 180 → 190 → 200
    expect(price).toBe(200);
  });

  it('consistently terrible performance should decrease price', () => {
    let price = 250; // Start A-tier

    for (let i = 0; i < 5; i++) {
      const points = price * 0.1; // terrible PPM
      const result = calculateDriverPriceChange(points, price);
      price = result.newPrice;
    }

    // A-tier terrible = -15 per race
    // 250 → 235 → 220 → 205 → 190 → 180 (last 2 are B-tier: -10)
    expect(price).toBeLessThan(250);
    expect(price).toBe(180);
  });

  it('tier transition: B→A when crossing $200 threshold', () => {
    let price = 195;

    // Great B-tier: +10 → 205 (now A-tier)
    const r1 = calculateDriverPriceChange(195, price);
    expect(r1.newPrice).toBe(205);
    expect(getPriceTier(r1.newPrice)).toBe('A');

    // Great A-tier: +15 → 220
    const r2 = calculateDriverPriceChange(205, r1.newPrice);
    expect(r2.change).toBe(15);
    expect(r2.newPrice).toBe(220);
  });

  it('tier transition: A→B when dropping below $200', () => {
    // Terrible A-tier: -15 → 190 (now B-tier)
    const r1 = calculateDriverPriceChange(10, 205);
    expect(r1.newPrice).toBe(190);
    expect(getPriceTier(r1.newPrice)).toBe('B');

    // Terrible B-tier: -10 → 180
    const r2 = calculateDriverPriceChange(10, r1.newPrice);
    expect(r2.change).toBe(-10);
    expect(r2.newPrice).toBe(180);
  });
});

// ============================================
// DNF Price Penalties
// ============================================

describe('DNF Price Penalties', () => {
  it('lap 1 DNF = maximum penalty (10 pts)', () => {
    const penalty = calculateDnfPricePenalty(1, 50);
    expect(penalty).toBe(DNF_PRICE_PENALTY_MAX);
  });

  it('final lap DNF = minimum penalty (1 pt)', () => {
    const penalty = calculateDnfPricePenalty(50, 50);
    expect(penalty).toBe(DNF_PRICE_PENALTY_MIN);
  });

  it('mid-race DNF = intermediate penalty', () => {
    const penalty = calculateDnfPricePenalty(25, 50);
    // progress = (25-1)/(50-1) ≈ 0.49
    // penalty = 1 + (10-1) * (1-0.49) = 1 + 4.59 = 5.59 → ceil = 6
    expect(penalty).toBeGreaterThan(DNF_PRICE_PENALTY_MIN);
    expect(penalty).toBeLessThan(DNF_PRICE_PENALTY_MAX);
    expect(penalty).toBe(6);
  });

  it('DNF penalty respects $50 minimum price', () => {
    const { newPrice } = applyDnfPenalty(55, 1, 50);
    // Penalty = 10, 55 - 10 = 45, but min is 50
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
  it('minimum price is $3 (from calculateDriverPriceChange)', () => {
    const result = calculateDriverPriceChange(0, 5);
    // PPM = 0 → terrible → B-tier: -10 → 5-10 = -5, clamped to 3
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

  it('max price change per race is bounded ($25)', () => {
    const change = calculatePriceChange(100, 200);
    expect(change).toBe(25); // Capped at MAX_CHANGE_PER_RACE
  });

  it('negative price change is bounded (-$25)', () => {
    const change = calculatePriceChange(200, 100);
    expect(change).toBe(-25); // Capped at -MAX_CHANGE_PER_RACE
  });

  it('small changes are not capped', () => {
    const change = calculatePriceChange(100, 110);
    expect(change).toBe(10); // Within bounds, not capped
  });

  it('absolute min price is $3 (from config)', () => {
    expect(PRICING_CONFIG.MIN_PRICE).toBe(3);
  });

  it('absolute max price is $500 (from config)', () => {
    expect(PRICING_CONFIG.MAX_PRICE).toBe(500);
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
  it('Verstappen-level (575 pts) → $240', () => {
    const price = calculateInitialPrice(575);
    // 575/24 * 10 = 239.58 → round → 240
    expect(price).toBe(240);
  });

  it('mid-tier driver (200 pts) → $83', () => {
    const price = calculateInitialPrice(200);
    // 200/24 * 10 = 83.33 → round → 83
    expect(price).toBe(83);
  });

  it('low scorer (20 pts) → $8', () => {
    const price = calculateInitialPrice(20);
    // 20/24 * 10 = 8.33 → round → 8
    expect(price).toBe(8);
  });

  it('zero points → minimum price ($3)', () => {
    const price = calculateInitialPrice(0);
    expect(price).toBe(PRICING_CONFIG.MIN_PRICE);
  });

  it('extremely high scorer → capped at $500', () => {
    const price = calculateInitialPrice(2000);
    // 2000/24 * 10 = 833 → capped at 500
    expect(price).toBe(PRICING_CONFIG.MAX_PRICE);
  });
});

// ============================================
// Driver Tier Classification
// ============================================

describe('Driver Tier', () => {
  it('price $201 → A-tier', () => {
    expect(getPriceTier(201)).toBe('A');
    expect(getPriceTier(201)).toBe('A');
  });

  it('price $200 → B-tier (threshold > 200, exclusive)', () => {
    expect(getPriceTier(200)).toBe('B');
    expect(getPriceTier(200)).toBe('B');
  });

  it('price $199 → B-tier', () => {
    expect(getPriceTier(199)).toBe('B');
  });

  it('price $500 → A-tier', () => {
    expect(getPriceTier(500)).toBe('A');
  });

  it('price $3 → B-tier', () => {
    expect(getPriceTier(3)).toBe('B');
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
    let price = 310; // Verstappen starting price

    for (let i = 0; i < 10; i++) {
      const points = price * 0.9; // PPM = 0.9 → great
      const result = calculateDriverPriceChange(points, price);
      price = result.newPrice;
    }

    // Should be above starting price (all great = +15/race for A-tier)
    // 310 + 15*10 = 460
    expect(price).toBe(460);
    expect(price).toBeLessThanOrEqual(PRICING_CONFIG.MAX_PRICE);
  });

  it('inconsistent driver: price oscillates around a midpoint', () => {
    let price = 150;
    const prices: number[] = [price];

    for (let i = 0; i < 10; i++) {
      const isGreat = i % 2 === 0;
      const points = isGreat ? price * 1.0 : price * 0.1;
      const result = calculateDriverPriceChange(points, price);
      price = result.newPrice;
      prices.push(price);
    }

    // B-tier: great +10, terrible -10 → roughly stable
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    expect(maxPrice - minPrice).toBeLessThan(50);
  });

  it('breakout rookie: low price + great performance climbs fast', () => {
    let price = 80;

    for (let i = 0; i < 5; i++) {
      const points = price * 1.2; // PPM = 1.2 → great
      const result = calculateDriverPriceChange(points, price);
      price = result.newPrice;
    }

    // B-tier great = +10 per race, 5 races = +50
    expect(price).toBe(130);
  });
});
