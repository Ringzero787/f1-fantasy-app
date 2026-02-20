/**
 * Unit tests for team validation and budget constraints
 */

import { BUDGET, TEAM_SIZE, SALE_COMMISSION_RATE } from '../../src/config/constants';
import { PRICING_CONFIG } from '../../src/config/pricing.config';
import type { Driver, Constructor } from '../../src/types';

// Mock drivers for testing
const createMockDriver = (id: string, price: number, tier: 'A' | 'B' = 'B'): Driver => ({
  id,
  name: `Driver ${id}`,
  shortName: id.toUpperCase().slice(0, 3),
  number: parseInt(id) || 1,
  constructorId: 'test_team',
  constructorName: 'Test Team',
  nationality: 'Test',
  price,
  previousPrice: price,
  seasonPoints: 0, // 2025 points (used for pricing)
  currentSeasonPoints: 0, // 2026 points (displayed)
  fantasyPoints: 0,
  tier,
  isActive: true,
});

const createMockConstructor = (id: string, price: number): Constructor => ({
  id,
  name: `Constructor ${id}`,
  shortName: id.toUpperCase().slice(0, 3),
  nationality: 'Test',
  primaryColor: '#FF0000',
  secondaryColor: '#000000',
  price,
  previousPrice: price,
  seasonPoints: 0,
  fantasyPoints: 0,
  isActive: true,
  drivers: [],
});

describe('Budget Constants', () => {
  it('should have correct starting budget', () => {
    expect(BUDGET).toBe(1000);
    expect(PRICING_CONFIG.STARTING_BUDGET).toBe(1000);
  });

  it('should have correct team size', () => {
    expect(TEAM_SIZE).toBe(5);
    expect(PRICING_CONFIG.TEAM_SIZE).toBe(5);
  });

  it('should have no sale commission', () => {
    expect(SALE_COMMISSION_RATE).toBe(0);
  });
});

describe('Team Budget Validation', () => {
  it('should allow team within budget', () => {
    const drivers = [
      createMockDriver('1', 200),
      createMockDriver('2', 200),
      createMockDriver('3', 200),
      createMockDriver('4', 150),
      createMockDriver('5', 150),
    ];
    const constructor = createMockConstructor('1', 100);

    const totalCost = drivers.reduce((sum, d) => sum + d.price, 0) + constructor.price;
    expect(totalCost).toBe(1000);
    expect(totalCost).toBeLessThanOrEqual(BUDGET);
  });

  it('should reject team over budget', () => {
    const drivers = [
      createMockDriver('1', 300),
      createMockDriver('2', 300),
      createMockDriver('3', 200),
      createMockDriver('4', 150),
      createMockDriver('5', 150),
    ];
    const constructor = createMockConstructor('1', 100);

    const totalCost = drivers.reduce((sum, d) => sum + d.price, 0) + constructor.price;
    expect(totalCost).toBe(1200);
    expect(totalCost).toBeGreaterThan(BUDGET);
  });

  it('should calculate remaining budget correctly', () => {
    const drivers = [
      createMockDriver('1', 200),
      createMockDriver('2', 150),
    ];

    const spent = drivers.reduce((sum, d) => sum + d.price, 0);
    const remaining = BUDGET - spent;

    expect(spent).toBe(350);
    expect(remaining).toBe(650);
  });

  it('should validate top 5 drivers cannot be afforded together', () => {
    // Based on current prices: top 5 A-tier drivers
    const topDrivers = [
      createMockDriver('norris', 510, 'A'),
      createMockDriver('verstappen', 500, 'A'),
      createMockDriver('piastri', 380, 'A'),
      createMockDriver('leclerc', 340, 'A'),
      createMockDriver('russell', 290, 'A'),
    ];

    const totalTopDriversCost = topDrivers.reduce((sum, d) => sum + d.price, 0);
    // 510 + 500 + 380 + 340 + 290 = 2020
    expect(totalTopDriversCost).toBeGreaterThan(BUDGET);
    // This ensures strategic budget allocation is required
  });
});

describe('Team Size Validation', () => {
  it('should require exactly 5 drivers', () => {
    const validateDriverCount = (count: number) => count === TEAM_SIZE;

    expect(validateDriverCount(5)).toBe(true);
    expect(validateDriverCount(4)).toBe(false);
    expect(validateDriverCount(6)).toBe(false);
  });

  it('should require exactly 1 constructor', () => {
    const validateConstructorCount = (count: number) => count === PRICING_CONFIG.CONSTRUCTORS;

    expect(validateConstructorCount(1)).toBe(true);
    expect(validateConstructorCount(0)).toBe(false);
    expect(validateConstructorCount(2)).toBe(false);
  });
});

describe('Ace Validation', () => {
  it('should allow ace for drivers at or below price threshold', () => {
    const driver = createMockDriver('1', 200, 'B');
    const canBeAce = driver.price <= PRICING_CONFIG.ACE_MAX_PRICE;
    expect(canBeAce).toBe(true);
  });

  it('should not allow ace for drivers above price threshold', () => {
    const driver = createMockDriver('1', 250, 'A');
    const canBeAce = driver.price <= PRICING_CONFIG.ACE_MAX_PRICE;
    expect(canBeAce).toBe(false);
  });

  it('should have ace threshold at 240', () => {
    expect(PRICING_CONFIG.ACE_MAX_PRICE).toBe(240);
  });
});

describe('Driver Tier Classification', () => {
  it('should classify drivers above 240 as A-tier', () => {
    const isATier = (price: number) => price > PRICING_CONFIG.A_TIER_THRESHOLD;

    expect(isATier(241)).toBe(true);
    expect(isATier(300)).toBe(true);
    expect(isATier(500)).toBe(true);
  });

  it('should classify drivers at or below 240 but above 120 as B-tier', () => {
    const isBTier = (price: number) =>
      price > PRICING_CONFIG.B_TIER_THRESHOLD && price <= PRICING_CONFIG.A_TIER_THRESHOLD;

    expect(isBTier(240)).toBe(true);
    expect(isBTier(150)).toBe(true);
    expect(isBTier(121)).toBe(true);
  });

  it('should classify drivers at or below 120 as C-tier', () => {
    const isCTier = (price: number) => price <= PRICING_CONFIG.B_TIER_THRESHOLD;

    expect(isCTier(120)).toBe(true);
    expect(isCTier(50)).toBe(true);
    expect(isCTier(5)).toBe(true);
  });
});

describe('Sale Value Calculation', () => {
  it('should sell at current market value (0% commission)', () => {
    const currentPrice = 100;
    const saleValue = Math.floor(currentPrice * (1 - SALE_COMMISSION_RATE));
    expect(saleValue).toBe(100);
  });

  it('should return budget correctly after selling', () => {
    const currentBudget = 50;
    const driverPrice = 100;
    const saleValue = Math.floor(driverPrice * (1 - SALE_COMMISSION_RATE));
    const newBudget = currentBudget + saleValue;

    expect(newBudget).toBe(150);
  });
});

describe('Duplicate Driver Validation', () => {
  it('should not allow same driver twice', () => {
    const selectedDriverIds = ['norris', 'verstappen', 'piastri'];
    const newDriverId = 'norris';

    const isDuplicate = selectedDriverIds.includes(newDriverId);
    expect(isDuplicate).toBe(true);
  });

  it('should allow different drivers', () => {
    const selectedDriverIds = ['norris', 'verstappen', 'piastri'];
    const newDriverId = 'hamilton';

    const isDuplicate = selectedDriverIds.includes(newDriverId);
    expect(isDuplicate).toBe(false);
  });
});

describe('Stale Roster Penalty', () => {
  it('should have penalty threshold at 5 races', () => {
    expect(PRICING_CONFIG.STALE_ROSTER_THRESHOLD).toBe(5);
  });

  it('should have penalty of 5 points per race after threshold', () => {
    expect(PRICING_CONFIG.STALE_ROSTER_PENALTY).toBe(5);
  });

  it('should calculate penalty correctly', () => {
    const racesSinceTransfer = 8;
    const racesOverThreshold = racesSinceTransfer - PRICING_CONFIG.STALE_ROSTER_THRESHOLD;
    const penalty = racesOverThreshold * PRICING_CONFIG.STALE_ROSTER_PENALTY;

    // 8 - 5 = 3 races over threshold, 3 * 5 = 15 penalty
    expect(penalty).toBe(15);
  });

  it('should have no penalty within threshold', () => {
    const racesSinceTransfer = 4;
    const racesOverThreshold = Math.max(0, racesSinceTransfer - PRICING_CONFIG.STALE_ROSTER_THRESHOLD);
    const penalty = racesOverThreshold * PRICING_CONFIG.STALE_ROSTER_PENALTY;

    expect(penalty).toBe(0);
  });
});
