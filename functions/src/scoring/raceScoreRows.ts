/**
 * The per-driver and per-constructor race breakdown (`raceScores/{raceId}__{entityId}`), as a pure
 * function. It was inline in onRaceCompleted's Phase 0.5; F-168 moved it here, unchanged, so the
 * result-correction path (raceCorrection.ts) re-derives a corrected race from exactly the rules the
 * race was first scored with. Every gate must keep mirroring scoringCore.calculateDriverPoints:
 * Phase 1's reconciliation guard compares team points against these rows.
 */
import {
  RACE_POINTS,
  SPRINT_POINTS,
  SPRINT_DNF_PENALTY,
  FASTEST_LAP_BONUS,
  POSITION_GAINED_BONUS,
  GRID_SIZE,
  calculateQualifyingPoints,
  calculateDnfPenalty,
  RaceResult,
  SprintResult,
  QualifyingResult,
} from './scoringCore';

export interface RaceScoreContext {
  raceId: string;
  seasonId: string | null;
  round: number;
  totalLaps?: number;
}

export interface DriverScoreRow {
  raceId: string;
  seasonId: string | null;
  round: number;
  entityId: string;
  entityType: 'driver';
  constructorId: string;
  position: number;
  gridPosition: number;
  status: RaceResult['status'];
  positionsGained: number;
  racePoints: number;
  sprintPoints: number;
  sprintPosition: number | null;
  qualiPoints: number;
  qualiPosition: number | null;
  fastestLap: boolean;
  fastestLapBonus: number;
  totalPoints: number;
}

export interface ConstructorScoreRow {
  raceId: string;
  seasonId: string | null;
  round: number;
  entityId: string;
  entityType: 'constructor';
  racePoints: number;
  sprintPoints: number;
  qualiPoints: number;
  totalPoints: number;
}

export type ScoreRow = DriverScoreRow | ConstructorScoreRow;

/** The rows for one race: drivers in result order, then one row per constructor. No timestamp: the writer adds it. */
export function buildRaceScoreRows(
  raceResults: RaceResult[],
  sprintResults: SprintResult[] | null,
  qualifyingResults: QualifyingResult[] | null,
  ctx: RaceScoreContext,
): ScoreRow[] {
  const sprintMap = new Map<string, SprintResult>();
  (sprintResults || []).forEach((r) => sprintMap.set(r.driverId, r));
  const qualiMap = new Map<string, QualifyingResult>();
  (qualifyingResults || []).forEach((r) => qualiMap.set(r.driverId, r));
  const rows: ScoreRow[] = [];

  for (const result of raceResults) {
    const sprintResult = sprintMap.get(result.driverId) || null;
    const qualiResult = qualiMap.get(result.driverId);

    let racePoints = 0;
    let sprintPoints = 0;
    let qualiPoints = 0;
    let positionsGained = 0;
    let fastestLapBonus = 0;

    // All gated on position >= 1 — must mirror scoringCore.calculateDriverPoints
    // so the breakdown reconciles with team scoring. A position-0 'finished'
    // glitch would otherwise award positionsGained = grid - 0 phantom points.
    if (result.status === 'finished' && result.position >= 1) {
      if (result.position <= RACE_POINTS.length) racePoints += RACE_POINTS[result.position - 1];
      positionsGained = result.gridPosition - result.position;
      if (positionsGained > 0) racePoints += positionsGained * POSITION_GAINED_BONUS;
      if (positionsGained < 0) racePoints += positionsGained;
      if (result.fastestLap && result.position <= 10) {
        racePoints += FASTEST_LAP_BONUS;
        fastestLapBonus = FASTEST_LAP_BONUS;
      }
      if (result.position <= GRID_SIZE) {
        racePoints += GRID_SIZE + 1 - result.position;
      }
    } else if (result.status === 'dnf') {
      racePoints = calculateDnfPenalty(result.laps, ctx.totalLaps, ctx.round, ctx.seasonId ?? undefined);
    } else if (result.status === 'dsq') {
      racePoints = -5;
    }

    if (sprintResult) {
      if (sprintResult.status === 'finished'
          && sprintResult.position >= 1 && sprintResult.position <= SPRINT_POINTS.length) {
        sprintPoints = SPRINT_POINTS[sprintResult.position - 1];
      } else if (sprintResult.status === 'dnf' || sprintResult.status === 'dsq') {
        sprintPoints = SPRINT_DNF_PENALTY;
      }
    }

    if (qualiResult) qualiPoints = calculateQualifyingPoints(qualiResult.position);

    rows.push({
      raceId: ctx.raceId,
      seasonId: ctx.seasonId,
      round: ctx.round,
      entityId: result.driverId,
      entityType: 'driver',
      constructorId: result.constructorId,
      position: result.position,
      gridPosition: result.gridPosition,
      status: result.status,
      positionsGained,
      racePoints,
      sprintPoints,
      sprintPosition: sprintResult?.position ?? null,
      qualiPoints,
      qualiPosition: qualiResult?.position ?? null,
      fastestLap: result.fastestLap,
      fastestLapBonus,
      totalPoints: racePoints + sprintPoints + qualiPoints,
    });
  }

  // Constructor race scores (aggregate of both drivers). Constructors earn no sprint points.
  const constructorIds = [...new Set(raceResults.map((r) => r.constructorId))];
  for (const ctorId of constructorIds) {
    let ctorRacePoints = 0;
    let ctorQualiPoints = 0;
    for (const result of raceResults.filter((r) => r.constructorId === ctorId)) {
      if (result.status === 'finished') {
        if (result.position >= 1 && result.position <= RACE_POINTS.length) ctorRacePoints += RACE_POINTS[result.position - 1];
        if (result.position >= 1 && result.position <= GRID_SIZE) ctorRacePoints += GRID_SIZE + 1 - result.position;
      }
      const qr = qualiMap.get(result.driverId);
      if (qr) ctorQualiPoints += calculateQualifyingPoints(qr.position);
    }
    rows.push({
      raceId: ctx.raceId,
      seasonId: ctx.seasonId,
      round: ctx.round,
      entityId: ctorId,
      entityType: 'constructor',
      racePoints: ctorRacePoints,
      sprintPoints: 0,
      qualiPoints: ctorQualiPoints,
      totalPoints: ctorRacePoints + ctorQualiPoints,
    });
  }
  return rows;
}
