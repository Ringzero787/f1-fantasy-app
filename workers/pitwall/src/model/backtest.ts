/**
 * Walk-forward backtest: for each race from `minTrain` on, fit on the races
 * before it, project it, and compare with what scoring actually wrote. The
 * model has to beat the plain "average of the last three races" baseline or
 * it does not ship (F-070).
 */
import { quantile, rng } from './rng';
import { appliedPriceChange } from './priceRules';
import { scoreWeekend } from './scoreRace';
import { DEFAULT_SIM, simulate, type SimOptions } from './simulate';
import { DEFAULT_FORM, estimateForm, type FormOptions } from './strength';
import type { History } from './types';

/** Outcomes are judged in TODAY'S rules: every past classification is re-scored, for the model and the baselines alike. */
export interface Row { raceId: string; round: number; entityId: string; entityType: 'driver' | 'constructor'; actual: number; model: number; modelMean: number; last3: number; seasonMean: number; floor: number; ceiling: number; rawFloor: number; rawCeiling: number; bandScale: number; priceActual: number | null; priceModel: number | null; priceLast3: number | null }

export interface Metrics { n: number; maeModel: number; maeModelMean: number; maeLast3: number; maeSeasonMean: number; bandCoverage: number; }
export interface Report {
  races: number; testRaces: string[]; rows: number; runs: number;
  all: Metrics; drivers: Metrics; constructors: Metrics;
  /** mean(|err last3| - |err model|): positive means the model is better. 90% interval from resampling whole races. */
  improvement: { mean: number; lo: number; hi: number; racesModelBetter: number; racesTotal: number };
  price: { n: number; modelAccuracy: number; last3Accuracy: number; alwaysFallAccuracy: number };
  /**
   * Does the worker's scorer reproduce what production scoring stored? Compared only where production used
   * today's rules: rounds 1 to 7 of 2026 were scored under earlier point rules, and rounds 15 and 16 banked a flat
   * retirement penalty because the lap-proportional one was deployed after them. Those are counted as explained.
   */
  scoringParity: { compared: number; mismatches: number; explained: number };
  /** the band scale the next live projection should use (fitted on every test race) */
  bandScale: number;
  perRace: Array<{ raceId: string; round: number; maeModel: number; maeLast3: number; coverage: number }>;
  verdict: { beatsBaseline: boolean; bandInTarget: boolean; ships: boolean; reasons: string[] };
}

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);

function metrics(rows: Row[]): Metrics {
  return {
    n: rows.length,
    maeModel: mean(rows.map((r) => Math.abs(r.actual - r.model))),
    maeModelMean: mean(rows.map((r) => Math.abs(r.actual - r.modelMean))),
    maeLast3: mean(rows.map((r) => Math.abs(r.actual - r.last3))),
    maeSeasonMean: mean(rows.map((r) => Math.abs(r.actual - r.seasonMean))),
    bandCoverage: mean(rows.map((r) => (r.actual >= r.floor && r.actual <= r.ceiling ? 1 : 0))),
  };
}

export function backtest(h: History, opts: { minTrain?: number; sim?: Partial<SimOptions>; form?: FormOptions } = {}): Report {
  const minTrain = opts.minTrain ?? 3;
  const sim = { ...DEFAULT_SIM, ...opts.sim };
  const rows: Row[] = [];
  const actualByRace = new Map<string, Map<string, number>>();
  for (const s of h.scores) { if (!actualByRace.has(s.raceId)) actualByRace.set(s.raceId, new Map()); actualByRace.get(s.raceId)!.set(s.entityId, s.totalPoints); }
  const priceByRace = new Map<string, Map<string, { prev: number; change: number }>>();
  for (const p of h.prices) { if (!priceByRace.has(p.raceId)) priceByRace.set(p.raceId, new Map()); priceByRace.get(p.raceId)!.set(p.entityId, { prev: p.previousPrice, change: p.change }); }

  // does our scorer reproduce what scoring stored? (guards the whole comparison)
  let compared = 0, mismatches = 0, explained = 0;
  const pricingByRace = new Map<string, Map<string, number>>();
  const storedByRace = actualByRace;
  const rescored = new Map<string, Map<string, number>>();
  for (const race of h.races) {
    const s = scoreWeekend(race.raceResults, race.qualifyingResults, race.sprintResults, { totalLaps: race.totalLaps, round: race.round });
    pricingByRace.set(race.id, s.pricingPoints);
    rescored.set(race.id, s.points);
    const stored = storedByRace.get(race.id);
    if (!stored) continue;
    const retired = new Set(race.raceResults.filter((r) => r.status === 'dnf').map((r) => r.driverId));
    for (const [id, pts] of stored) {
      if ((s.points.get(id) ?? 0) === pts) { compared++; continue; }
      const oldRules = race.season === '2026' && race.round <= 7;
      const flatRetirement = race.season === '2026' && (race.round === 15 || race.round === 16) && retired.has(id);
      if (oldRules || flatRetirement) explained++; else { compared++; mismatches++; }
    }
  }
  // from here on "actual" means today's rules applied to the real classification
  for (const [raceId, pts] of rescored) actualByRace.set(raceId, new Map([...pts].filter(([id]) => storedByRace.get(raceId)?.has(id) ?? true)));

  for (let k = minTrain; k < h.races.length; k++) {
    const target = h.races[k];
    const past = h.races.slice(0, k);
    const actual = actualByRace.get(target.id);
    if (!actual) continue;
    const entrants = target.raceResults.filter((r) => r.status !== 'dns').map((r) => ({ driverId: r.driverId, constructorId: r.constructorId }));
    const priceInfo = priceByRace.get(target.id) ?? new Map();
    const prices = new Map<string, number>([...priceInfo].map(([id, p]) => [id, p.prev]));
    const proj = simulate(estimateForm(past, entrants, opts.form ?? DEFAULT_FORM), { totalLaps: target.totalLaps, round: target.round, hasSprint: target.hasSprint, prices }, { ...sim, seed: sim.seed + k });
    const gridMean = new Map<string, number>();
    for (const type of ['driver', 'constructor'] as const) {
      const vals = past.flatMap((r) => [...(actualByRace.get(r.id) ?? [])].filter(([id]) => (type === 'constructor') === r.raceResults.some((x) => x.constructorId === id)).map(([, v]) => v));
      gridMean.set(type, mean(vals));
    }
    // Band calibration, walk-forward: widen or narrow the simulated band by the factor that would have held
    // 70% of the outcomes in the test races BEFORE this one. The first test race uses the raw band.
    const z = rows.map((r) => (r.actual >= r.model ? (r.actual - r.model) / Math.max(1e-9, r.rawCeiling - r.model) : (r.model - r.actual) / Math.max(1e-9, r.model - r.rawFloor)));
    const scale = z.length >= 60 ? quantile([...z].sort((x, y) => x - y), 0.7) : 1;
    for (const p of proj) {
      const a = actual.get(p.entityId);
      if (a === undefined) continue;
      const hist = past.map((r) => actualByRace.get(r.id)?.get(p.entityId)).filter((v): v is number => v !== undefined);
      const fallback = gridMean.get(p.entityType) ?? 0;
      const pi = priceInfo.get(p.entityId);
      const pricingHist = past.map((r) => (actualByRace.get(r.id)?.has(p.entityId) ? pricingByRace.get(r.id)?.get(p.entityId) : undefined)).filter((v): v is number => v !== undefined);
      rows.push({
        raceId: target.id, round: target.round, entityId: p.entityId, entityType: p.entityType, actual: a,
        model: p.median, modelMean: p.mean, last3: hist.length ? mean(hist.slice(-3)) : fallback, seasonMean: hist.length ? mean(hist) : fallback,
        floor: p.median - (p.median - p.floor) * scale, ceiling: p.median + (p.ceiling - p.median) * scale, rawFloor: p.floor, rawCeiling: p.ceiling, bandScale: scale,
        priceActual: pi ? sign(pi.change) : null,
        priceModel: pi ? sign(Math.abs(p.expectedPriceChange) < 0.5 ? 0 : p.expectedPriceChange) : null,
        priceLast3: pi && pricingHist.length ? sign(appliedPriceChange(mean(pricingHist.slice(-3)), 0, pi.prev)) : null,
      });
    }
  }

  // resample whole races: errors inside one race are not independent
  const byRace = new Map<string, Row[]>();
  for (const r of rows) { if (!byRace.has(r.raceId)) byRace.set(r.raceId, []); byRace.get(r.raceId)!.push(r); }
  const raceIds = [...byRace.keys()];
  const gain = (rs: Row[]) => mean(rs.map((r) => Math.abs(r.actual - r.last3) - Math.abs(r.actual - r.model)));
  const u = rng(7);
  const boots: number[] = [];
  for (let b = 0; b < 2000; b++) {
    const pick: Row[] = [];
    for (let i = 0; i < raceIds.length; i++) pick.push(...byRace.get(raceIds[Math.floor(u() * raceIds.length)])!);
    boots.push(gain(pick));
  }
  boots.sort((a, b) => a - b);
  const perRace = raceIds.map((id) => { const rs = byRace.get(id)!; const m = metrics(rs); return { raceId: id, round: rs[0].round, maeModel: m.maeModel, maeLast3: m.maeLast3, coverage: m.bandCoverage }; });

  const priced = rows.filter((r) => r.priceActual !== null && r.priceModel !== null && r.priceLast3 !== null);
  const all = metrics(rows);
  const improvement = { mean: gain(rows), lo: quantile(boots, 0.05), hi: quantile(boots, 0.95), racesModelBetter: perRace.filter((r) => r.maeModel < r.maeLast3).length, racesTotal: perRace.length };
  const beatsBaseline = improvement.lo > 0;
  const bandInTarget = all.bandCoverage >= 0.65 && all.bandCoverage <= 0.75;
  const reasons: string[] = [];
  if (improvement.mean <= 0) reasons.push('the model is not better than the last-3 average on mean absolute error');
  else if (!beatsBaseline) reasons.push('the model is better on average, but the 90% interval of the improvement includes zero: with this few races it could be luck');
  if (!bandInTarget) reasons.push(`the floor-to-ceiling band holds ${(all.bandCoverage * 100).toFixed(0)}% of outcomes, outside the 65 to 75% target`);
  if (mismatches > 0) reasons.push(`the worker's scorer disagrees with stored raceScores on ${mismatches} of ${compared} values that were scored under today's rules`);
  return {
    races: h.races.length, testRaces: raceIds, rows: rows.length, runs: sim.runs,
    all, drivers: metrics(rows.filter((r) => r.entityType === 'driver')), constructors: metrics(rows.filter((r) => r.entityType === 'constructor')),
    improvement,
    price: { n: priced.length, modelAccuracy: mean(priced.map((r) => (r.priceModel === r.priceActual ? 1 : 0))), last3Accuracy: mean(priced.map((r) => (r.priceLast3 === r.priceActual ? 1 : 0))), alwaysFallAccuracy: mean(priced.map((r) => (r.priceActual === -1 ? 1 : 0))) },
    scoringParity: { compared, mismatches, explained }, perRace,
    bandScale: (() => { const zz = rows.map((r) => (r.actual >= r.model ? (r.actual - r.model) / Math.max(1e-9, r.rawCeiling - r.model) : (r.model - r.actual) / Math.max(1e-9, r.model - r.rawFloor))).sort((x, y) => x - y); return quantile(zz, 0.7); })(),
    verdict: { beatsBaseline, bandInTarget, ships: beatsBaseline && bandInTarget && mismatches === 0, reasons },
  };
}
