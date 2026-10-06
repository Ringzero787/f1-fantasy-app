/**
 * From a weekly model to a finishing-position distribution per driver (F-106).
 *
 * Ben's model gives each driver a continuous predicted finish (e.g. 3.07) and the
 * zone rule gives a spread: σ = 2.0 at the front and the back, 5.0 in the midfield
 * (the same rule Track Limits' line seeding uses). Each driver's finish is read as
 * Normal(predicted, σ) discretised onto positions 1…N, tails folded into P1 and PN.
 * Twenty drivers' independent marginals do not make one race — every position is
 * taken exactly once — so the matrix is balanced (iterative proportional fitting)
 * until each driver's row and each position's column both sum to one. That is what
 * a Moonshot's chance is read from: WIN = P1, PODIUM = P1…P3, TOP 5 = P1…P5,
 * EXACT = the one position.
 */
import type { PredictionType } from './config';

export interface ModelDriver { predicted: number; sigma: number }
export interface DistributedDriver extends ModelDriver { positions: number[] }

/**
 * The zone rule: front and back of the field are predictable (σ 2.0), the midfield is not (σ 5.0).
 * Ramped over two positions at each boundary rather than stepped: a step at 7.5 gave a driver
 * predicted 7.6 a fatter tail, and so a better chance of winning, than one predicted 6.4.
 */
export const zoneSigma = (pred: number): number => {
  const ramp = (x: number) => Math.max(0, Math.min(1, x));
  const up = ramp((pred - 6.5) / 2);      // 6.5 → 8.5: 2.0 → 5.0
  const down = ramp((pred - 13.5) / 2);   // 13.5 → 15.5: 5.0 → 2.0
  return 2.0 + 3.0 * up - 3.0 * down;
};

const erf = (x: number): number => {
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
};
export const phi = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2));

/** The smallest chance any position keeps: nothing in a race is impossible. */
export const FLOOR = 1e-4;

/** One driver's marginal over positions 1…n (index 0 = P1), summing to 1. */
export function discretise(predicted: number, sigma: number, n: number): number[] {
  const s = Math.max(sigma, 0.5);
  const out: number[] = [];
  for (let k = 1; k <= n; k++) {
    const lo = k === 1 ? -Infinity : (k - 0.5 - predicted) / s;
    const hi = k === n ? Infinity : (k + 0.5 - predicted) / s;
    out.push((hi === Infinity ? 1 : phi(hi)) - (lo === -Infinity ? 0 : phi(lo)));
  }
  // a floor so no position is impossible: a call on it is still allowed, at the capped multiplier
  const floored = out.map((v) => Math.max(v, FLOOR));
  const sum = floored.reduce((a, b) => a + b, 0);
  return floored.map((v) => v / sum);
}

/** Balance a drivers × positions matrix so every row and every column sums to 1. */
export function balance(rows: number[][], iterations = 50): number[][] {
  let m = rows.map((r) => r.slice());
  const n = rows.length;
  for (let it = 0; it < iterations; it++) {
    // columns: each position is taken by exactly one driver
    for (let k = 0; k < n; k++) {
      const col = m.reduce((a, r) => a + r[k], 0);
      if (col > 0) for (const r of m) r[k] /= col;
    }
    // rows: each driver finishes somewhere
    m = m.map((r) => { const s = r.reduce((a, b) => a + b, 0); return s > 0 ? r.map((v) => v / s) : r; });
  }
  return m;
}

/** Every driver's distribution from the model's predicted finishes, balanced across the field. */
export function distribute(model: Record<string, ModelDriver>): Record<string, DistributedDriver> {
  const ids = Object.keys(model).sort((a, b) => model[a].predicted - model[b].predicted);
  const n = ids.length;
  const rows = ids.map((id) => discretise(model[id].predicted, model[id].sigma, n));
  const balanced = balance(rows);
  const out: Record<string, DistributedDriver> = {};
  ids.forEach((id, i) => {
    // balancing squeezes a favourite's chance of finishing last below what six decimals keep;
    // re-floor so no call is ever refused as impossible (it is simply priced at the cap).
    // Columns drift from one by at most n × FLOOR, which the seeder's column-sum check shows.
    const floored = balanced[i].map((v) => Math.max(v, FLOOR));
    const s = floored.reduce((a, b) => a + b, 0);
    out[id] = { ...model[id], positions: floored.map((v) => Math.round((v / s) * 1e6) / 1e6) };
  });
  return out;
}

/** The chance of a prediction, from a driver's distribution. `target` is the 1-based position for EXACT_FINISH. */
export function predictionProbability(positions: number[], type: PredictionType, target?: number): number | null {
  const upTo = (k: number) => positions.slice(0, Math.min(k, positions.length)).reduce((a, b) => a + b, 0);
  switch (type) {
    case 'WIN': return upTo(1);
    case 'PODIUM': return upTo(3);
    case 'TOP_5': return upTo(5);
    case 'EXACT_FINISH': return target && target >= 1 && target <= positions.length ? positions[target - 1] : null;
    default: return null;
  }
}

/** Expected finish and the central 80% range, for the "why this multiplier" view. */
export function summarise(positions: number[]): { expected: number; lo: number; hi: number } {
  let expected = 0, acc = 0, lo = 1, hi = positions.length;
  positions.forEach((p, i) => { expected += p * (i + 1); });
  for (let i = 0; i < positions.length; i++) { acc += positions[i]; if (acc >= 0.1) { lo = i + 1; break; } }
  acc = 0;
  for (let i = 0; i < positions.length; i++) { acc += positions[i]; if (acc >= 0.9) { hi = i + 1; break; } }
  return { expected: Math.round(expected * 10) / 10, lo, hi };
}
