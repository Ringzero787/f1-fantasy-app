import {
  RACE_POINTS,
  SPRINT_POINTS,
  FASTEST_LAP_BONUS,
  POSITION_GAINED_BONUS,
  DNF_PENALTY,
  DSQ_PENALTY,
  LOCK_BONUS,
} from '../config/constants';
import type {
  RaceResult,
  SprintResult,
  DriverScore,
  ConstructorScore,
  ScoreBreakdown,
  ScoreItem,
  FantasyDriver,
  FantasyConstructor,
  ScoringRules,
} from '../types';

// Default scoring rules
const DEFAULT_SCORING_RULES: ScoringRules = {
  racePoints: RACE_POINTS,
  sprintPoints: SPRINT_POINTS,
  fastestLapBonus: FASTEST_LAP_BONUS,
  positionGainedBonus: POSITION_GAINED_BONUS,
  qualifyingPoints: [],
  dnfPenalty: DNF_PENALTY,
  dsqPenalty: DSQ_PENALTY,
};

export const scoringService = {
  /**
   * Calculate points for a driver's race result
   */
  calculateRacePoints(
    result: RaceResult,
    rules: ScoringRules = DEFAULT_SCORING_RULES
  ): { points: number; breakdown: ScoreItem[] } {
    const breakdown: ScoreItem[] = [];
    let points = 0;

    // Handle DNF/DSQ
    if (result.status === 'dnf') {
      breakdown.push({
        label: 'Did Not Finish',
        points: rules.dnfPenalty,
        description: 'DNF penalty',
      });
      return { points: rules.dnfPenalty, breakdown };
    }

    if (result.status === 'dsq') {
      breakdown.push({
        label: 'Disqualified',
        points: rules.dsqPenalty,
        description: 'DSQ penalty',
      });
      return { points: rules.dsqPenalty, breakdown };
    }

    // Position points (top 10)
    if (result.position <= rules.racePoints.length) {
      const positionPoints = rules.racePoints[result.position - 1];
      points += positionPoints;
      breakdown.push({
        label: `P${result.position} Finish`,
        points: positionPoints,
        description: `${this.getOrdinal(result.position)} place finish`,
      });
    }

    // Position gained bonus
    if (result.positionsGained > 0) {
      const gainedBonus = result.positionsGained * rules.positionGainedBonus;
      points += gainedBonus;
      breakdown.push({
        label: 'Positions Gained',
        points: gainedBonus,
        description: `+${result.positionsGained} positions from P${result.gridPosition}`,
      });
    }

    // Fastest lap bonus (only if in points)
    if (result.fastestLap && result.position <= 10) {
      points += rules.fastestLapBonus;
      breakdown.push({
        label: 'Fastest Lap',
        points: rules.fastestLapBonus,
        description: 'Set the fastest lap of the race',
      });
    }

    return { points, breakdown };
  },

  /**
   * Calculate points for a sprint result
   */
  calculateSprintPoints(
    result: SprintResult,
    rules: ScoringRules = DEFAULT_SCORING_RULES
  ): { points: number; breakdown: ScoreItem[] } {
    const breakdown: ScoreItem[] = [];
    let points = 0;

    // Handle DNF/DSQ
    if (result.status === 'dnf') {
      breakdown.push({
        label: 'Sprint DNF',
        points: 0,
        description: 'Did not finish sprint',
      });
      return { points: 0, breakdown };
    }

    if (result.status === 'dsq') {
      breakdown.push({
        label: 'Sprint DSQ',
        points: rules.dsqPenalty,
        description: 'Disqualified from sprint',
      });
      return { points: rules.dsqPenalty, breakdown };
    }

    // Position points (top 8)
    if (result.position <= rules.sprintPoints.length) {
      const positionPoints = rules.sprintPoints[result.position - 1];
      points += positionPoints;
      breakdown.push({
        label: `Sprint P${result.position}`,
        points: positionPoints,
        description: `${this.getOrdinal(result.position)} place in sprint`,
      });
    }

    return { points, breakdown };
  },

  /**
   * Calculate lock bonus based on races held
   */
  calculateLockBonus(racesHeld: number): { bonus: number; breakdown: ScoreItem[] } {
    const breakdown: ScoreItem[] = [];
    let bonus = 0;

    if (racesHeld === 0) {
      return { bonus: 0, breakdown: [] };
    }

    // Full season bonus
    if (racesHeld >= LOCK_BONUS.FULL_SEASON_RACES) {
      bonus = LOCK_BONUS.FULL_SEASON_BONUS;
      breakdown.push({
        label: 'Full Season Lock',
        points: LOCK_BONUS.FULL_SEASON_BONUS,
        description: `Held for all ${LOCK_BONUS.FULL_SEASON_RACES} races`,
      });
      return { bonus, breakdown };
    }

    // Tier-based bonuses
    let remainingRaces = racesHeld;

    // Tier 1: 1-3 races at +1 per race
    if (remainingRaces > 0) {
      const tier1Races = Math.min(remainingRaces, LOCK_BONUS.TIER_1.maxRaces);
      const tier1Bonus = tier1Races * LOCK_BONUS.TIER_1.bonusPerRace;
      bonus += tier1Bonus;
      if (tier1Bonus > 0) {
        breakdown.push({
          label: `Lock Tier 1`,
          points: tier1Bonus,
          description: `${tier1Races} race(s) × ${LOCK_BONUS.TIER_1.bonusPerRace} pt`,
        });
      }
      remainingRaces -= tier1Races;
    }

    // Tier 2: 4-6 races at +2 per race
    if (remainingRaces > 0) {
      const tier2Races = Math.min(remainingRaces, LOCK_BONUS.TIER_2.maxRaces - LOCK_BONUS.TIER_1.maxRaces);
      const tier2Bonus = tier2Races * LOCK_BONUS.TIER_2.bonusPerRace;
      bonus += tier2Bonus;
      if (tier2Bonus > 0) {
        breakdown.push({
          label: `Lock Tier 2`,
          points: tier2Bonus,
          description: `${tier2Races} race(s) × ${LOCK_BONUS.TIER_2.bonusPerRace} pts`,
        });
      }
      remainingRaces -= tier2Races;
    }

    // Tier 3: 7+ races at +3 per race
    if (remainingRaces > 0) {
      const tier3Bonus = remainingRaces * LOCK_BONUS.TIER_3.bonusPerRace;
      bonus += tier3Bonus;
      breakdown.push({
        label: `Lock Tier 3`,
        points: tier3Bonus,
        description: `${remainingRaces} race(s) × ${LOCK_BONUS.TIER_3.bonusPerRace} pts`,
      });
    }

    return { bonus, breakdown };
  },

  /**
   * Calculate total driver score for a race weekend
   */
  calculateDriverScore(
    driverId: string,
    raceId: string,
    raceResult: RaceResult | null,
    sprintResult: SprintResult | null,
    fantasyDriver: FantasyDriver,
    rules: ScoringRules = DEFAULT_SCORING_RULES
  ): DriverScore {
    const items: ScoreItem[] = [];
    let totalPoints = 0;

    // Race points
    let racePoints = 0;
    if (raceResult) {
      const raceCalc = this.calculateRacePoints(raceResult, rules);
      racePoints = raceCalc.points;
      items.push(...raceCalc.breakdown);
    }

    // Sprint points
    let sprintPoints = 0;
    if (sprintResult) {
      const sprintCalc = this.calculateSprintPoints(sprintResult, rules);
      sprintPoints = sprintCalc.points;
      items.push(...sprintCalc.breakdown);
    }

    // Lock bonus
    const lockCalc = this.calculateLockBonus(fantasyDriver.racesHeld);
    const lockBonus = lockCalc.bonus;
    items.push(...lockCalc.breakdown);

    totalPoints = racePoints + sprintPoints + lockBonus;

    // Star driver bonus (20% extra points)
    if (fantasyDriver.isStarDriver) {
      const starBonus = Math.round((racePoints + sprintPoints) * 0.2); // 20% bonus
      totalPoints += starBonus;
      items.push({
        label: 'Star Driver Bonus',
        points: starBonus,
        description: '+20% points for star driver',
      });
    }

    return {
      driverId,
      raceId,
      racePoints,
      sprintPoints,
      qualifyingPoints: 0,
      positionBonus: raceResult?.positionsGained ?? 0,
      fastestLapBonus: raceResult?.fastestLap ? rules.fastestLapBonus : 0,
      penalties: 0,
      lockBonus,
      totalPoints,
      breakdown: {
        items,
        total: totalPoints,
      },
    };
  },

  /**
   * Calculate constructor score (sum of both drivers)
   */
  calculateConstructorScore(
    constructorId: string,
    raceId: string,
    driver1Score: DriverScore,
    driver2Score: DriverScore,
    fantasyConstructor: FantasyConstructor
  ): ConstructorScore {
    const lockCalc = this.calculateLockBonus(fantasyConstructor.racesHeld);
    const basePoints = driver1Score.totalPoints + driver2Score.totalPoints;

    // Star constructor bonus (20%)
    const starBonus = fantasyConstructor.isStarDriver ? Math.round(basePoints * 0.2) : 0;

    return {
      constructorId,
      raceId,
      driver1Points: driver1Score.totalPoints,
      driver2Points: driver2Score.totalPoints,
      lockBonus: lockCalc.bonus,
      totalPoints: basePoints + lockCalc.bonus + starBonus,
    };
  },

  /**
   * Calculate total team points for a race
   */
  calculateTeamPoints(
    driverScores: DriverScore[],
    constructorScore: ConstructorScore | null
  ): { total: number; breakdown: ScoreBreakdown } {
    const items: ScoreItem[] = [];
    let total = 0;

    // Add driver points
    for (const score of driverScores) {
      total += score.totalPoints;
      items.push({
        label: `Driver Points`,
        points: score.totalPoints,
        description: `Driver ID: ${score.driverId}`,
      });
    }

    // Add constructor points
    if (constructorScore) {
      total += constructorScore.totalPoints;
      items.push({
        label: 'Constructor Points',
        points: constructorScore.totalPoints,
        description: `Constructor ID: ${constructorScore.constructorId}`,
      });
    }

    return {
      total,
      breakdown: { items, total },
    };
  },

  /**
   * Helper to get ordinal suffix
   */
  getOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  },
};
