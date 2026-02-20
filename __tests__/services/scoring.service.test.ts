/**
 * Unit tests for scoring service
 */

import { scoringService } from '../../src/services/scoring.service';
import { PRICING_CONFIG } from '../../src/config/pricing.config';
import type { RaceResult, SprintResult, FantasyDriver } from '../../src/types';

// Helper to create mock race result
const createRaceResult = (overrides: Partial<RaceResult> = {}): RaceResult => ({
  driverId: 'test',
  constructorId: 'test_team',
  position: 1,
  gridPosition: 1,
  positionsGained: 0,
  fastestLap: false,
  status: 'finished',
  points: 25,
  laps: 50,
  ...overrides,
});

// Helper to create mock sprint result
const createSprintResult = (overrides: Partial<SprintResult> = {}): SprintResult => ({
  driverId: 'test',
  constructorId: 'test_team',
  position: 1,
  status: 'finished',
  points: 8,
  ...overrides,
});

// Helper to create mock fantasy driver
const createFantasyDriver = (overrides: Partial<FantasyDriver> = {}): FantasyDriver => ({
  driverId: 'test',
  name: 'Test Driver',
  shortName: 'TST',
  constructorId: 'test_team',
  purchasePrice: 100,
  currentPrice: 100,
  pointsScored: 0,
  racesHeld: 0,
  ...overrides,
});

describe('scoringService.calculateRacePoints', () => {
  it('should return 25 points for P1 finish', () => {
    const result = createRaceResult({ position: 1 });
    const { points } = scoringService.calculateRacePoints(result);
    expect(points).toBe(25);
  });

  it('should return correct points for all top 10 positions', () => {
    const expectedPoints = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    for (let i = 0; i < 10; i++) {
      const result = createRaceResult({ position: i + 1 });
      const { points } = scoringService.calculateRacePoints(result);
      expect(points).toBe(expectedPoints[i]);
    }
  });

  it('should return 0 for positions outside top 10', () => {
    const result = createRaceResult({ position: 11 });
    const { points } = scoringService.calculateRacePoints(result);
    expect(points).toBe(0);
  });

  it('should add position gained bonus', () => {
    const result = createRaceResult({
      position: 5,
      gridPosition: 10,
      positionsGained: 5
    });
    const { points, breakdown } = scoringService.calculateRacePoints(result);
    // P5 = 10 points + 5 positions gained = 15 points
    expect(points).toBe(15);
    expect(breakdown.some(b => b.label === 'Positions Gained')).toBe(true);
  });

  it('should add fastest lap bonus for top 10 finish', () => {
    const result = createRaceResult({
      position: 5,
      fastestLap: true
    });
    const { points, breakdown } = scoringService.calculateRacePoints(result);
    // P5 = 10 points + 1 fastest lap = 11 points
    expect(points).toBe(11);
    expect(breakdown.some(b => b.label === 'Fastest Lap')).toBe(true);
  });

  it('should NOT add fastest lap bonus outside top 10', () => {
    const result = createRaceResult({
      position: 11,
      fastestLap: true
    });
    const { points } = scoringService.calculateRacePoints(result);
    expect(points).toBe(0);
  });

  it('should handle DNF correctly', () => {
    const result = createRaceResult({
      position: 0,
      status: 'dnf'
    });
    const { points, breakdown } = scoringService.calculateRacePoints(result);
    expect(points).toBe(-5); // DNF penalty
    expect(breakdown.some(b => b.label === 'Did Not Finish')).toBe(true);
  });

  it('should handle DSQ with penalty', () => {
    const result = createRaceResult({
      position: 0,
      status: 'dsq'
    });
    const { points, breakdown } = scoringService.calculateRacePoints(result);
    expect(points).toBe(-5);
    expect(breakdown.some(b => b.label === 'Disqualified')).toBe(true);
  });
});

describe('scoringService.calculateSprintPoints', () => {
  it('should return 8 points for P1 finish', () => {
    const result = createSprintResult({ position: 1 });
    const { points } = scoringService.calculateSprintPoints(result);
    expect(points).toBe(8);
  });

  it('should return correct points for top 8 positions', () => {
    const expectedPoints = [8, 7, 6, 5, 4, 3, 2, 1];
    for (let i = 0; i < 8; i++) {
      const result = createSprintResult({ position: i + 1 });
      const { points } = scoringService.calculateSprintPoints(result);
      expect(points).toBe(expectedPoints[i]);
    }
  });

  it('should return 0 for positions outside top 8', () => {
    const result = createSprintResult({ position: 9 });
    const { points } = scoringService.calculateSprintPoints(result);
    expect(points).toBe(0);
  });

  it('should handle sprint DNF', () => {
    const result = createSprintResult({ status: 'dnf' });
    const { points, breakdown } = scoringService.calculateSprintPoints(result);
    expect(points).toBe(-5); // DNF penalty
    expect(breakdown.some(b => b.label === 'Sprint DNF')).toBe(true);
  });
});

describe('scoringService.calculateLockBonus', () => {
  it('should return 0 for 0 races held', () => {
    const { bonus } = scoringService.calculateLockBonus(0);
    expect(bonus).toBe(0);
  });

  it('should apply tier 1 bonus (+1 per race) for 1-3 races', () => {
    expect(scoringService.calculateLockBonus(1).bonus).toBe(1);
    expect(scoringService.calculateLockBonus(2).bonus).toBe(2);
    expect(scoringService.calculateLockBonus(3).bonus).toBe(3);
  });

  it('should apply tier 2 bonus (+2 per race) for races 4-6', () => {
    // 3 races at tier 1 (3 pts) + 1 race at tier 2 (2 pts) = 5 pts
    expect(scoringService.calculateLockBonus(4).bonus).toBe(5);
    // 3 races at tier 1 (3 pts) + 3 races at tier 2 (6 pts) = 9 pts
    expect(scoringService.calculateLockBonus(6).bonus).toBe(9);
  });

  it('should apply tier 3 bonus (+3 per race) for 7+ races', () => {
    // 3 + 6 + 3 = 12 pts for 7 races
    expect(scoringService.calculateLockBonus(7).bonus).toBe(12);
    // 3 + 6 + 6 = 15 pts for 8 races
    expect(scoringService.calculateLockBonus(8).bonus).toBe(15);
  });

  it('should return full season bonus (100 pts) for 24 races', () => {
    const { bonus, breakdown } = scoringService.calculateLockBonus(24);
    expect(bonus).toBe(100);
    expect(breakdown.some(b => b.label === 'Full Season Lock')).toBe(true);
  });
});

describe('scoringService.calculateHotHandBonus (V3)', () => {
  it('should return podium bonus (15 pts) for P1-P3', () => {
    expect(scoringService.calculateHotHandBonus(1, 25).bonus).toBe(15);
    expect(scoringService.calculateHotHandBonus(2, 18).bonus).toBe(15);
    expect(scoringService.calculateHotHandBonus(3, 15).bonus).toBe(15);
  });

  it('should return standard bonus (10 pts) for 15+ points outside podium', () => {
    expect(scoringService.calculateHotHandBonus(4, 15).bonus).toBe(10);
    expect(scoringService.calculateHotHandBonus(5, 20).bonus).toBe(10);
  });

  it('should return 0 for less than 15 points outside podium', () => {
    expect(scoringService.calculateHotHandBonus(5, 10).bonus).toBe(0);
    expect(scoringService.calculateHotHandBonus(10, 1).bonus).toBe(0);
  });
});

describe('scoringService.calculateStaleRosterPenalty (V3)', () => {
  it('should return 0 penalty within threshold (5 races)', () => {
    expect(scoringService.calculateStaleRosterPenalty(0).penalty).toBe(0);
    expect(scoringService.calculateStaleRosterPenalty(3).penalty).toBe(0);
    expect(scoringService.calculateStaleRosterPenalty(5).penalty).toBe(0);
  });

  it('should return 5 pts penalty per race after threshold', () => {
    // 6 races = 1 over threshold = 5 pts penalty
    expect(scoringService.calculateStaleRosterPenalty(6).penalty).toBe(5);
    // 8 races = 3 over threshold = 15 pts penalty
    expect(scoringService.calculateStaleRosterPenalty(8).penalty).toBe(15);
    // 10 races = 5 over threshold = 25 pts penalty
    expect(scoringService.calculateStaleRosterPenalty(10).penalty).toBe(25);
  });
});

describe('scoringService.calculateValueCaptureBonus (V3)', () => {
  it('should return 0 for no profit', () => {
    expect(scoringService.calculateValueCaptureBonus(100, 100).bonus).toBe(0);
    expect(scoringService.calculateValueCaptureBonus(100, 90).bonus).toBe(0);
  });

  it('should return 5 pts per $10 profit', () => {
    // $10 profit = 5 pts
    expect(scoringService.calculateValueCaptureBonus(100, 110).bonus).toBe(5);
    // $50 profit = 25 pts
    expect(scoringService.calculateValueCaptureBonus(100, 150).bonus).toBe(25);
    // $100 profit = 50 pts
    expect(scoringService.calculateValueCaptureBonus(100, 200).bonus).toBe(50);
  });

  it('should floor partial profit units', () => {
    // $15 profit = 1 unit = 5 pts (not 7.5)
    expect(scoringService.calculateValueCaptureBonus(100, 115).bonus).toBe(5);
    // $19 profit = 1 unit = 5 pts
    expect(scoringService.calculateValueCaptureBonus(100, 119).bonus).toBe(5);
  });
});

describe('scoringService.calculateDriverScore (V3)', () => {
  it('should double points for ace', () => {
    const driver = createFantasyDriver();
    const raceResult = createRaceResult({ position: 1 }); // 25 pts

    const nonAceScore = scoringService.calculateDriverScore(
      'test', 'race1', raceResult, null, driver, undefined, { isAce: false }
    );

    const aceScore = scoringService.calculateDriverScore(
      'test', 'race1', raceResult, null, driver, undefined, { isAce: true }
    );

    // Ace should have 2x the race points
    expect(aceScore.totalPoints).toBe(nonAceScore.totalPoints + 25);
  });

  it('should add hot hand bonus for new transfers', () => {
    const driver = createFantasyDriver();
    const raceResult = createRaceResult({ position: 1 }); // Podium = 15 pts bonus

    const normalScore = scoringService.calculateDriverScore(
      'test', 'race1', raceResult, null, driver, undefined, { isNewTransfer: false }
    );

    const newTransferScore = scoringService.calculateDriverScore(
      'test', 'race1', raceResult, null, driver, undefined, { isNewTransfer: true }
    );

    expect(newTransferScore.totalPoints).toBe(normalScore.totalPoints + 15);
  });
});

describe('scoringService.getOrdinal', () => {
  it('should return correct ordinal suffixes', () => {
    expect(scoringService.getOrdinal(1)).toBe('1st');
    expect(scoringService.getOrdinal(2)).toBe('2nd');
    expect(scoringService.getOrdinal(3)).toBe('3rd');
    expect(scoringService.getOrdinal(4)).toBe('4th');
    expect(scoringService.getOrdinal(10)).toBe('10th');
    expect(scoringService.getOrdinal(11)).toBe('11th');
    expect(scoringService.getOrdinal(12)).toBe('12th');
    expect(scoringService.getOrdinal(13)).toBe('13th');
    expect(scoringService.getOrdinal(21)).toBe('21st');
    expect(scoringService.getOrdinal(22)).toBe('22nd');
    expect(scoringService.getOrdinal(23)).toBe('23rd');
  });
});
