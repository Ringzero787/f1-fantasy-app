/**
 * Unit tests for pricing configuration and calculations
 */

import {
  PRICING_CONFIG,
  calculateInitialPrice,
  calculatePriceFromRollingAvg,
  calculateRollingAverage,
  calculatePriceChange,
  getPriceTier,
  getRacePoints,
  getSprintPoints,
} from '../../src/config/pricing.config';

describe('PRICING_CONFIG', () => {
  it('should have correct season structure', () => {
    expect(PRICING_CONFIG.RACES_PER_SEASON).toBe(24);
    expect(PRICING_CONFIG.SPRINTS_PER_SEASON).toBe(4);
  });

  it('should have correct price calculation constants', () => {
    expect(PRICING_CONFIG.DOLLARS_PER_POINT).toBe(24);
    expect(PRICING_CONFIG.ROLLING_WINDOW).toBe(5);
  });

  it('should have correct price bounds', () => {
    expect(PRICING_CONFIG.MIN_PRICE).toBe(5);
    expect(PRICING_CONFIG.MAX_PRICE).toBe(700);
    expect(PRICING_CONFIG.MAX_CHANGE_PER_RACE).toBe(60);
  });

  it('should have correct tier thresholds', () => {
    expect(PRICING_CONFIG.A_TIER_THRESHOLD).toBe(240);
    expect(PRICING_CONFIG.B_TIER_THRESHOLD).toBe(120);
  });

  it('should have correct ace system values', () => {
    expect(PRICING_CONFIG.ACE_MULTIPLIER).toBe(2.0);
    expect(PRICING_CONFIG.ACE_MAX_PRICE).toBe(240);
  });

  it('should have correct budget values', () => {
    expect(PRICING_CONFIG.STARTING_BUDGET).toBe(1000);
    expect(PRICING_CONFIG.TEAM_SIZE).toBe(5);
    expect(PRICING_CONFIG.CONSTRUCTORS).toBe(1);
  });
});

describe('calculateInitialPrice', () => {
  it('should calculate price from previous season points', () => {
    // 240 points / 24 races = 10 avg * $24 = $240
    expect(calculateInitialPrice(240)).toBe(240);
  });

  it('should calculate price for top driver (Verstappen-like)', () => {
    // 500 points / 24 races = 20.833 avg * $24 = $500
    expect(calculateInitialPrice(500)).toBe(500);
  });

  it('should calculate price for mid-tier driver', () => {
    // 120 points / 24 races = 5 avg * $24 = $120
    expect(calculateInitialPrice(120)).toBe(120);
  });

  it('should enforce minimum price', () => {
    // 0 points should return MIN_PRICE
    expect(calculateInitialPrice(0)).toBe(PRICING_CONFIG.MIN_PRICE);
  });

  it('should enforce maximum price', () => {
    // 20000 points would be very high, but capped at MAX_PRICE
    expect(calculateInitialPrice(20000)).toBe(PRICING_CONFIG.MAX_PRICE);
  });

  it('should round to nearest integer', () => {
    // 100 points / 24 = 4.167 * 24 = 100
    expect(calculateInitialPrice(100)).toBe(100);
  });
});

describe('calculatePriceFromRollingAvg', () => {
  it('should multiply rolling average by dollars per point', () => {
    // 10 avg * $24 = $240
    expect(calculatePriceFromRollingAvg(10)).toBe(240);
    // 25 avg * $24 = $600
    expect(calculatePriceFromRollingAvg(25)).toBe(600);
  });

  it('should enforce minimum price', () => {
    expect(calculatePriceFromRollingAvg(0)).toBe(PRICING_CONFIG.MIN_PRICE);
  });

  it('should enforce maximum price', () => {
    // 100 avg * $24 = $2400, capped at $700
    expect(calculatePriceFromRollingAvg(100)).toBe(PRICING_CONFIG.MAX_PRICE);
  });
});

describe('calculateRollingAverage', () => {
  it('should calculate average of recent points', () => {
    const points = [10, 15, 8, 12, 5];
    // (10 + 15 + 8 + 12 + 5) / 5 = 10
    expect(calculateRollingAverage(points)).toBe(10);
  });

  it('should only use ROLLING_WINDOW races', () => {
    const points = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    // Only first 5: (25 + 18 + 15 + 12 + 10) / 5 = 16
    expect(calculateRollingAverage(points)).toBe(16);
  });

  it('should handle fewer races than window size', () => {
    const points = [20, 15];
    // (20 + 15) / 2 = 17.5
    expect(calculateRollingAverage(points)).toBe(17.5);
  });

  it('should return 0 for empty array', () => {
    expect(calculateRollingAverage([])).toBe(0);
  });

  it('should apply sprint weekend weight', () => {
    const points = [25, 10];
    const isSprintWeekend = [false, true];
    // (25 * 1 + 10 * 0.75) / (1 + 0.75) = 32.5 / 1.75 = 18.57
    const result = calculateRollingAverage(points, isSprintWeekend);
    expect(result).toBeCloseTo(18.57, 1);
  });
});

describe('calculatePriceChange', () => {
  it('should return the difference between prices', () => {
    expect(calculatePriceChange(100, 110)).toBe(10);
    expect(calculatePriceChange(100, 90)).toBe(-10);
  });

  it('should cap positive change at MAX_CHANGE_PER_RACE', () => {
    expect(calculatePriceChange(100, 200)).toBe(PRICING_CONFIG.MAX_CHANGE_PER_RACE);
  });

  it('should cap negative change at -MAX_CHANGE_PER_RACE', () => {
    expect(calculatePriceChange(200, 100)).toBe(-PRICING_CONFIG.MAX_CHANGE_PER_RACE);
  });

  it('should return 0 for no change', () => {
    expect(calculatePriceChange(100, 100)).toBe(0);
  });
});

describe('getPriceTier (price-based, for volatility)', () => {
  it('should return A tier for prices above 240', () => {
    expect(getPriceTier(241)).toBe('A');
    expect(getPriceTier(300)).toBe('A');
    expect(getPriceTier(500)).toBe('A');
  });

  it('should return B tier for prices above 120 but at or below 240', () => {
    expect(getPriceTier(240)).toBe('B');
    expect(getPriceTier(200)).toBe('B');
    expect(getPriceTier(121)).toBe('B');
  });

  it('should return C tier for prices at or below 120', () => {
    expect(getPriceTier(120)).toBe('C');
    expect(getPriceTier(100)).toBe('C');
    expect(getPriceTier(50)).toBe('C');
  });
});

describe('getRacePoints', () => {
  it('should return correct points for top 10 positions', () => {
    expect(getRacePoints(1)).toBe(25);
    expect(getRacePoints(2)).toBe(18);
    expect(getRacePoints(3)).toBe(15);
    expect(getRacePoints(4)).toBe(12);
    expect(getRacePoints(5)).toBe(10);
    expect(getRacePoints(6)).toBe(8);
    expect(getRacePoints(7)).toBe(6);
    expect(getRacePoints(8)).toBe(4);
    expect(getRacePoints(9)).toBe(2);
    expect(getRacePoints(10)).toBe(1);
  });

  it('should return 0 for positions outside top 10', () => {
    expect(getRacePoints(11)).toBe(0);
    expect(getRacePoints(20)).toBe(0);
  });
});

describe('getSprintPoints', () => {
  it('should return correct points for top 8 positions', () => {
    expect(getSprintPoints(1)).toBe(8);
    expect(getSprintPoints(2)).toBe(7);
    expect(getSprintPoints(3)).toBe(6);
    expect(getSprintPoints(4)).toBe(5);
    expect(getSprintPoints(5)).toBe(4);
    expect(getSprintPoints(6)).toBe(3);
    expect(getSprintPoints(7)).toBe(2);
    expect(getSprintPoints(8)).toBe(1);
  });

  it('should return 0 for positions outside top 8', () => {
    expect(getSprintPoints(9)).toBe(0);
    expect(getSprintPoints(20)).toBe(0);
  });
});
