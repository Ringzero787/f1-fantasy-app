import {
  RACE_POINTS,
  SPRINT_POINTS,
  FASTEST_LAP_BONUS,
  POSITION_GAINED_BONUS,
  POSITION_LOST_PENALTY,
  DNF_PENALTY,
  DSQ_PENALTY,
  LOCK_BONUS,
} from '../config/constants';
import { PRICING_CONFIG } from '../config/pricing.config';
import type {
  RaceResult,
  SprintResult,
  DriverScore,
  ConstructorScore,
  ScoreBreakdown,
  ScoreItem,
  FantasyDriver,
  FantasyConstructor,
  FantasyTeam,
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

    // Position lost penalty
    if (result.positionsGained < 0) {
      const positionsLost = Math.abs(result.positionsGained);
      const lostPenalty = positionsLost * POSITION_LOST_PENALTY;
      points -= lostPenalty;
      breakdown.push({
        label: 'Positions Lost',
        points: -lostPenalty,
        description: `-${positionsLost} positions from P${result.gridPosition}`,
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
        points: rules.dnfPenalty,
        description: 'Did not finish sprint',
      });
      return { points: rules.dnfPenalty, breakdown };
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
   * V3: Supports ace system (2x points) and hot hand bonus
   */
  calculateDriverScore(
    driverId: string,
    raceId: string,
    raceResult: RaceResult | null,
    sprintResult: SprintResult | null,
    fantasyDriver: FantasyDriver,
    rules: ScoringRules = DEFAULT_SCORING_RULES,
    options: {
      isAce?: boolean;
      isNewTransfer?: boolean; // True if driver was purchased this race
    } = {}
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

    // Base points before ace multiplier
    const basePoints = racePoints + sprintPoints;
    totalPoints = basePoints + lockBonus;

    // V3: Ace bonus (2x points on race + sprint, not lock bonus)
    if (options.isAce) {
      const aceBonus = basePoints; // Double the base points (2x total = basePoints + basePoints)
      totalPoints += aceBonus;
      items.push({
        label: 'Ace Bonus',
        points: aceBonus,
        description: '2x points for ace',
      });
    }

    // V3: Hot Hand Bonus (for newly transferred drivers)
    if (options.isNewTransfer && raceResult) {
      const hotHandCalc = this.calculateHotHandBonus(raceResult.position, basePoints);
      if (hotHandCalc.bonus > 0) {
        totalPoints += hotHandCalc.bonus;
        items.push(...hotHandCalc.breakdown);
      }
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
   * V3: Calculate Hot Hand Bonus for newly transferred drivers
   * +10 bonus if driver scores 15+ points
   * +15 bonus if driver finishes on podium (P1, P2, P3)
   */
  calculateHotHandBonus(racePosition: number, totalPoints: number): { bonus: number; breakdown: ScoreItem[] } {
    const breakdown: ScoreItem[] = [];
    let bonus = 0;

    // Podium bonus (takes precedence)
    if (racePosition >= 1 && racePosition <= 3) {
      bonus = PRICING_CONFIG.HOT_HAND_PODIUM_BONUS;
      breakdown.push({
        label: 'Hot Hand Podium',
        points: bonus,
        description: `New transfer finished P${racePosition}!`,
      });
    }
    // 15+ points bonus
    else if (totalPoints >= 15) {
      bonus = PRICING_CONFIG.HOT_HAND_BONUS;
      breakdown.push({
        label: 'Hot Hand Bonus',
        points: bonus,
        description: `New transfer scored ${totalPoints}+ points!`,
      });
    }

    return { bonus, breakdown };
  },

  /**
   * V3: Calculate Stale Roster Penalty
   * After STALE_ROSTER_THRESHOLD races without a transfer, lose STALE_ROSTER_PENALTY points per race
   */
  calculateStaleRosterPenalty(racesSinceTransfer: number): { penalty: number; breakdown: ScoreItem[] } {
    const breakdown: ScoreItem[] = [];
    let penalty = 0;

    if (racesSinceTransfer > PRICING_CONFIG.STALE_ROSTER_THRESHOLD) {
      const racesOverThreshold = racesSinceTransfer - PRICING_CONFIG.STALE_ROSTER_THRESHOLD;
      penalty = racesOverThreshold * PRICING_CONFIG.STALE_ROSTER_PENALTY;
      breakdown.push({
        label: 'Stale Roster Penalty',
        points: -penalty,
        description: `${racesOverThreshold} race(s) past transfer threshold`,
      });
    }

    return { penalty, breakdown };
  },

  /**
   * V3: Calculate Value Capture Bonus when selling a driver for profit
   * Earn PRICING_CONFIG.VALUE_CAPTURE_RATE points per $10 profit
   */
  calculateValueCaptureBonus(purchasePrice: number, salePrice: number): { bonus: number; breakdown: ScoreItem[] } {
    const breakdown: ScoreItem[] = [];
    let bonus = 0;

    const profit = salePrice - purchasePrice;
    if (profit > 0) {
      // Points per $10 profit
      const profitUnits = Math.floor(profit / 10);
      bonus = profitUnits * PRICING_CONFIG.VALUE_CAPTURE_RATE;
      if (bonus > 0) {
        breakdown.push({
          label: 'Value Capture Bonus',
          points: bonus,
          description: `$${profit} profit on sale`,
        });
      }
    }

    return { bonus, breakdown };
  },

  /**
   * Calculate constructor score (sum of both drivers)
   * V3: Removed star constructor bonus (ace system is driver-only)
   */
  calculateConstructorScore(
    constructorId: string,
    raceId: string,
    driver1Score: DriverScore,
    driver2Score: DriverScore,
    fantasyConstructor: FantasyConstructor
  ): ConstructorScore {
    const lockCalc = this.calculateLockBonus(fantasyConstructor.racesHeld);
    // Constructor gets average of both drivers' points (divided by 2)
    const basePoints = Math.floor((driver1Score.totalPoints + driver2Score.totalPoints) / 2);

    return {
      constructorId,
      raceId,
      driver1Points: driver1Score.totalPoints,
      driver2Points: driver2Score.totalPoints,
      lockBonus: lockCalc.bonus,
      totalPoints: basePoints + lockCalc.bonus,
    };
  },

  /**
   * V4: Calculate catch-up multiplier for late joiners
   * First 3 races after joining get 1.5x points
   */
  calculateCatchUpMultiplier(
    joinedAtRace: number,
    currentRaceNumber: number
  ): { multiplier: number; isInCatchUp: boolean; racesRemaining: number } {
    const racesSinceJoining = currentRaceNumber - joinedAtRace;
    const CATCH_UP_RACES = 3;
    const CATCH_UP_MULTIPLIER = 1.5;

    if (joinedAtRace === 0) {
      // Joined at start of season, no catch-up needed
      return { multiplier: 1, isInCatchUp: false, racesRemaining: 0 };
    }

    if (racesSinceJoining < CATCH_UP_RACES) {
      return {
        multiplier: CATCH_UP_MULTIPLIER,
        isInCatchUp: true,
        racesRemaining: CATCH_UP_RACES - racesSinceJoining,
      };
    }

    return { multiplier: 1, isInCatchUp: false, racesRemaining: 0 };
  },

  /**
   * V3: Calculate team points with all V3 bonuses and penalties
   * V4: Added catch-up multiplier support for late joiners
   */
  calculateTeamPointsV3(
    team: FantasyTeam,
    driverScores: DriverScore[],
    constructorScore: ConstructorScore | null,
    currentRaceNumber?: number
  ): { total: number; breakdown: ScoreBreakdown; staleRosterPenalty: number; catchUpBonus: number } {
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

    // V3: Calculate stale roster penalty
    const staleCalc = this.calculateStaleRosterPenalty(team.racesSinceTransfer || 0);
    const staleRosterPenalty = staleCalc.penalty;
    if (staleRosterPenalty > 0) {
      total -= staleRosterPenalty;
      items.push(...staleCalc.breakdown);
    }

    // V4: Calculate catch-up bonus for late joiners
    let catchUpBonus = 0;
    if (currentRaceNumber !== undefined && team.joinedAtRace > 0) {
      const catchUp = this.calculateCatchUpMultiplier(team.joinedAtRace, currentRaceNumber);
      if (catchUp.isInCatchUp) {
        catchUpBonus = Math.floor(total * (catchUp.multiplier - 1)); // Extra 50%
        total += catchUpBonus;
        items.push({
          label: 'Catch-Up Bonus (1.5x)',
          points: catchUpBonus,
          description: `Late joiner bonus - ${catchUp.racesRemaining} races remaining`,
        });
      }
    }

    return {
      total,
      breakdown: { items, total },
      staleRosterPenalty,
      catchUpBonus,
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
