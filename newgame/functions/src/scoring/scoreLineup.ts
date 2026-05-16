// Track Limits scoring — same per-driver base values as Undercut, applied only to
// the started subset (2 of 4 drivers + 1 of 2 constructors). Adds tier-aware
// bonuses (positions-gained scaling, beat-teammate, long-shot pole, both-in-points)
// so non-A-tier picks are strategically meaningful, not just budget filler.

const RACE_POINTS = [45, 37, 33, 29, 26, 23, 20, 17, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const SPRINT_POINTS = [5, 4, 3, 3, 2, 2, 1, 1];
const QUALIFYING_POINTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const FASTEST_LAP_BONUS = 1;
const POSITION_GAINED_BONUS_BY_TIER = { A: 1, B: 2, C: 3 } as const;
const SPRINT_DNF_PENALTY = -3;
const DNF_PENALTY = -5;
const BEAT_TEAMMATE_BONUS = 5;
const LONGSHOT_POLE_BONUS = 5; // applies when pole-getter is B or C tier and is in the player's race lineup
const BOTH_DRIVERS_IN_POINTS_CONSTRUCTOR_BONUS = 10; // top-10 finish each
const POINTS_ZONE_LIMIT = 10;

type Tier = 'A' | 'B' | 'C';

interface RaceResult {
  position: number;
  driverId: string;
  constructorId: string;
  gridPosition: number;
  status: 'finished' | 'dnf' | 'dsq';
  fastestLap: boolean;
}
interface QualifyingResult {
  position: number;
  driverId: string;
}
interface SprintResult {
  position: number;
  driverId: string;
  status: 'finished' | 'dnf' | 'dsq';
}
export interface RaceResultsBundle {
  qualifyingResults?: QualifyingResult[];
  sprintResults?: SprintResult[];
  raceResults?: RaceResult[];
}

export interface DriverScopeBreakdown {
  driverId: string;
  scope: 'qualifying' | 'race';
  points: number;
  notes: string[];
}

// Built once per scoring pass and threaded into the per-driver scoring functions.
// Lets the per-driver math stay tier-aware without re-fetching driver docs each call.
export interface RaceContext {
  poleDriverId?: string;
  poleDriverTier?: Tier;
  driverTiers: Record<string, Tier>;
}

export function buildRaceContext(
  results: RaceResultsBundle,
  driverTiers: Record<string, Tier>
): RaceContext {
  const pole = results.qualifyingResults?.find((q) => q.position === 1);
  return {
    poleDriverId: pole?.driverId,
    poleDriverTier: pole ? driverTiers[pole.driverId] : undefined,
    driverTiers,
  };
}

// Find the teammate's race result by matching constructorId in the actual race
// results. This handles substitute drivers correctly (they show up in results
// with the constructorId of the team they're racing for).
function findTeammateRaceResult(
  driverId: string,
  constructorId: string,
  results: RaceResultsBundle
): RaceResult | undefined {
  return results.raceResults?.find(
    (r) => r.driverId !== driverId && r.constructorId === constructorId
  );
}

// Score a single driver's qualifying performance. Uses the qualifying lineup.
export function scoreQualifyingForDriver(
  driverId: string,
  results: RaceResultsBundle
): DriverScopeBreakdown {
  const notes: string[] = [];
  let points = 0;
  const q = results.qualifyingResults?.find((r) => r.driverId === driverId);
  if (q && q.position >= 1 && q.position <= QUALIFYING_POINTS.length) {
    const qPts = QUALIFYING_POINTS[q.position - 1];
    points += qPts;
    notes.push(`Q${q.position}: +${qPts}`);
  }
  return { driverId, scope: 'qualifying', points, notes };
}

// Score a single driver's race performance. Tier-aware:
//   - positions-gained bonus scales by tier (A:1, B:2, C:3 per spot)
//   - +5 if this driver finished ahead of their teammate
//   - +5 if this driver was a B/C-tier pole sitter (long-shot pole bonus)
export function scoreRaceForDriver(
  driverId: string,
  results: RaceResultsBundle,
  ctx: RaceContext
): DriverScopeBreakdown {
  const notes: string[] = [];
  let points = 0;
  const tier = ctx.driverTiers[driverId] ?? 'B';

  const race = results.raceResults?.find((r) => r.driverId === driverId);
  if (race) {
    if (race.status === 'dnf' || race.status === 'dsq') {
      points += DNF_PENALTY;
      notes.push(`${race.status.toUpperCase()}: ${DNF_PENALTY}`);
    } else if (race.position >= 1 && race.position <= RACE_POINTS.length) {
      const pts = RACE_POINTS[race.position - 1];
      points += pts;
      notes.push(`P${race.position}: +${pts}`);
    }
    if (race.fastestLap && race.status === 'finished') {
      points += FASTEST_LAP_BONUS;
      notes.push(`Fastest lap: +${FASTEST_LAP_BONUS}`);
    }
    // Tier-scaled positions-gained bonus
    if (race.status === 'finished' && race.gridPosition && race.position) {
      const gained = race.gridPosition - race.position;
      if (gained > 0) {
        const perSpot = POSITION_GAINED_BONUS_BY_TIER[tier];
        const bonus = gained * perSpot;
        points += bonus;
        notes.push(`+${gained} positions × ${perSpot} (${tier}-tier): +${bonus}`);
      }
    }
    // Beat-your-teammate bonus
    if (race.status === 'finished' && race.constructorId) {
      const teammate = findTeammateRaceResult(driverId, race.constructorId, results);
      if (teammate) {
        const teammateClassified =
          teammate.status === 'finished' && teammate.position > race.position;
        const teammateOut = teammate.status === 'dnf' || teammate.status === 'dsq';
        if (teammateClassified || teammateOut) {
          points += BEAT_TEAMMATE_BONUS;
          notes.push(`Beat teammate: +${BEAT_TEAMMATE_BONUS}`);
        }
      }
    }
    // Long-shot pole bonus — applies if this driver got pole and is B/C tier
    if (
      ctx.poleDriverId === driverId &&
      (ctx.poleDriverTier === 'B' || ctx.poleDriverTier === 'C')
    ) {
      points += LONGSHOT_POLE_BONUS;
      notes.push(`Long-shot pole bonus (${ctx.poleDriverTier}-tier): +${LONGSHOT_POLE_BONUS}`);
    }
  }

  // Sprint adds to race scope
  const sprint = results.sprintResults?.find((r) => r.driverId === driverId);
  if (sprint) {
    if (sprint.status === 'dnf' || sprint.status === 'dsq') {
      points += SPRINT_DNF_PENALTY;
      notes.push(`Sprint ${sprint.status.toUpperCase()}: ${SPRINT_DNF_PENALTY}`);
    } else if (sprint.position >= 1 && sprint.position <= SPRINT_POINTS.length) {
      const pts = SPRINT_POINTS[sprint.position - 1];
      points += pts;
      notes.push(`Sprint P${sprint.position}: +${pts}`);
    }
  }

  return { driverId, scope: 'race', points, notes };
}

// Constructor scoring = sum of its two real drivers' race-scope contributions,
// PLUS a +10 bonus when both drivers finished in the points (top 10).
export function scoreConstructor(
  constructorId: string,
  driverIdsForConstructor: string[],
  results: RaceResultsBundle,
  ctx: RaceContext
): { constructorId: string; points: number; notes: string[] } {
  const notes: string[] = [];
  let points = 0;
  for (const driverId of driverIdsForConstructor) {
    const driverScore = scoreRaceForDriver(driverId, results, ctx);
    points += driverScore.points;
  }
  notes.push(`Sum of ${driverIdsForConstructor.length} drivers' race scores`);

  // "Both in points" bonus — both drivers finished P1–P10
  if (driverIdsForConstructor.length === 2) {
    const finishes = driverIdsForConstructor.map((id) =>
      results.raceResults?.find((r) => r.driverId === id)
    );
    const bothInPoints = finishes.every(
      (r) => r && r.status === 'finished' && r.position >= 1 && r.position <= POINTS_ZONE_LIMIT
    );
    if (bothInPoints) {
      points += BOTH_DRIVERS_IN_POINTS_CONSTRUCTOR_BONUS;
      notes.push(`Both drivers in points: +${BOTH_DRIVERS_IN_POINTS_CONSTRUCTOR_BONUS}`);
    }
  }

  return { constructorId, points, notes };
}

export const scoringConfig = {
  RACE_POINTS,
  SPRINT_POINTS,
  QUALIFYING_POINTS,
  FASTEST_LAP_BONUS,
  POSITION_GAINED_BONUS_BY_TIER,
  BEAT_TEAMMATE_BONUS,
  LONGSHOT_POLE_BONUS,
  BOTH_DRIVERS_IN_POINTS_CONSTRUCTOR_BONUS,
};
