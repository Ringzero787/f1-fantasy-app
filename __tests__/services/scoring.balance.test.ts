/**
 * Tests for scoring balance - V3/V4 features working together correctly
 *
 * Verifies:
 * - Ace system (2x) interacts correctly with other bonuses
 * - Hot hand + ace don't double-dip
 * - Catch-up multiplier (V4) applies at the right time
 * - Stale roster penalty balances active management incentive
 * - Full race weekend simulations produce reasonable point ranges
 */

import { scoringService } from '../../src/services/scoring.service';
import { PRICING_CONFIG } from '../../src/config/pricing.config';
import type {
  RaceResult,
  SprintResult,
  FantasyDriver,
  FantasyConstructor,
  FantasyTeam,
  DriverScore,
  ConstructorScore,
} from '../../src/types';

// ============================================
// Factory helpers
// ============================================

const createRaceResult = (overrides: Partial<RaceResult> = {}): RaceResult => ({
  driverId: 'driver_1',
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

const createSprintResult = (overrides: Partial<SprintResult> = {}): SprintResult => ({
  driverId: 'driver_1',
  constructorId: 'test_team',
  position: 1,
  status: 'finished',
  points: 8,
  ...overrides,
});

const createFantasyDriver = (overrides: Partial<FantasyDriver> = {}): FantasyDriver => ({
  driverId: 'driver_1',
  name: 'Test Driver',
  shortName: 'TST',
  constructorId: 'test_team',
  purchasePrice: 100,
  currentPrice: 100,
  pointsScored: 0,
  racesHeld: 0,
  ...overrides,
});

const createFantasyConstructor = (overrides: Partial<FantasyConstructor> = {}): FantasyConstructor => ({
  constructorId: 'test_constructor',
  name: 'Test Constructor',
  purchasePrice: 100,
  currentPrice: 100,
  pointsScored: 0,
  racesHeld: 0,
  ...overrides,
});

const createTeam = (overrides: Record<string, unknown> = {}): FantasyTeam => ({
  id: 'team_1',
  userId: 'user_1',
  leagueId: 'league_1',
  name: 'Test Team',
  drivers: [],
  constructor: null,
  budget: 1000,
  totalSpent: 0,
  totalPoints: 0,
  isLocked: false,
  lockStatus: {
    isSeasonLocked: false,
    seasonLockRacesRemaining: 24,
    canModify: true,
  },
  createdAt: new Date(),
  updatedAt: new Date(),
  racesSinceTransfer: 0,
  racesPlayed: 0,
  pointsHistory: [],
  joinedAtRace: 0,
  raceWins: 0,
  ...overrides,
} as FantasyTeam);

const createDriverScore = (overrides: Partial<DriverScore> = {}): DriverScore => ({
  driverId: 'driver_1',
  raceId: 'race_1',
  racePoints: 25,
  sprintPoints: 0,
  qualifyingPoints: 0,
  positionBonus: 0,
  fastestLapBonus: 0,
  penalties: 0,
  lockBonus: 0,
  totalPoints: 25,
  breakdown: { items: [], total: 25 },
  ...overrides,
});

// ============================================
// Ace + Hot Hand Interaction
// ============================================

describe('Ace + Hot Hand Balance', () => {
  it('ace doubles race+sprint only, not lock bonus', () => {
    const driver = createFantasyDriver({ racesHeld: 5 });
    const raceResult = createRaceResult({ position: 1 }); // 25 race + 22 bonus = 47 pts

    const score = scoringService.calculateDriverScore(
      'driver_1', 'race_1', raceResult, null, driver, undefined, { isAce: true }
    );

    // Race: 47 (25 race + 22 position bonus), Ace bonus: 47 (doubles base)
    // Lock: 3×1 + 2×2 = 7 (NOT doubled)
    // Total: 47 + 47 + 7 = 101
    expect(score.racePoints).toBe(47);
    expect(score.lockBonus).toBe(7);
    expect(score.totalPoints).toBe(101);
  });

  it('ace + sprint weekend doubles both race and sprint', () => {
    const driver = createFantasyDriver({ racesHeld: 0 });
    const raceResult = createRaceResult({ position: 1 }); // 25 + 22 = 47 pts
    const sprintResult = createSprintResult({ position: 1 }); // 8 pts

    const score = scoringService.calculateDriverScore(
      'driver_1', 'race_1', raceResult, sprintResult, driver, undefined, { isAce: true }
    );

    // Base: 47 + 8 = 55
    // Ace: +55
    // Total: 110
    expect(score.totalPoints).toBe(110);
  });

  it('hot hand podium bonus is NOT doubled by ace', () => {
    const driver = createFantasyDriver({ racesHeld: 0 });
    const raceResult = createRaceResult({ position: 1 }); // 25 + 22 = 47 pts

    // Both ace + new transfer
    const score = scoringService.calculateDriverScore(
      'driver_1', 'race_1', raceResult, null, driver, undefined,
      { isAce: true, isNewTransfer: true }
    );

    // Race: 47, Ace bonus: 47, Hot hand podium: 15
    // Total: 47 + 47 + 15 = 109
    expect(score.totalPoints).toBe(109);
  });

  it('hot hand 15+ point bonus triggers on high-scoring non-podium', () => {
    const driver = createFantasyDriver({ racesHeld: 0 });
    // P4 (12 race + 19 bonus = 31) + 5 positions gained (5pts) = 36 base → qualifies for 15+ bonus
    const raceResult = createRaceResult({
      position: 4,
      gridPosition: 9,
      positionsGained: 5,
    });

    const score = scoringService.calculateDriverScore(
      'driver_1', 'race_1', raceResult, null, driver, undefined,
      { isNewTransfer: true }
    );

    // Race: 31 + 5 = 36, Hot hand: 10 (scored 36 ≥ 15)
    expect(score.totalPoints).toBe(46);
  });

  it('hot hand does NOT trigger for low-scoring new transfer', () => {
    const driver = createFantasyDriver({ racesHeld: 0 });
    const raceResult = createRaceResult({ position: 18 }); // 0 race + 5 bonus = 5 pts, no gains

    const score = scoringService.calculateDriverScore(
      'driver_1', 'race_1', raceResult, null, driver, undefined,
      { isNewTransfer: true }
    );

    // Race: 5 (position bonus only), no hot hand (5 < 15 and P18 not podium)
    expect(score.totalPoints).toBe(5);
  });
});

// ============================================
// V4: Catch-Up Multiplier
// ============================================

describe('V4: Catch-Up Multiplier', () => {
  it('should return 1x for teams that joined at race 0 (season start)', () => {
    const result = scoringService.calculateCatchUpMultiplier(0, 5);
    expect(result.multiplier).toBe(1);
    expect(result.isInCatchUp).toBe(false);
  });

  it('should return 1.5x for first 3 races after late join', () => {
    // Joined at race 5, now race 5 → 0 races since joining < 3
    const r1 = scoringService.calculateCatchUpMultiplier(5, 5);
    expect(r1.multiplier).toBe(1.5);
    expect(r1.isInCatchUp).toBe(true);
    expect(r1.racesRemaining).toBe(3);

    // Joined at race 5, now race 6 → 1 race since joining < 3
    const r2 = scoringService.calculateCatchUpMultiplier(5, 6);
    expect(r2.multiplier).toBe(1.5);
    expect(r2.racesRemaining).toBe(2);

    // Joined at race 5, now race 7 → 2 races since joining < 3
    const r3 = scoringService.calculateCatchUpMultiplier(5, 7);
    expect(r3.multiplier).toBe(1.5);
    expect(r3.racesRemaining).toBe(1);
  });

  it('should return 1x after 3 races of catch-up', () => {
    // Joined at race 5, now race 8 → 3 races since = end of catch-up
    const result = scoringService.calculateCatchUpMultiplier(5, 8);
    expect(result.multiplier).toBe(1);
    expect(result.isInCatchUp).toBe(false);
    expect(result.racesRemaining).toBe(0);
  });

  it('should apply 1.5x to full team score for late joiners', () => {
    const driverScores: DriverScore[] = [
      createDriverScore({ totalPoints: 40 }),
      createDriverScore({ totalPoints: 20 }),
    ];

    const team = createTeam({ joinedAtRace: 5 });
    const result = scoringService.calculateTeamPointsV3(team, driverScores, null, 6);

    // Base: 40+20 = 60
    // Catch-up bonus: floor(60 * 0.5) = 30
    // Total: 90
    expect(result.total).toBe(90);
    expect(result.catchUpBonus).toBe(30);
  });

  it('should NOT apply catch-up after 3 races', () => {
    const driverScores: DriverScore[] = [
      createDriverScore({ totalPoints: 40 }),
    ];

    // Joined at race 3, now race 6 → 3 races since, catch-up expired
    const team = createTeam({ joinedAtRace: 3 });
    const result = scoringService.calculateTeamPointsV3(team, driverScores, null, 6);

    expect(result.total).toBe(40);
    expect(result.catchUpBonus).toBe(0);
  });

  it('catch-up applies after stale penalty deduction', () => {
    const driverScores: DriverScore[] = [
      createDriverScore({ totalPoints: 100 }),
    ];

    // Late joiner in catch-up, but also stale roster
    const team = createTeam({
      joinedAtRace: 10,
      racesSinceTransfer: 7, // 2 over threshold → -10 penalty
    });
    const result = scoringService.calculateTeamPointsV3(team, driverScores, null, 11);

    // Base: 100, Stale penalty: -10, Subtotal: 90
    // Catch-up: floor(90 * 0.5) = 45
    // Total: 90 + 45 = 135
    expect(result.staleRosterPenalty).toBe(10);
    expect(result.catchUpBonus).toBe(45);
    expect(result.total).toBe(135);
  });
});

// ============================================
// Full Race Weekend Simulation
// ============================================

describe('Full Race Weekend Scoring Balance', () => {
  /**
   * Simulate a complete 5-driver team weekend and verify point ranges are reasonable
   */
  it('dominant team weekend should score in expected range', () => {
    const drivers = [
      { position: 1, grid: 1, held: 10 },  // P1, no gain, long lock
      { position: 3, grid: 5, held: 5 },   // P3, +2, mid lock
      { position: 5, grid: 8, held: 3 },   // P5, +3, short lock
      { position: 8, grid: 10, held: 1 },  // P8, +2, minimal lock
      { position: 12, grid: 15, held: 0 }, // P12, +3, new
    ];

    const driverScores: DriverScore[] = drivers.map((d, i) => {
      const fantasyDriver = createFantasyDriver({
        driverId: `d${i}`,
        racesHeld: d.held,
      });
      const raceResult = createRaceResult({
        driverId: `d${i}`,
        position: d.position,
        gridPosition: d.grid,
        positionsGained: Math.max(0, d.grid - d.position),
      });

      return scoringService.calculateDriverScore(
        `d${i}`, 'race_1', raceResult, null, fantasyDriver, undefined,
        { isAce: i === 0 } // First driver is ace
      );
    });

    const team = createTeam();
    const result = scoringService.calculateTeamPointsV3(team, driverScores, null);

    // A good team should score meaningfully in a race
    expect(result.total).toBeGreaterThan(50);
    // But shouldn't be astronomically high
    expect(result.total).toBeLessThan(300);
  });

  it('terrible race weekend still scores from position bonus + lock bonuses', () => {
    // All drivers finish outside top 10 but get position bonus + lock bonuses
    const driverScores: DriverScore[] = [];
    for (let i = 0; i < 5; i++) {
      const driver = createFantasyDriver({ driverId: `d${i}`, racesHeld: 8 });
      const raceResult = createRaceResult({
        driverId: `d${i}`,
        position: 15 + i, // P15-P19
      });
      driverScores.push(
        scoringService.calculateDriverScore(`d${i}`, 'race_1', raceResult, null, driver)
      );
    }

    const team = createTeam();
    const result = scoringService.calculateTeamPointsV3(team, driverScores, null);

    // Position bonuses: P15=8, P16=7, P17=6, P18=5, P19=4 = 30
    // Lock bonus: 5 × (3+6+6) = 5 × 15 = 75
    // Total: 30 + 75 = 105
    expect(result.total).toBe(105);
  });

  it('sprint weekend adds meaningful but not overwhelming points', () => {
    const driver = createFantasyDriver({ racesHeld: 0 });
    const raceResult = createRaceResult({ position: 1 }); // 25 pts
    const sprintResult = createSprintResult({ position: 1 }); // 8 pts

    const withSprint = scoringService.calculateDriverScore(
      'driver_1', 'race_1', raceResult, sprintResult, driver
    );
    const withoutSprint = scoringService.calculateDriverScore(
      'driver_1', 'race_1', raceResult, null, driver
    );

    // Sprint adds 8 points for P1 (~17% of race P1 points with position bonus)
    const sprintContribution = withSprint.totalPoints - withoutSprint.totalPoints;
    expect(sprintContribution).toBe(8);
    expect(sprintContribution / withoutSprint.totalPoints).toBeLessThan(0.5);
  });
});

// ============================================
// Stale Roster Balance
// ============================================

describe('Stale Roster Penalty Balance', () => {
  it('5 races without transfer → no penalty (exactly at threshold)', () => {
    const { penalty } = scoringService.calculateStaleRosterPenalty(5);
    expect(penalty).toBe(0);
  });

  it('10 races without transfer → 25 pts penalty (meaningful but not crippling)', () => {
    const { penalty } = scoringService.calculateStaleRosterPenalty(10);
    // 5 races over threshold × 5 pts = 25
    expect(penalty).toBe(25);
  });

  it('stale penalty caps at a reasonable fraction of team score', () => {
    // A good team scores ~80-120 points per race
    // After 8 races without transfer: 3 over × 5 = 15 penalty
    // That's about 12-19% of a good team's score - significant but survivable
    const { penalty } = scoringService.calculateStaleRosterPenalty(8);
    expect(penalty).toBe(15);
    expect(penalty).toBeLessThan(100); // Never more than a typical team score
  });
});

// ============================================
// Value Capture Bonus Balance
// ============================================

describe('Value Capture Bonus Balance', () => {
  it('small profit ($10) gives modest bonus', () => {
    const { bonus } = scoringService.calculateValueCaptureBonus(100, 110);
    expect(bonus).toBe(5);
  });

  it('large profit ($100) gives substantial bonus but not game-breaking', () => {
    const { bonus } = scoringService.calculateValueCaptureBonus(100, 200);
    expect(bonus).toBe(50);
    // A typical race weekend is 60-120 pts, so 50 pts bonus for $100 profit is big
    // but requires significant price appreciation
  });

  it('no reward for selling at a loss', () => {
    const { bonus } = scoringService.calculateValueCaptureBonus(200, 150);
    expect(bonus).toBe(0);
  });

  it('breaking even gives no bonus', () => {
    const { bonus } = scoringService.calculateValueCaptureBonus(150, 150);
    expect(bonus).toBe(0);
  });
});

// ============================================
// Lock Bonus Progression Balance
// ============================================

describe('Lock Bonus Progression', () => {
  it('should accelerate rewards for longer holds', () => {
    const bonus3 = scoringService.calculateLockBonus(3).bonus;  // 3×1 = 3
    const bonus6 = scoringService.calculateLockBonus(6).bonus;  // 3+6 = 9
    const bonus10 = scoringService.calculateLockBonus(10).bonus; // 3+6+12 = 21

    // Each tier rewards more per additional race
    const avgPerRace3 = bonus3 / 3;   // 1.0 per race
    const avgPerRace6 = bonus6 / 6;   // 1.5 per race
    const avgPerRace10 = bonus10 / 10; // 2.1 per race

    expect(avgPerRace6).toBeGreaterThan(avgPerRace3);
    expect(avgPerRace10).toBeGreaterThan(avgPerRace6);
  });

  it('full season lock (24 races) gives massive bonus', () => {
    const { bonus } = scoringService.calculateLockBonus(24);
    expect(bonus).toBe(100);

    // Compare to tier-based for 23 races: 3+6+51 = 60
    const bonus23 = scoringService.calculateLockBonus(23).bonus;
    expect(bonus).toBeGreaterThan(bonus23);
  });
});
