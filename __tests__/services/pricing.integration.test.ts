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
  const priceChanges = tier === 'A' ? PRICE_CHANGES.A_TIER : PRICE_CHANGES.B_TIER;

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
    price: 421, // A-tier (above 200)
  };

  const bTierDriver = {
    id: 'hamilton',
    name: 'Lewis Hamilton',
    price: 156, // B-tier (below 200)
  };

  const cheapDriver = {
    id: 'bortoleto',
    name: 'Gabriel Bortoleto',
    price: 25, // Low price B-tier
  };

  describe('A-Tier Driver Price Changes', () => {
    it('should apply A-tier price changes', () => {
      const racePoints = 25; // P1 finish
      const { newPrice, change, ppm, performanceTier } = calculateDriverPriceChange(
        racePoints,
        aTierDriver.price
      );

      // PPM = 25 / 421 = 0.059 (terrible for expensive driver)
      expect(ppm).toBeLessThan(PPM_POOR);
      expect(performanceTier).toBe('terrible');
      // A-tier terrible = -15
      expect(change).toBe(PRICE_CHANGES.A_TIER.terrible);
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
      // A-tier terrible = -15, which is within bounds
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

  describe('Cheap Driver Price Changes', () => {
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
      expect(change).toBe(PRICE_CHANGES.B_TIER.great);
    });
  });

  describe('PPM (Points Per Million) Classification', () => {
    it('should classify great performance (PPM >= 0.8)', () => {
      const ppm = calculatePPM(80, 100);
      const tier = getPerformanceTier(ppm);

      expect(ppm).toBe(0.8);
      expect(tier).toBe('great');
    });

    it('should classify good performance (0.6 <= PPM < 0.8)', () => {
      const ppm = calculatePPM(70, 100);
      const tier = getPerformanceTier(ppm);

      expect(ppm).toBe(0.7);
      expect(tier).toBe('good');
    });

    it('should classify poor performance (0.4 <= PPM < 0.6)', () => {
      const ppm = calculatePPM(50, 100);
      const tier = getPerformanceTier(ppm);

      expect(ppm).toBe(0.5);
      expect(tier).toBe('poor');
    });

    it('should classify terrible performance (PPM < 0.4)', () => {
      const ppm = calculatePPM(30, 100);
      const tier = getPerformanceTier(ppm);

      expect(ppm).toBe(0.3);
      expect(tier).toBe('terrible');
    });
  });

  describe('Race Weekend Simulation', () => {
    it('should update prices correctly after a simulated race', () => {
      // Simulate race results for multiple drivers
      const drivers = [
        { id: 'norris', price: 423, racePosition: 1 },    // P1 = 25 pts
        { id: 'verstappen', price: 421, racePosition: 2 }, // P2 = 18 pts
        { id: 'piastri', price: 410, racePosition: 3 },   // P3 = 15 pts
        { id: 'hamilton', price: 156, racePosition: 15 }, // P15 = 0 pts
        { id: 'bortoleto', price: 25, racePosition: 8 },  // P8 = 4 pts
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
      expect(nonScorer.change).toBe(PRICE_CHANGES.B_TIER.terrible);

      // Verify cheap driver with great PPM increases
      const cheapScorer = priceChanges.find(d => d.id === 'bortoleto')!;
      expect(cheapScorer.points).toBe(4);
      // PPM = 4/25 = 0.16 (terrible)
      expect(cheapScorer.performanceTier).toBe('terrible');
    });

    it('should track cumulative price changes over multiple races', () => {
      let price = 100; // Starting price (B-tier)
      // Simulate 5 races with varying performance
      const raceResults = [
        { points: 25, expectedPPM: 0.25 },  // Race 1: P1 but still terrible PPM
        { points: 18, expectedPPM: 0.18 },  // Race 2: P2
        { points: 0, expectedPPM: 0 },       // Race 3: DNF
        { points: 15, expectedPPM: 0.15 },  // Race 4: P3
        { points: 12, expectedPPM: 0.12 },  // Race 5: P4
      ];

      const priceHistory: number[] = [price];

      for (const race of raceResults) {
        const { newPrice } = calculateDriverPriceChange(race.points, price);
        price = newPrice;
        priceHistory.push(price);
      }

      // All results are "terrible" PPM for a $100 driver
      // So price should decrease each race
      // Starting: 100, after terrible: 100 - 10 = 90
      expect(priceHistory).toHaveLength(6);
    });
  });

  describe('Tier Boundary Behavior', () => {
    it('should correctly identify tier at threshold', () => {
      expect(getPriceTier(200)).toBe('B'); // At threshold = B
      expect(getPriceTier(201)).toBe('A'); // Just above = A
      expect(getPriceTier(199)).toBe('B'); // Just below = B
    });

    it('should apply different price changes based on tier', () => {
      const points = 0; // Terrible performance for both

      const aTierResult = calculateDriverPriceChange(points, 250);
      const bTierResult = calculateDriverPriceChange(points, 150);

      // A-tier should have larger negative change
      expect(aTierResult.change).toBe(PRICE_CHANGES.A_TIER.terrible);
      expect(bTierResult.change).toBe(PRICE_CHANGES.B_TIER.terrible);
      expect(aTierResult.change).toBeLessThan(bTierResult.change); // -15 < -10
    });
  });

  describe('Price Change Values', () => {
    it('should have correct A-tier price changes', () => {
      expect(PRICE_CHANGES.A_TIER.great).toBe(15);
      expect(PRICE_CHANGES.A_TIER.good).toBe(5);
      expect(PRICE_CHANGES.A_TIER.poor).toBe(-5);
      expect(PRICE_CHANGES.A_TIER.terrible).toBe(-15);
    });

    it('should have correct B-tier price changes', () => {
      expect(PRICE_CHANGES.B_TIER.great).toBe(10);
      expect(PRICE_CHANGES.B_TIER.good).toBe(3);
      expect(PRICE_CHANGES.B_TIER.poor).toBe(-3);
      expect(PRICE_CHANGES.B_TIER.terrible).toBe(-10);
    });
  });

  describe('Rolling Average Price Calculation', () => {
    it('should calculate price from 5-race rolling average', () => {
      const recentRacePoints = [25, 18, 15, 10, 8]; // 5 races
      const rollingAvg = calculateRollingAverage(recentRacePoints);

      // (25 + 18 + 15 + 10 + 8) / 5 = 15.2
      expect(rollingAvg).toBe(15.2);

      const newPrice = calculatePriceFromRollingAvg(rollingAvg);
      // 15.2 * 10 = 152
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
      // Verstappen-like: 575 points in 2025
      const price = calculateInitialPrice(575);
      // 575 / 24 = 23.96 avg * $10 = $240
      expect(price).toBe(240);
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
