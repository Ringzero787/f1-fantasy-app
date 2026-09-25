/**
 * Splits from our own classifications (F-072 first cut). Everything here is built from the
 * `races` results and `raceScores` the app already keeps: where a driver qualified and finished,
 * whether they saw the flag, and what they scored, cut by the class of circuit (street or
 * permanent; high, medium or low speed) from the characteristics table.
 *
 * This is what stands in for the timing pipeline until one is licensed: a driver's average grid
 * slot and finish are classification facts, not lap times, so they ride in the free document
 * (ADR-001). The one thing that is analysis rather than fact — how a car FITS a class of circuit
 * — is a delta of its points at that class against its points everywhere, and it is reported as
 * neutral until there are enough races in the class to say anything.
 *
 * Pure.
 */
import { classesOf, traitsOf, type CircuitTraits } from './circuitTraits';
import type { HistRace, HistScore } from './types';

export interface Split { n: number; avg: number }
export interface EntitySplits { overall: Split; byClass: Record<string, Split> }
export interface DriverStarts { starts: number; avgGrid: number; avgFinish: number; gained: number; finishRate: number; dnfs: number }

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Points per entity, overall and per circuit class. */
export function computeSplits(races: HistRace[], scores: HistScore[]): Map<string, EntitySplits> {
  const classesByRace = new Map<string, string[]>();
  for (const r of races) { const t = traitsOf(r.circuitId); classesByRace.set(r.id, t ? classesOf(t) : []); }
  const acc = new Map<string, { all: number[]; by: Record<string, number[]> }>();
  for (const s of scores) {
    const classes = classesByRace.get(s.raceId);
    if (!classes) continue;                                  // a score for a race we do not hold
    const a = acc.get(s.entityId) ?? { all: [], by: {} };
    a.all.push(s.totalPoints);
    for (const c of classes) (a.by[c] ??= []).push(s.totalPoints);
    acc.set(s.entityId, a);
  }
  const mean = (xs: number[]): Split => ({ n: xs.length, avg: xs.length ? r1(xs.reduce((p, q) => p + q, 0) / xs.length) : 0 });
  const out = new Map<string, EntitySplits>();
  for (const [id, a] of acc) out.set(id, { overall: mean(a.all), byClass: Object.fromEntries(Object.entries(a.by).map(([c, xs]) => [c, mean(xs)])) });
  return out;
}

/** Where each driver started and finished, over the races given. */
export function driverStarts(races: HistRace[]): Map<string, DriverStarts> {
  const acc = new Map<string, { starts: number; grid: number[]; finish: number[]; gained: number[]; finished: number; dnfs: number }>();
  for (const r of races) {
    for (const x of r.raceResults) {
      if (x.status === 'dns') continue;
      const a = acc.get(x.driverId) ?? { starts: 0, grid: [], finish: [], gained: [], finished: 0, dnfs: 0 };
      a.starts += 1;
      if (x.gridPosition > 0) a.grid.push(x.gridPosition);
      if (x.status === 'finished' && x.position > 0) {
        a.finished += 1; a.finish.push(x.position);
        if (x.gridPosition > 0) a.gained.push(x.gridPosition - x.position);
      }
      if (x.status === 'dnf') a.dnfs += 1;
      acc.set(x.driverId, a);
    }
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : 0);
  const out = new Map<string, DriverStarts>();
  for (const [id, a] of acc) out.set(id, { starts: a.starts, avgGrid: r1(mean(a.grid)), avgFinish: r1(mean(a.finish)), gained: r1(mean(a.gained)), finishRate: a.starts ? Math.round((a.finished / a.starts) * 100) : 0, dnfs: a.dnfs });
  return out;
}

/**
 * Fit 1..5 for a circuit: how an entity's points at circuits of this venue's classes compare with
 * its points everywhere. +25% per step; neutral until it has three races overall and two in a
 * class. The neutral 3 is the honest answer, and coverage treats an all-3 grid as "not published".
 */
export function fitFor(s: EntitySplits | undefined, t: CircuitTraits | undefined): number {
  if (!s || !t || s.overall.n < 3) return 3;
  const base = Math.max(s.overall.avg, 8);
  const deltas = classesOf(t).map((c) => s.byClass[c]).filter((x): x is Split => !!x && x.n >= 2).map((x) => (x.avg - s.overall.avg) / base);
  if (!deltas.length) return 3;
  const d = deltas.reduce((p, q) => p + q, 0) / deltas.length;
  return Math.max(1, Math.min(5, Math.round(3 + d / 0.25)));
}

export interface CircuitReport {
  id: string; name: string; kind: string; speed: string; classes: string[];
  laps: number; lapKm: number; pitLossS: number; strategy: string;
  profile: Array<{ label: string; v: number }>;
  /** constructors by fit at this venue's classes; empty in the free document */
  fitRanking: Array<{ id: string; fit: number; n: number }>;
  /** each driver at circuits of the same class this season */
  likeThis: Array<{ id: string; n: number; avgPts: number; avgFinish: number }>;
  racesInClass: number;
}

export function buildCircuitReport(circuitId: string, races: HistRace[], driverIds: string[], constructorIds: string[], splits: Map<string, EntitySplits>): CircuitReport | null {
  const t = traitsOf(circuitId);
  if (!t) return null;
  const classes = classesOf(t);
  const same = races.filter((r) => { const rt = traitsOf(r.circuitId); return rt ? classesOf(rt).some((c) => classes.includes(c)) : false; });
  const starts = driverStarts(same);
  const inClass = (id: string) => {
    const s = splits.get(id);
    if (!s) return { n: 0, avg: 0 };
    const hits = classes.map((c) => s.byClass[c]).filter((x): x is Split => !!x);
    const n = Math.max(0, ...hits.map((h) => h.n));
    return { n, avg: hits.length ? r1(hits.reduce((p, h) => p + h.avg, 0) / hits.length) : 0 };
  };
  return {
    id: t.id, name: t.name, kind: t.kind, speed: t.speed, classes,
    laps: t.laps, lapKm: t.lapKm, pitLossS: t.pitLossS, strategy: t.strategy,
    profile: [['Straight-line share', t.straights], ['Slow-corner share', t.slowCorners], ['Overtaking ease', t.overtaking], ['Safety-car rate', t.scRate], ['Tyre stress', t.tyreStress]].map(([label, v]) => ({ label: label as string, v: v as number })),
    fitRanking: constructorIds.map((id) => ({ id, fit: fitFor(splits.get(id), t), n: inClass(id).n })).sort((a, b) => b.fit - a.fit || b.n - a.n),
    likeThis: driverIds.map((id) => { const c = inClass(id); const st = starts.get(id); return { id, n: c.n, avgPts: c.avg, avgFinish: st?.avgFinish ?? 0 }; }).sort((a, b) => b.avgPts - a.avgPts),
    racesInClass: same.length,
  };
}

export interface PaceRow { id: string; starts: number; avgGrid: number; avgFinish: number; gained: number; finishRate: number; dnfs: number }
export function buildPace(driverIds: string[], starts: Map<string, DriverStarts>): PaceRow[] {
  return driverIds.map((id) => ({ id, ...(starts.get(id) ?? { starts: 0, avgGrid: 0, avgFinish: 0, gained: 0, finishRate: 0, dnfs: 0 }) })).filter((r) => r.starts > 0).sort((a, b) => a.avgFinish - b.avgFinish);
}

export interface SeasonRow { id: string; points: number; projected: number; starts: number; dnfs: number }
/** Points so far plus the median for each remaining round: where the season is heading on today's form. */
export function buildSeasonTable(driverIds: string[], form: Map<string, number[]>, median: Map<string, number>, remainingRounds: number, starts: Map<string, DriverStarts>): SeasonRow[] {
  return driverIds.map((id) => {
    const pts = (form.get(id) ?? []).reduce((p, q) => p + q, 0);
    return { id, points: pts, projected: Math.round(pts + (median.get(id) ?? 0) * Math.max(0, remainingRounds)), starts: starts.get(id)?.starts ?? 0, dnfs: starts.get(id)?.dnfs ?? 0 };
  }).sort((a, b) => b.projected - a.projected);
}
