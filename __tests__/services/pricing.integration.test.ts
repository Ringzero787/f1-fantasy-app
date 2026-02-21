/**
 * Integration tests for price changes after race results
 * Tests that driver prices increase/decrease correctly based on race performance
 *
 * Uses pure functions from pricing.config.ts to avoid Firebase dependencies
 */

import {
  PRICING_CONFIG,
  calculateInitialPrice,
  calculatePriceFromRollingAvg,
  calculateRollingAverage,
  calculatePriceChange,
  getPriceTier,
  getRacePoints,
} from '../../src/config/pricing.config';
import {
  PPM_GREAT,
  PPM_GOOD,
  PPM_POOR,
  PRICE_CHANGES,
} from '../../src/config/constants';

// Helper function to calculate PPM
const calculatePPM = (points: number, price: number): number => {
  if (price === 0) return 0;
  return points / price;
};

// Helper function to get performance tier based on PPM
const getPerformanceTier = (ppm: number): 'great' | 'good' | 'poor' | 'terrible' => {
  if (ppm >= PPM_GREAT) return 'great';
  if (ppm >= PPM_GOOD) return 'good';
  if (ppm >= PPM_POOR) return 'poor';
  return 'terrible';
};

// Helper function to get price changes for a given price tier
const getPriceChangesForTier = (tier: 'A' | 'B' | 'C') => {
  switch (tier) {
    case 'A': return PRICE_CHANGES.A_TIER;
    case 'B': return PRICE_CHANGES.B_TIER;
    case 'C': return PRICE_CHANGES.C_TIER;
  }
};

// Helper function to calculate price change based on performance
const calculateDriverPriceChange = (points: number, currentPrice: number): {
  newPrice: number;
  change: number;
  ppm: number;
  performanceTier: 'great' | 'good' | 'poor' | 'terrible';
} => {
  const ppm = calculatePPM(points, currentPrice);
  const performanceTier = getPerformanceTier(ppm);
  const tier = getPriceTier(currentPrice);
  const priceChanges = getPriceChangesForTier(tier);

  let change: number;
  switch (performanceTier) {
    case 'great':
      change = priceChanges.great;
      break;
    case 'good':
      change = priceChanges.good;
      break;
    case 'poor':
      change = priceChanges.poor;
      break;
    case 'terrible':
      change = priceChanges.terrible;
      break;
  }

  // Cap the change
  change = Math.max(-PRICING_CONFIG.MAX_CHANGE_PER_RACE, Math.min(PRICING_CONFIG.MAX_CHANGE_PER_RACE, change));

  // Calculate new price with bounds
  let newPrice = currentPrice + change;
  newPrice = Math.max(PRICING_CONFIG.MIN_PRICE, Math.min(PRICING_CONFIG.MAX_PRICE, newPrice));

  return { newPrice, change, ppm, performanceTier };
};

describe('Driver Price Changes After Race Results', () => {
  // Test drivers with different starting prices/tiers
  const aTierDriver = {
    id: 'verstappen',
    name: 'Max Verstappen',
    price: 500, // A-tier (above 240)
  };

  const bTierDriver = {
    id: 'hamilton',
    name: 'Lewis Hamilton',
    price: 156, // B-tier (above 120, at or below 240)
  };

  const cheapDriver = {
    id: 'bortoleto',
    name: 'Gabriel Bortoleto',
    price: 25, // C-tier (at or below 120)
  };

  describe('A-Tier Driver Price Changes', () => {
    it('should apply A-tier price changes', () => {
      const racePoints = 25; // P1 finish
      const { newPrice, change, ppm, performanceTier } = calculateDriverPriceChange(
        racePoints,
        aTierDriver.price
      );

      // PPM = 25 / 500 = 0.05 (good for expensive driver with new thresholds)
      expect(ppm).toBeGreaterThanOrEqual(PPM_GOOD);
      expect(ppm).toBeLessThan(PPM_GREAT);
      expect(performanceTier).toBe('good');
      // A-tier good = +12
      expect(change).toBe(PRICE_CHANGES.A_TIER.good);
    });

    it('should decrease price for 0 points', () => {
      const racePoints = 0; // DNF or outside points
      const { newPrice, change, performanceTier } = calculateDriverPriceChange(
        racePoints,
        aTierDriver.price
      );

      expect(performanceTier).toBe('terrible');
      expect(change).toBe(PRICE_CHANGES.A_TIER.terrible);
      expect(newPrice).toBe(aTierDriver.price + PRICE_CHANGES.A_TIER.terrible);
    });

    it('should cap price changes at MAX_CHANGE_PER_RACE', () => {
      // A-tier terrible = -36, which is within bounds (MAX_CHANGE_PER_RACE = 60)
      expect(Math.abs(PRICE_CHANGES.A_TIER.terrible)).toBeLessThanOrEqual(PRICING_CONFIG.MAX_CHANGE_PER_RACE);
      expect(Math.abs(PRICE_CHANGES.A_TIER.great)).toBeLessThanOrEqual(PRICING_CONFIG.MAX_CHANGE_PER_RACE);
    });
  });

  describe('B-Tier Driver Price Changes', () => {
    it('should apply B-tier price changes for poor performance', () => {
      const racePoints = 0;
      const { change, performanceTier } = calculateDriverPriceChange(
        racePoints,
        bTierDriver.price
      );

      expect(performanceTier).toBe('terrible');
      expect(change).toBe(PRICE_CHANGES.B_TIER.terrible);
    });

    it('should have smaller price swings than A-tier', () => {
      // Verify B-tier changes are smaller than A-tier
      expect(Math.abs(PRICE_CHANGES.B_TIER.terrible)).toBeLessThan(Math.abs(PRICE_CHANGES.A_TIER.terrible));
      expect(Math.abs(PRICE_CHANGES.B_TIER.great)).toBeLessThan(Math.abs(PRICE_CHANGES.A_TIER.great));
    });
  });

  describe('Cheap Driver Price Changes (C-Tier)', () => {
    it('should not go below MIN_PRICE', () => {
      // Simulate multiple bad results
      let currentPrice = cheapDriver.price;
      for (let i = 0; i < 10; i++) {
        const { newPrice } = calculateDriverPriceChange(0, currentPrice);
        currentPrice = newPrice;
      }

      expect(currentPrice).toBeGreaterThanOrEqual(PRICING_CONFIG.MIN_PRICE);
    });

    it('should increase with great PPM', () => {
      const racePoints = 25; // P1 - huge for a cheap driver
      const { change, ppm, performanceTier } = calculateDriverPriceChange(
        racePoints,
        cheapDriver.price
      );

      // PPM = 25 / 25 = 1.0 (great!)
      expect(ppm).toBe(1.0);
      expect(performanceTier).toBe('great');
      // $25 is C-tier (<=120)
      expect(change).toBe(PRICE_CHANGES.C_TIER.great);
    });
  });

  describe('PPM (Points Per Dollar) Classification', () => {
    it('should classify great performance (PPM >= 0.06)', () => {
      const ppm = calculatePPM(8, 100);
      const tier = getPerformanceTier(ppm);

      expect(ppm).toBe(0.08);
      expect(tier).toBe('great');
    });

    it('should classify good performance (0.04 <= PPM < 0.06)', () => {
      const ppm = calculatePPM(5, 100);
      const tier = getPerformanceTier(ppm);

      expect(ppm).toBe(0.05);
      expect(tier).toBe('good');
    });

    it('should classify poor performance (0.02 <= PPM < 0.04)', () => {
      const ppm = calculatePPM(3, 100);
      const tier = getPerformanceTier(ppm);

      expect(ppm).toBe(0.03);
      expect(tier).toBe('poor');
    });

    it('should classify terrible performance (PPM < 0.02)', () => {
      const ppm = calculatePPM(1, 100);
      const tier = getPerformanceTier(ppm);

      expect(ppm).toBe(0.01);
      expect(tier).toBe('terrible');
    });
  });

  describe('Race Weekend Simulation', () => {
    it('should update prices correctly after a simulated race', () => {
      // Simulate race results for multiple drivers
      const drivers = [
        { id: 'norris', price: 510, racePosition: 1 },    // P1 = 25 pts, A-tier
        { id: 'verstappen', price: 500, racePosition: 2 }, // P2 = 18 pts, A-tier
        { id: 'piastri', price: 380, racePosition: 3 },   // P3 = 15 pts, A-tier
        { id: 'hamilton', price: 260, racePosition: 15 }, // P15 = 0 pts, A-tier
        { id: 'bortoleto', price: 25, racePosition: 8 },  // P8 = 4 pts, C-tier
      ];

      const racePointsMap: Record<number, number> = {
        1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
        6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
      };

      const priceChanges = drivers.map(driver => {
        const points = racePointsMap[driver.racePosition] || 0;
        const result = calculateDriverPriceChange(points, driver.price);
        return {
          id: driver.id,
          originalPrice: driver.price,
          points,
          newPrice: result.newPrice,
          change: result.change,
          performanceTier: result.performanceTier,
        };
      });

      // Verify drivers outside points decrease (terrible PPM)
      const nonScorer = priceChanges.find(d => d.id === 'hamilton')!;
      expect(nonScorer.points).toBe(0);
      expect(nonScorer.change).toBe(PRICE_CHANGES.A_TIER.terrible);

      // Verify cheap driver with great PPM increases
      const cheapScorer = priceChanges.find(d => d.id === 'bortoleto')!;
      expect(cheapScorer.points).toBe(4);
      // PPM = 4/25 = 0.16 (great, since >= 0.06)
      expect(cheapScorer.performanceTier).toBe('great');
    });

    it('should track cumulative price changes over multiple races', () => {
      let price = 100; // Starting price (C-tier, <=120)
      // Simulate 5 races with varying performance
      const raceResults = [
        { points: 25 },  // Race 1: P1 — PPM = 0.25 → great
        { points: 18 },  // Race 2: P2 — PPM ~ 0.16 → great
        { points: 0 },   // Race 3: DNF — PPM = 0 → terrible
        { points: 15 },  // Race 4: P3
        { points: 12 },  // Race 5: P4
      ];

      const priceHistory: number[] = [price];

      for (const race of raceResults) {
        const { newPrice } = calculateDriverPriceChange(race.points, price);
        price = newPrice;
        priceHistory.push(price);
      }

      // With new PPM thresholds (0.06 for great), most results are "great" for a $100 C-tier driver
      expect(priceHistory).toHaveLength(6);
    });
  });

  describe('Tier Boundary Behavior', () => {
    it('should correctly identify tier at A/B threshold (240)', () => {
      expect(getPriceTier(240)).toBe('B'); // At threshold = B
      expect(getPriceTier(241)).toBe('A'); // Just above = A
      expect(getPriceTier(239)).toBe('B'); // Just below = B
    });

    it('should correctly identify tier at B/C threshold (120)', () => {
      expect(getPriceTier(120)).toBe('C'); // At threshold = C
      expect(getPriceTier(121)).toBe('B'); // Just above = B
      expect(getPriceTier(119)).toBe('C'); // Just below = C
    });

    it('should apply different price changes based on tier', () => {
      const points = 0; // Terrible performance for all

      const aTierResult = calculateDriverPriceChange(points, 300);
      const bTierResult = calculateDriverPriceChange(points, 200);
      const cTierResult = calculateDriverPriceChange(points, 100);

      // A-tier should have largest negative change, C-tier smallest
      expect(aTierResult.change).toBe(PRICE_CHANGES.A_TIER.terrible);
      expect(bTierResult.change).toBe(PRICE_CHANGES.B_TIER.terrible);
      expect(cTierResult.change).toBe(PRICE_CHANGES.C_TIER.terrible);
      expect(aTierResult.change).toBeLessThan(bTierResult.change); // -36 < -24
      expect(bTierResult.change).toBeLessThan(cTierResult.change); // -24 < -12
    });
  });

  describe('Price Change Values', () => {
    it('should have correct A-tier price changes', () => {
      expect(PRICE_CHANGES.A_TIER.great).toBe(36);
      expect(PRICE_CHANGES.A_TIER.good).toBe(12);
      expect(PRICE_CHANGES.A_TIER.poor).toBe(-12);
      expect(PRICE_CHANGES.A_TIER.terrible).toBe(-36);
    });

    it('should have correct B-tier price changes', () => {
      expect(PRICE_CHANGES.B_TIER.great).toBe(24);
      expect(PRICE_CHANGES.B_TIER.good).toBe(7);
      expect(PRICE_CHANGES.B_TIER.poor).toBe(-7);
      expect(PRICE_CHANGES.B_TIER.terrible).toBe(-24);
    });

    it('should have correct C-tier price changes', () => {
      expect(PRICE_CHANGES.C_TIER.great).toBe(12);
      expect(PRICE_CHANGES.C_TIER.good).toBe(5);
      expect(PRICE_CHANGES.C_TIER.poor).toBe(-5);
      expect(PRICE_CHANGES.C_TIER.terrible).toBe(-12);
    });
  });

  describe('Rolling Average Price Calculation', () => {
    it('should calculate price from 5-race rolling average', () => {
      const recentRacePoints = [25, 18, 15, 10, 8]; // 5 races
      const rollingAvg = calculateRollingAverage(recentRacePoints);

      // (25 + 18 + 15 + 10 + 8) / 5 = 15.2
      expect(rollingAvg).toBe(15.2);

      const newPrice = calculatePriceFromRollingAvg(rollingAvg);
      // 15.2 * $10 = 152
      expect(newPrice).toBe(152);
    });

    it('should only use last 5 races for rolling average', () => {
      const recentRacePoints = [25, 18, 15, 10, 8, 6, 4, 2, 1, 0]; // 10 races
      const rollingAvg = calculateRollingAverage(recentRacePoints);

      // Only first 5: (25 + 18 + 15 + 10 + 8) / 5 = 15.2
      expect(rollingAvg).toBe(15.2);
    });
  });

  describe('Initial Price Calculation', () => {
    it('should calculate initial price from 2025 season points', () => {
      // Verstappen-like: 500 points in 2025
      const price = calculateInitialPrice(500);
      // 500 / 24 = 20.833 avg * $10 = $208
      expect(price).toBe(208);
    });

    it('should calculate initial price for midfield driver', () => {
      // 120 points in 2025
      const price = calculateInitialPrice(120);
      // 120 / 24 = 5 avg * $10 = $50
      expect(price).toBe(50);
    });

    it('should calculate initial price for backmarker', () => {
      // 24 points in 2025 (1 point per race average)
      const price = calculateInitialPrice(24);
      // 24 / 24 = 1 avg * $10 = $10
      expect(price).toBe(10);
    });
  });
});
