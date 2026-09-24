/**
 * Monte Carlo projection of one race weekend. Each run draws a qualifying
 * order, retirements, a race order and (on sprint weekends) a sprint, then
 * scores it with the real rules (scoreWeekend -> scoringCore). Teammates share
 * a car shock, and a share of runs are disrupted races with wider spread and
 * more retirements.
 */
import { normal, quantile, rng } from './rng';
import { appliedPriceChange } from './priceRules';
import { scoreWeekend } from './scoreRace';
import type { Form } from './strength';
import type { HistQualiResult, HistRaceResult, HistSprintResult, Projection } from './types';

export interface SimOptions {
  runs: number;
  seed: number;
  /** sd of the shock teammates share, in positions */
  carSd: number;
  /** sd of qualifying noise, in positions */
  qualiSd: number;
  /** share of races that are disrupted (safety cars, weather) and how much wider they are */
  chaosRate: number;
  chaosFactor: number;
  /** how much the grid slot, rather than underlying pace, decides the finish */
  gridWeight: number;
}
export const DEFAULT_SIM: SimOptions = { runs: 10000, seed: 20260919, carSd: 1.5, qualiSd: 2.2, chaosRate: 0.3, chaosFactor: 1.25, gridWeight: 0.25 };

export interface SimContext { totalLaps: number; round: number; hasSprint: boolean; prices: Map<string, number> }

function order<T>(items: T[], score: (t: T) => number): T[] {
  return items.map((t) => ({ t, s: score(t) })).sort((a, b) => a.s - b.s).map((x) => x.t);
}

export function simulate(form: Form, ctx: SimContext, opts: SimOptions = DEFAULT_SIM): Projection[] {
  const u = rng(opts.seed);
  const drivers = form.drivers;
  const cars = [...new Set(drivers.map((d) => d.constructorId))];
  const samples = new Map<string, number[]>();
  // points in the runs where the entity did NOT retire: the band is the central 70% of those,
  // and the retirement risk is reported separately (a retirement is a different event, not a bad day)
  const finishedSamples = new Map<string, number[]>();
  const priceMoves = new Map<string, number[]>();
  const tally = new Map<string, { win: number; podium: number; top10: number; dnf: number }>();
  for (const id of [...drivers.map((d) => d.driverId), ...cars]) { samples.set(id, []); finishedSamples.set(id, []); priceMoves.set(id, []); }
  for (const d of drivers) tally.set(d.driverId, { win: 0, podium: 0, top10: 0, dnf: 0 });

  const carOfId = new Set(cars);
  for (let run = 0; run < opts.runs; run++) {
    const chaos = u() < opts.chaosRate ? opts.chaosFactor : 1;
    const shock = new Map(cars.map((c) => [c, normal(u) * opts.carSd]));
    const qualiOrder = order(drivers, (d) => d.qualiMu + 0.6 * (shock.get(d.constructorId) ?? 0) + normal(u) * opts.qualiSd);
    const gridPos = new Map(qualiOrder.map((d, i) => [d.driverId, i + 1]));
    const qualifying: HistQualiResult[] = qualiOrder.map((d, i) => ({ driverId: d.driverId, constructorId: d.constructorId, position: i + 1 }));

    const retired = new Set(drivers.filter((d) => u() < Math.min(0.6, d.dnfHazard * chaos)).map((d) => d.driverId));
    const finishers = order(drivers.filter((d) => !retired.has(d.driverId)), (d) =>
      (1 - opts.gridWeight) * d.raceMu + opts.gridWeight * (gridPos.get(d.driverId) ?? d.raceMu) + (shock.get(d.constructorId) ?? 0) + normal(u) * form.sd * chaos * 0.8);
    // fastest lap: one of the top ten, the front more often
    const top = finishers.slice(0, 10);
    let pick = u() * top.reduce((s, _d, i) => s + (11 - i), 0);
    let fastest = top[0]?.driverId;
    for (let i = 0; i < top.length; i++) { pick -= 11 - i; if (pick <= 0) { fastest = top[i].driverId; break; } }
    const raceResults: HistRaceResult[] = [
      ...finishers.map((d, i) => ({ driverId: d.driverId, constructorId: d.constructorId, position: i + 1, gridPosition: gridPos.get(d.driverId) ?? i + 1, status: 'finished', fastestLap: d.driverId === fastest, laps: ctx.totalLaps })),
      ...drivers.filter((d) => retired.has(d.driverId)).map((d, i) => ({ driverId: d.driverId, constructorId: d.constructorId, position: finishers.length + i + 1, gridPosition: gridPos.get(d.driverId) ?? 1, status: 'dnf', fastestLap: false, laps: Math.max(0, Math.ceil(u() * ctx.totalLaps) - 1) })),
    ];
    let sprint: HistSprintResult[] = [];
    if (ctx.hasSprint) {
      const out = new Set(drivers.filter((d) => u() < d.dnfHazard * 0.3).map((d) => d.driverId));
      const so = order(drivers.filter((d) => !out.has(d.driverId)), (d) => 0.5 * d.raceMu + 0.5 * d.qualiMu + (shock.get(d.constructorId) ?? 0) + normal(u) * form.sd * 0.7);
      sprint = [...so.map((d, i) => ({ driverId: d.driverId, position: i + 1, status: 'finished' })), ...[...out].map((id, i) => ({ driverId: id, position: so.length + i + 1, status: 'dnf' }))];
    }

    const scored = scoreWeekend(raceResults, qualifying, sprint, ctx);
    for (const [id, arr] of samples) {
      const pts = scored.points.get(id) ?? 0;
      arr.push(pts);
      // a car "retires" for band purposes only when both its drivers do
      const retiredHere = carOfId.has(id) ? drivers.filter((d) => d.constructorId === id).every((d) => retired.has(d.driverId)) : retired.has(id);
      if (!retiredHere) finishedSamples.get(id)!.push(pts);
    }
    for (const [id, arr] of priceMoves) {
      const price = ctx.prices.get(id);
      arr.push(price === undefined ? 0 : appliedPriceChange(scored.pricingPoints.get(id) ?? 0, scored.dnfPricePenalty.get(id) ?? 0, price));
    }
    finishers.forEach((d, i) => { const t = tally.get(d.driverId)!; if (i === 0) t.win++; if (i < 3) t.podium++; if (i < 10) t.top10++; });
    for (const id of retired) tally.get(id)!.dnf++;
  }

  const carOf = carOfId;
  return [...samples].map(([id, arr]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const fin = [...(finishedSamples.get(id) ?? [])].sort((a, b) => a - b);
    const band = fin.length >= 20 ? fin : sorted;
    const median = quantile(sorted, 0.5);
    const moves = priceMoves.get(id) ?? [];
    const t = tally.get(id);
    const n = opts.runs;
    return {
      entityId: id, entityType: carOf.has(id) ? 'constructor' as const : 'driver' as const,
      // The band describes a finishing weekend; the median is the central outcome over every run, so it
      // carries retirement risk (what a pick is really worth). For a pick more likely than not to retire the
      // median falls below the finishing floor, so the range is clamped to contain it and the floor itself
      // becomes the signal.
      floor: Math.min(quantile(band, 0.15), median), median, ceiling: Math.max(quantile(band, 0.85), median),
      mean: arr.reduce((s, v) => s + v, 0) / n,
      pWin: t ? t.win / n : 0, pPodium: t ? t.podium / n : 0, pTop10: t ? t.top10 / n : 0, pDnf: t ? t.dnf / n : 0,
      aceMedian: median * 2,
      pRise: moves.filter((m) => m > 0).length / n, pFall: moves.filter((m) => m < 0).length / n,
      expectedPriceChange: moves.reduce((s, v) => s + v, 0) / n,
    };
  });
}
