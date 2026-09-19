/**
 * Turns one race weekend's classification (real or simulated) into the neutral
 * fantasy points `raceScores` stores and the pricing points Phase 2 uses.
 * Driver points come from the shared scoringCore, so a projection can never
 * drift from real scoring; a test scores the real 2026 results and compares
 * them with the stored raceScores.
 */
import {
  calculateDriverPoints, calculateLockBonus, calculateQualifyingPoints, GRID_SIZE, RACE_POINTS,
  type RaceResult, type SprintResult,
} from '../../../../functions/src/scoring/scoringCore';
import { dnfPricePenalty, PRICING_RACE_POINTS, PRICING_SPRINT_POINTS } from './priceRules';
import type { HistQualiResult, HistRaceResult, HistSprintResult } from './types';

export interface WeekendScores {
  /** neutral fantasy points per driver and constructor id (no Ace, no loyalty bonus) */
  points: Map<string, number>;
  pricingPoints: Map<string, number>;
  dnfPricePenalty: Map<string, number>;
}

export function scoreWeekend(
  raceResults: HistRaceResult[], qualifying: HistQualiResult[], sprint: HistSprintResult[],
  ctx: { totalLaps: number; round: number },
): WeekendScores {
  const points = new Map<string, number>();
  const pricingPoints = new Map<string, number>();
  const dnfPen = new Map<string, number>();
  const quali = new Map(qualifying.map((q) => [q.driverId, q.position]));
  const sprintBy = new Map(sprint.map((s) => [s.driverId, s]));
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  for (const r of raceResults) {
    const sr = sprintBy.get(r.driverId);
    const race: RaceResult = { position: r.position, driverId: r.driverId, constructorId: r.constructorId, gridPosition: r.gridPosition, status: r.status, fastestLap: !!r.fastestLap, laps: r.laps } as RaceResult;
    const sprintRes: SprintResult | null = sr ? ({ position: sr.position, driverId: sr.driverId, status: sr.status } as SprintResult) : null;
    // racesHeld 0 and no Ace, minus the loyalty bonus scoringCore always adds: the neutral number raceScores stores
    const neutral = calculateDriverPoints(race, sprintRes, 0, false, ctx) - calculateLockBonus(0);
    const q = quali.get(r.driverId);
    const qp = q ? calculateQualifyingPoints(q) : 0;
    add(points, r.driverId, neutral + qp);

    // constructors: race points and position bonus of each car, plus both cars' qualifying; no sprint, no DNF penalty
    let c = qp;
    if (r.status === 'finished') {
      if (r.position >= 1 && r.position <= RACE_POINTS.length) c += RACE_POINTS[r.position - 1];
      if (r.position >= 1 && r.position <= GRID_SIZE) c += GRID_SIZE + 1 - r.position;
    }
    add(points, r.constructorId, c);

    // pricing points (Phase 2)
    let pp = 0;
    if (r.status === 'finished' && r.position >= 1) {
      if (r.position <= PRICING_RACE_POINTS.length) pp = PRICING_RACE_POINTS[r.position - 1];
      const gained = r.gridPosition - r.position;
      if (gained > 0) pp += gained;
      if (r.fastestLap && r.position <= 10) pp += 1;
      if (r.position <= GRID_SIZE) pp += GRID_SIZE + 1 - r.position;
    } else if (r.status === 'dnf' && ctx.totalLaps > 0) {
      const pen = dnfPricePenalty(r.laps || 1, ctx.totalLaps);
      dnfPen.set(r.driverId, pen);
      add(dnfPen, r.constructorId, pen);
    }
    add(pricingPoints, r.driverId, pp);
    add(pricingPoints, r.constructorId, pp);
  }
  for (const s of sprint) {
    if (s.status === 'finished' && s.position >= 1 && s.position <= PRICING_SPRINT_POINTS.length) add(pricingPoints, s.driverId, PRICING_SPRINT_POINTS[s.position - 1]);
  }
  return { points, pricingPoints, dnfPricePenalty: dnfPen };
}
