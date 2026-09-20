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

// ─── DNF penalty ───
//
// A retirement used to cost a flat -5 no matter when it happened, so a car that
// broke on the last lap was punished exactly as hard as one that crashed at
// turn 1. The pricing model already scaled its DNF hit by race progress
// (calculateDnfPricePenalty, -24 early to -2 late); scoring was the outlier.
// These constants bring scoring in line: linear in race distance completed,
// same shape as pricing, midpoint still ~-5 so the season's scale is unchanged.
//
// Deliberately NOT keyed off "was the driver classified". OpenF1 reports a
// finishing position for some retirements and not others (Albon was classified
// P17 at Zandvoort on lap 66; Bottas retiring on lap 61 was not), and honouring
// that would put a 15-point cliff on a 5-lap difference. Race distance is
// continuous, so there is no boundary to land on the wrong side of.
export const DNF_PENALTY = -5;        // flat legacy value; pre-switch + fallback
export const DNF_PENALTY_LATE = -2;   // retired at the chequered flag
export const DNF_PENALTY_EARLY = -8;  // retired before completing a lap

// Rounds before this keep the flat -5 so already-banked races stay exactly
// reproducible if repair ever replays them. The rule was written for round 15
// but the functions carrying it were deployed on 2026-09-17, after rounds 15
// (Italy) and 16 (Madrid) had been scored and banked with the flat -5 (stored
// raceScores confirm it). 17 = Azerbaijan 2026, the first race the deployed
// code scores, so replaying 15 or 16 still reproduces what players were given.
export const DNF_PROPORTIONAL_FROM_ROUND = 17;

/**
 * Penalty for a retirement, scaled by how much of the race distance was covered.
 *
 * Falls back to the flat DNF_PENALTY whenever the inputs can't support the
 * proportional form — an earlier round, missing lap data, or a malformed
 * totalLaps — so no caller can accidentally produce a softer penalty from
 * incomplete data.
 */
export function calculateDnfPenalty(
  laps?: number,
  totalLaps?: number,
  round?: number,
): number {
  if (!Number.isFinite(round as number) || (round as number) < DNF_PROPORTIONAL_FROM_ROUND) {
    return DNF_PENALTY;
  }
  if (!Number.isFinite(totalLaps as number) || (totalLaps as number) <= 1) return DNF_PENALTY;
  if (!Number.isFinite(laps as number)) return DNF_PENALTY;

  const done = laps as number;
  const total = totalLaps as number;
  if (done <= 0) return DNF_PENALTY_EARLY;
  if (done >= total) return DNF_PENALTY_LATE;

  const progress = (done - 1) / (total - 1);
  const late = Math.abs(DNF_PENALTY_LATE);
  const early = Math.abs(DNF_PENALTY_EARLY);
  // Round (not ceil, which pricing uses) so the light end of the range is
  // actually reachable rather than collapsing onto the next step down.
  return -Math.round(late + (early - late) * (1 - progress));
}

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

/**
 * Per-race context the DNF penalty needs. Optional so existing callers keep the
 * flat penalty until they opt in by passing it.
 */
export interface RaceContext {
  totalLaps?: number;
  round?: number;
}

export function calculateDriverPoints(
  result: RaceResult,
  sprintResult: SprintResult | null,
  racesHeld: number,
  isAce: boolean,
  raceContext?: RaceContext
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
    racePoints = calculateDnfPenalty(result.laps, raceContext?.totalLaps, raceContext?.round);
  } else if (result.status === 'dsq') {
    // Disqualification is a stewards' decision, not a distance outcome — it
    // stays flat regardless of when in the race it happened.
    racePoints = DNF_PENALTY;
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
