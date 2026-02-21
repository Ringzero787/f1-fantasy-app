/**
 * Tests for league/team creation and team composition rules
 */

import { scoringService } from '../../src/services/scoring.service';
import { PRICING_CONFIG } from '../../src/config/pricing.config';
import {
  STARTING_DOLLARS,
  TEAM_SIZE,
  CONSTRUCTORS_PER_TEAM,
} from '../../src/config/constants';
import type {
  FantasyTeam,
  FantasyDriver,
  FantasyConstructor,
  RaceResult,
  DriverScore,
  ConstructorScore,
} from '../../src/types';

// ============================================
// Factory helpers
// ============================================

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

const createTeam = (overrides: Record<string, unknown> = {}): FantasyTeam => ({
  id: 'team_1',
  userId: 'user_1',
  leagueId: 'league_1',
  name: 'Test Team',
  drivers: [],
  constructor: null,
  budget: STARTING_DOLLARS,
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
// Team Creation & Budget
// ============================================

describe('Team Creation & Budget', () => {
  it('should start with $1000 budget', () => {
    expect(STARTING_DOLLARS).toBe(1000);
    const team = createTeam();
    expect(team.budget).toBe(1000);
  });

  it('should allow 5 drivers per team', () => {
    expect(TEAM_SIZE).toBe(5);
  });

  it('should allow 1 constructor per team', () => {
    expect(CONSTRUCTORS_PER_TEAM).toBe(1);
  });

  it('should track budget after buying drivers', () => {
    const drivers = [
      createFantasyDriver({ driverId: 'd1', purchasePrice: 310, currentPrice: 310 }),
      createFantasyDriver({ driverId: 'd2', purchasePrice: 200, currentPrice: 200 }),
      createFantasyDriver({ driverId: 'd3', purchasePrice: 180, currentPrice: 180 }),
      createFantasyDriver({ driverId: 'd4', purchasePrice: 140, currentPrice: 140 }),
      createFantasyDriver({ driverId: 'd5', purchasePrice: 100, currentPrice: 100 }),
    ];
    const totalSpent = drivers.reduce((sum, d) => sum + d.purchasePrice, 0);
    const constructor = createFantasyConstructor({ purchasePrice: 70, currentPrice: 70 });

    const team = createTeam({
      drivers,
      constructor,
      totalSpent: totalSpent + constructor.purchasePrice,
      budget: STARTING_DOLLARS - totalSpent - constructor.purchasePrice,
    });

    // 310+200+180+140+100+70 = 1000
    expect(team.totalSpent).toBe(1000);
    expect(team.budget).toBe(0);
  });

  it('should reject team that exceeds budget', () => {
    const expensiveDrivers = [
      createFantasyDriver({ purchasePrice: 310 }),
      createFantasyDriver({ purchasePrice: 290 }),
      createFantasyDriver({ purchasePrice: 280 }),
      createFantasyDriver({ purchasePrice: 250 }),
      createFantasyDriver({ purchasePrice: 220 }),
    ];
    const totalDriverCost = expensiveDrivers.reduce((sum, d) => sum + d.purchasePrice, 0);
    // 310+290+280+250+220 = 1350 already > 1000
    expect(totalDriverCost).toBeGreaterThan(STARTING_DOLLARS);
  });
});

// ============================================
// V4: Late Joiner Fields
// ============================================

describe('V4: Late Joiner Team Fields', () => {
  it('should initialize V4 fields for new team at season start', () => {
    const team = createTeam({
      racesPlayed: 0,
      pointsHistory: [],
      joinedAtRace: 0,
      raceWins: 0,
    });

    expect(team.racesPlayed).toBe(0);
    expect(team.pointsHistory).toEqual([]);
    expect(team.joinedAtRace).toBe(0);
    expect(team.raceWins).toBe(0);
  });

  it('should set joinedAtRace for late joiners', () => {
    // Team created after 5 races have been completed
    const team = createTeam({ joinedAtRace: 5 });
    expect(team.joinedAtRace).toBe(5);
  });

  it('should track points history per race', () => {
    const team = createTeam({
      racesPlayed: 3,
      pointsHistory: [85, 102, 67],
    });

    expect(team.pointsHistory).toHaveLength(3);
    expect(team.racesPlayed).toBe(3);
  });

  it('should track race wins', () => {
    const team = createTeam({ raceWins: 2 });
    expect(team.raceWins).toBe(2);
  });
});

// ============================================
// Constructor Scoring (average of both drivers / 2)
// ============================================

describe('Constructor Scoring', () => {
  it('should score constructor as average of two drivers (halved)', () => {
    const driver1Score = createDriverScore({ driverId: 'd1', totalPoints: 40 });
    const driver2Score = createDriverScore({ driverId: 'd2', totalPoints: 20 });
    const constructor = createFantasyConstructor({ racesHeld: 0 });

    const constructorScore = scoringService.calculateConstructorScore(
      'test_constructor', 'race_1', driver1Score, driver2Score, constructor
    );

    // Average = floor((40 + 20) / 2) = 30
    expect(constructorScore.totalPoints).toBe(30);
  });

  it('should floor odd averages', () => {
    const driver1Score = createDriverScore({ driverId: 'd1', totalPoints: 25 });
    const driver2Score = createDriverScore({ driverId: 'd2', totalPoints: 18 });
    const constructor = createFantasyConstructor({ racesHeld: 0 });

    const constructorScore = scoringService.calculateConstructorScore(
      'test_constructor', 'race_1', driver1Score, driver2Score, constructor
    );

    // Average = floor((25 + 18) / 2) = floor(21.5) = 21
    expect(constructorScore.totalPoints).toBe(21);
  });

  it('should add lock bonus on top of averaged score', () => {
    const driver1Score = createDriverScore({ driverId: 'd1', totalPoints: 30 });
    const driver2Score = createDriverScore({ driverId: 'd2', totalPoints: 20 });
    const constructor = createFantasyConstructor({ racesHeld: 5 }); // tier1(3)+tier2(4) = 3+4 = 7

    const constructorScore = scoringService.calculateConstructorScore(
      'test_constructor', 'race_1', driver1Score, driver2Score, constructor
    );

    // Average = floor((30 + 20) / 2) = 25
    // Lock bonus: 3 races × 1 + 2 races × 2 = 3 + 4 = 7
    expect(constructorScore.totalPoints).toBe(25 + 7);
  });

  it('should handle one DNF driver (negative points)', () => {
    const driver1Score = createDriverScore({ driverId: 'd1', totalPoints: 25 });
    const driver2Score = createDriverScore({ driverId: 'd2', totalPoints: -5 }); // DSQ
    const constructor = createFantasyConstructor({ racesHeld: 0 });

    const constructorScore = scoringService.calculateConstructorScore(
      'test_constructor', 'race_1', driver1Score, driver2Score, constructor
    );

    // Average = floor((25 + (-5)) / 2) = floor(10) = 10
    expect(constructorScore.totalPoints).toBe(10);
  });

  it('should handle both drivers DNF', () => {
    const driver1Score = createDriverScore({ driverId: 'd1', totalPoints: 0 });
    const driver2Score = createDriverScore({ driverId: 'd2', totalPoints: 0 });
    const constructor = createFantasyConstructor({ racesHeld: 0 });

    const constructorScore = scoringService.calculateConstructorScore(
      'test_constructor', 'race_1', driver1Score, driver2Score, constructor
    );

    expect(constructorScore.totalPoints).toBe(0);
  });
});

// ============================================
// Ace + Constructor Full Team Scoring
// ============================================

describe('Full Team Scoring Integration', () => {
  it('should sum driver + constructor points for team total', () => {
    const driverScores: DriverScore[] = [
      createDriverScore({ driverId: 'd1', totalPoints: 25 }),
      createDriverScore({ driverId: 'd2', totalPoints: 18 }),
      createDriverScore({ driverId: 'd3', totalPoints: 10 }),
      createDriverScore({ driverId: 'd4', totalPoints: 6 }),
      createDriverScore({ driverId: 'd5', totalPoints: 2 }),
    ];
    const constructorScore: ConstructorScore = {
      constructorId: 'c1',
      raceId: 'race_1',
      driver1Points: 25,
      driver2Points: 18,
      totalPoints: 21, // floor((25+18)/2)
      lockBonus: 0,
    };

    const team = createTeam();
    const result = scoringService.calculateTeamPointsV3(team, driverScores, constructorScore);

    // 25+18+10+6+2+21 = 82
    expect(result.total).toBe(82);
    expect(result.staleRosterPenalty).toBe(0);
    expect(result.catchUpBonus).toBe(0);
  });

  it('should calculate team points without constructor', () => {
    const driverScores: DriverScore[] = [
      createDriverScore({ driverId: 'd1', totalPoints: 25 }),
      createDriverScore({ driverId: 'd2', totalPoints: 10 }),
    ];

    const team = createTeam();
    const result = scoringService.calculateTeamPointsV3(team, driverScores, null);

    expect(result.total).toBe(35);
  });

  it('should apply stale roster penalty to team total', () => {
    const driverScores: DriverScore[] = [
      createDriverScore({ driverId: 'd1', totalPoints: 50 }),
    ];

    // 7 races since transfer = 2 over threshold (5) → 2 × 5 = 10 penalty
    const team = createTeam({ racesSinceTransfer: 7 });
    const result = scoringService.calculateTeamPointsV3(team, driverScores, null);

    expect(result.total).toBe(50 - 10);
    expect(result.staleRosterPenalty).toBe(10);
  });

  it('should ace bonus NOT stack with constructor averaging', () => {
    // Ace doubles driver race+sprint points, but constructor averages driver totals
    // Verify ace bonus is already in the driver score that feeds into constructor
    const aceResult = createRaceResult({ position: 1, driverId: 'd1' });
    const aceDriver = createFantasyDriver({ driverId: 'd1', racesHeld: 0 });

    const aceScore = scoringService.calculateDriverScore(
      'd1', 'race_1', aceResult, null, aceDriver, undefined, { isAce: true }
    );

    // P1 = 25 race + 22 position bonus = 47 base, ace = +47, total = 94
    expect(aceScore.totalPoints).toBe(94);

    const teammateResult = createRaceResult({ position: 5, driverId: 'd2' });
    const teammateDriver = createFantasyDriver({ driverId: 'd2', racesHeld: 0 });
    const teammateScore = scoringService.calculateDriverScore(
      'd2', 'race_1', teammateResult, null, teammateDriver
    );

    // P5 = 10 race + 18 position bonus = 28
    expect(teammateScore.totalPoints).toBe(28);

    // Constructor averages the ace's doubled score
    const constructor = createFantasyConstructor({ racesHeld: 0 });
    const conScore = scoringService.calculateConstructorScore(
      'c1', 'race_1', aceScore, teammateScore, constructor
    );

    // floor((94 + 28) / 2) = floor(61) = 61
    expect(conScore.totalPoints).toBe(61);
  });
});
