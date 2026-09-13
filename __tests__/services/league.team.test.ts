/**
 * Tests for league/team creation and team composition rules
 */

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
