/**
 * Unit tests for contract expiry and auto-fill logic.
 *
 * These test the pure logic extracted from recalculateAllTeamsPoints
 * without needing to run the full Zustand store.
 */

import { PRICING_CONFIG } from '../../src/config/pricing.config';
import type { FantasyDriver } from '../../src/types';

// ── Pure helpers extracted from team.store for testability ──

/** Calculate sale value after commission. */
function calculateSaleValue(currentPrice: number, commissionRate = 0): number {
  return Math.floor(currentPrice * (1 - commissionRate));
}

/** Filter out expired drivers and compute budget return. */
function expireDrivers(
  drivers: FantasyDriver[],
  captainId?: string,
): { remaining: FantasyDriver[]; budgetReturn: number; captainCleared: boolean } {
  let budgetReturn = 0;
  let captainCleared = false;

  const remaining = drivers.filter(driver => {
    const contractLen = driver.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
    if (driver.racesHeld >= contractLen) {
      budgetReturn += calculateSaleValue(driver.currentPrice);
      if (captainId === driver.driverId) {
        captainCleared = true;
      }
      return false;
    }
    return true;
  });

  return { remaining, budgetReturn, captainCleared };
}

interface CandidateDriver {
  id: string;
  name: string;
  shortName: string;
  constructorId: string;
  marketPrice: number;
  isActive: boolean;
}

/** Auto-fill empty slots with cheapest available drivers. */
function autoFillDrivers(
  currentDrivers: FantasyDriver[],
  candidates: CandidateDriver[],
  budget: number,
  teamSize: number,
): { drivers: FantasyDriver[]; spent: number } {
  const teamDriverIds = new Set(currentDrivers.map(d => d.driverId));
  const sorted = [...candidates]
    .filter(c => c.isActive && !teamDriverIds.has(c.id))
    .sort((a, b) => a.marketPrice - b.marketPrice);

  const newDrivers: FantasyDriver[] = [...currentDrivers];
  let spent = 0;
  let remainingBudget = budget;

  for (const candidate of sorted) {
    if (newDrivers.length >= teamSize) break;
    if (candidate.marketPrice > remainingBudget) break;

    newDrivers.push({
      driverId: candidate.id,
      name: candidate.name,
      shortName: candidate.shortName,
      constructorId: candidate.constructorId,
      purchasePrice: candidate.marketPrice,
      currentPrice: candidate.marketPrice,
      pointsScored: 0,
      racesHeld: 0,
      contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
      isReservePick: true,
    });
    teamDriverIds.add(candidate.id);
    remainingBudget -= candidate.marketPrice;
    spent += candidate.marketPrice;
  }

  return { drivers: newDrivers, spent };
}

// ── Tests ──

describe('Contract Expiry', () => {
  it('CONTRACT_LENGTH constant should be 5', () => {
    expect(PRICING_CONFIG.CONTRACT_LENGTH).toBe(5);
  });

  it('removes driver with racesHeld >= contractLength', () => {
    const drivers: FantasyDriver[] = [
      { driverId: 'd1', name: 'A', shortName: 'AAA', constructorId: 'c1', purchasePrice: 100, currentPrice: 110, pointsScored: 50, racesHeld: 5, contractLength: 5 },
      { driverId: 'd2', name: 'B', shortName: 'BBB', constructorId: 'c2', purchasePrice: 80, currentPrice: 90, pointsScored: 30, racesHeld: 3, contractLength: 5 },
    ];

    const { remaining, budgetReturn } = expireDrivers(drivers);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].driverId).toBe('d2');
    expect(budgetReturn).toBe(110); // currentPrice with 0% commission
  });

  it('uses default CONTRACT_LENGTH when contractLength is undefined', () => {
    const drivers: FantasyDriver[] = [
      { driverId: 'd1', name: 'A', shortName: 'AAA', constructorId: 'c1', purchasePrice: 100, currentPrice: 100, pointsScored: 0, racesHeld: 5 },
    ];

    const { remaining } = expireDrivers(drivers);
    expect(remaining).toHaveLength(0); // Should expire with default 5
  });

  it('does not remove drivers under contract length', () => {
    const drivers: FantasyDriver[] = [
      { driverId: 'd1', name: 'A', shortName: 'AAA', constructorId: 'c1', purchasePrice: 100, currentPrice: 100, pointsScored: 0, racesHeld: 4, contractLength: 5 },
    ];

    const { remaining, budgetReturn } = expireDrivers(drivers);
    expect(remaining).toHaveLength(1);
    expect(budgetReturn).toBe(0);
  });

  it('clears captain if expired driver was captain', () => {
    const drivers: FantasyDriver[] = [
      { driverId: 'captain1', name: 'Cap', shortName: 'CAP', constructorId: 'c1', purchasePrice: 100, currentPrice: 100, pointsScored: 0, racesHeld: 5, contractLength: 5 },
    ];

    const { captainCleared } = expireDrivers(drivers, 'captain1');
    expect(captainCleared).toBe(true);
  });

  it('does not clear captain if non-captain driver expires', () => {
    const drivers: FantasyDriver[] = [
      { driverId: 'd1', name: 'A', shortName: 'AAA', constructorId: 'c1', purchasePrice: 100, currentPrice: 100, pointsScored: 0, racesHeld: 5, contractLength: 5 },
    ];

    const { captainCleared } = expireDrivers(drivers, 'other_captain');
    expect(captainCleared).toBe(false);
  });

  it('returns correct budget for multiple expired drivers', () => {
    const drivers: FantasyDriver[] = [
      { driverId: 'd1', name: 'A', shortName: 'AAA', constructorId: 'c1', purchasePrice: 100, currentPrice: 50, pointsScored: 0, racesHeld: 6, contractLength: 5 },
      { driverId: 'd2', name: 'B', shortName: 'BBB', constructorId: 'c2', purchasePrice: 200, currentPrice: 150, pointsScored: 0, racesHeld: 5, contractLength: 5 },
      { driverId: 'd3', name: 'C', shortName: 'CCC', constructorId: 'c3', purchasePrice: 80, currentPrice: 90, pointsScored: 0, racesHeld: 2, contractLength: 5 },
    ];

    const { remaining, budgetReturn } = expireDrivers(drivers);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].driverId).toBe('d3');
    expect(budgetReturn).toBe(50 + 150); // Two expired drivers
  });
});

describe('Auto-Fill', () => {
  const candidates: CandidateDriver[] = [
    { id: 'cheap1', name: 'Cheap 1', shortName: 'CH1', constructorId: 'c1', marketPrice: 10, isActive: true },
    { id: 'cheap2', name: 'Cheap 2', shortName: 'CH2', constructorId: 'c2', marketPrice: 15, isActive: true },
    { id: 'mid1', name: 'Mid 1', shortName: 'MD1', constructorId: 'c3', marketPrice: 50, isActive: true },
    { id: 'expensive1', name: 'Expensive', shortName: 'EXP', constructorId: 'c4', marketPrice: 200, isActive: true },
    { id: 'inactive1', name: 'Inactive', shortName: 'INA', constructorId: 'c5', marketPrice: 5, isActive: false },
  ];

  it('fills empty slots with cheapest available drivers', () => {
    const currentDrivers: FantasyDriver[] = [
      { driverId: 'existing1', name: 'E1', shortName: 'E01', constructorId: 'c1', purchasePrice: 100, currentPrice: 100, pointsScored: 0, racesHeld: 0 },
    ];

    const { drivers, spent } = autoFillDrivers(currentDrivers, candidates, 100, 5);
    // Should fill 4 slots with cheapest: cheap1(10), cheap2(15), mid1(50) = 75 total; 4th would be expensive(200) which exceeds remaining 25
    expect(drivers).toHaveLength(4); // 1 existing + 3 affordable
    expect(drivers[1].driverId).toBe('cheap1');
    expect(drivers[1].isReservePick).toBe(true);
    expect(drivers[1].contractLength).toBe(PRICING_CONFIG.CONTRACT_LENGTH);
    expect(spent).toBe(10 + 15 + 50);
  });

  it('does not add drivers already on team', () => {
    const currentDrivers: FantasyDriver[] = [
      { driverId: 'cheap1', name: 'Cheap 1', shortName: 'CH1', constructorId: 'c1', purchasePrice: 10, currentPrice: 10, pointsScored: 0, racesHeld: 0 },
    ];

    const { drivers } = autoFillDrivers(currentDrivers, candidates, 500, 5);
    // cheap1 already on team, should skip it
    const driverIds = drivers.map(d => d.driverId);
    expect(driverIds.filter(id => id === 'cheap1')).toHaveLength(1);
  });

  it('stops at team size', () => {
    const currentDrivers: FantasyDriver[] = [];
    const { drivers } = autoFillDrivers(currentDrivers, candidates, 1000, 3);
    expect(drivers).toHaveLength(3);
  });

  it('stops when budget is exhausted', () => {
    const currentDrivers: FantasyDriver[] = [];
    // Budget of 20: can afford cheap1(10), then 10 remaining < cheap2(15), so only 1 auto-fill
    const { drivers, spent } = autoFillDrivers(currentDrivers, candidates, 20, 5);
    expect(drivers).toHaveLength(1); // Only cheap1 fits
    expect(spent).toBe(10);
  });

  it('skips inactive drivers', () => {
    const currentDrivers: FantasyDriver[] = [];
    const { drivers } = autoFillDrivers(currentDrivers, candidates, 500, 5);
    const driverIds = drivers.map(d => d.driverId);
    expect(driverIds).not.toContain('inactive1');
  });

  it('marks all auto-filled drivers as reserve picks', () => {
    const currentDrivers: FantasyDriver[] = [];
    const { drivers } = autoFillDrivers(currentDrivers, candidates, 500, 5);
    // All should be reserve picks
    drivers.forEach(d => {
      expect(d.isReservePick).toBe(true);
    });
  });

  it('returns empty addition when no budget', () => {
    const currentDrivers: FantasyDriver[] = [];
    const { drivers, spent } = autoFillDrivers(currentDrivers, candidates, 0, 5);
    expect(drivers).toHaveLength(0);
    expect(spent).toBe(0);
  });
});
