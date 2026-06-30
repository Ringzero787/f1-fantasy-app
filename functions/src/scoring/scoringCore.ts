/**
 * Pure fantasy-scoring math — no Firestore, no firebase-admin, no side effects.
 *
 * SINGLE SOURCE OF TRUTH for how on-track results convert to fantasy points.
 * Imported by:
 *   - functions/src/scoring/calculatePoints.ts (live scoring + repair)
 *   - diagnose-scoring.js (read-only preview, via the compiled lib/ output)
 *
 * Keep this module dependency-free so both the Cloud Function and the standalone
 * diagnostic can share it without drifting.
 */

// ─── On-track result shapes ───

export interface RaceResult {
  position: number;
  driverId: string;
  constructorId: string;
  gridPosition: number;
  // 'dns' = did not start; 'nc' = not classified (ran but outside the official
  // classification — finished too many laps down). Both score 0, no DNF penalty.
  status: 'finished' | 'dnf' | 'dsq' | 'dns' | 'nc';
  fastestLap: boolean;
  laps?: number;
}

export interface SprintResult {
  position: number;
  driverId: string;
  status: 'finished' | 'dnf' | 'dsq' | 'dns' | 'nc';
}

export interface QualifyingResult {
  position: number;
  driverId: string;
  constructorId: string;
}

// ─── Points allocation ───

export const RACE_POINTS = [45, 37, 33, 29, 26, 23, 20, 17, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
export const SPRINT_POINTS = [5, 4, 3, 3, 2, 2, 1, 1];
export const SPRINT_DNF_PENALTY = -3;
export const FASTEST_LAP_BONUS = 1;
export const POSITION_GAINED_BONUS = 1;
export const GRID_SIZE = 22;

// Ace system: only drivers/constructors at or below this price can be ace
export const ACE_MAX_PRICE = 200;

// Lock bonus tiers
export const LOCK_BONUS = {
  TIER_1: { maxRaces: 3, bonus: 1 },
  TIER_2: { maxRaces: 6, bonus: 2 },
  TIER_3: { maxRaces: Infinity, bonus: 3 },
  FULL_SEASON_BONUS: 100,
  FULL_SEASON_RACES: 24,
};

// ─── Scoring functions ───

export function calculateLockBonus(racesHeld: number): number {
  // Defensive: legacy roster damage (the old client fullWrite stripped racesHeld
  // server-side on every buy) leaves drivers with racesHeld === undefined. An
  // undefined here propagated NaN through Math.min → NaN team points →
  // FieldValue.increment(NaN) throws and aborts the whole scoring batch. Coerce
  // any non-finite input to 0.
  const held = Number.isFinite(racesHeld) ? racesHeld : 0;

  // held is the count BEFORE the race being scored is added (live scoring
  // evaluates the bonus pre-increment), so a driver held from round 1 arrives at
  // the final round of a 24-race season with held = 23. Trigger the full-season
  // bonus at FULL_SEASON_RACES - 1 so it is actually reachable.
  if (held >= LOCK_BONUS.FULL_SEASON_RACES - 1) {
    return LOCK_BONUS.FULL_SEASON_BONUS;
  }

  let bonus = 0;
  let remaining = held;

  const tier1Races = Math.min(remaining, LOCK_BONUS.TIER_1.maxRaces);
  bonus += tier1Races * LOCK_BONUS.TIER_1.bonus;
  remaining -= tier1Races;

  if (remaining > 0) {
    const tier2Races = Math.min(remaining, LOCK_BONUS.TIER_2.maxRaces - LOCK_BONUS.TIER_1.maxRaces);
    bonus += tier2Races * LOCK_BONUS.TIER_2.bonus;
    remaining -= tier2Races;
  }

  if (remaining > 0) {
    bonus += remaining * LOCK_BONUS.TIER_3.bonus;
  }

  return bonus;
}

// Qualifying points: quarter-rate position bonus, top 16 only.
// SINGLE SOURCE OF TRUTH — used by standalone quali scoring, the race-completion
// fallback, the per-driver raceScores breakdown, and repair. Do not inline this
// formula anywhere else; the two-rate (/2 vs /4) divergence is what made scoring
// non-deterministic depending on which code path scored qualifying.
const QUALI_MAX_POSITION = 16;
export function calculateQualifyingPoints(position: number): number {
  if (position >= 1 && position <= QUALI_MAX_POSITION) {
    return Math.floor((GRID_SIZE + 1 - position) / 4);
  }
  return 0;
}

export function calculateDriverPoints(
  result: RaceResult,
  sprintResult: SprintResult | null,
  racesHeld: number,
  isAce: boolean
): number {
  let racePoints = 0;
  let sprintPoints = 0;

  // Everything here is gated on position >= 1. A classified finisher always has
  // a real position; a 'finished' row with position 0 is a malformed/not-yet-
  // classified OpenF1 row (it should arrive as status 'nc'). Without this gate,
  // positionsGained = gridPosition - 0 awarded phantom points equal to the grid
  // slot (e.g. Albon: grid 18, position 0 → +18) and RACE_POINTS[-1] → NaN.
  if (result.status === 'finished' && result.position >= 1) {
    if (result.position <= RACE_POINTS.length) {
      racePoints += RACE_POINTS[result.position - 1];
    }
    const positionsGained = result.gridPosition - result.position;
    if (positionsGained > 0) {
      racePoints += positionsGained * POSITION_GAINED_BONUS;
    }
    if (positionsGained < 0) {
      racePoints += positionsGained;
    }
    if (result.fastestLap && result.position <= 10) {
      racePoints += FASTEST_LAP_BONUS;
    }
    // Position bonus: all classified finishers P1-P22 get reverse-grid points
    if (result.position <= GRID_SIZE) {
      racePoints += GRID_SIZE + 1 - result.position;
    }
  } else if (result.status === 'dnf') {
    racePoints = -5;
  } else if (result.status === 'dsq') {
    racePoints = -5;
  }
  // 'dns' (did not start) and 'nc' (not classified — ran but outside the
  // classification, e.g. many laps down) intentionally score 0 with no penalty.

  if (sprintResult) {
    if (sprintResult.status === 'finished'
        && sprintResult.position >= 1 && sprintResult.position <= SPRINT_POINTS.length) {
      sprintPoints += SPRINT_POINTS[sprintResult.position - 1];
    } else if (sprintResult.status === 'dnf') {
      sprintPoints = SPRINT_DNF_PENALTY;
    } else if (sprintResult.status === 'dsq') {
      sprintPoints = SPRINT_DNF_PENALTY;
    }
    // sprint 'dns' scores 0
  }

  let points = racePoints + sprintPoints;
  if (isAce) {
    points *= 2;
  }
  // Lock bonus is loyalty-based and is NOT doubled by ace (per scoring spec).
  points += calculateLockBonus(racesHeld);

  return points;
}
