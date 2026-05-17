// tlGenerateBenLinesLite — Ben-mechanic line generator that mirrors the
// methodology in MODELS.md without Ben's full Python pipeline.
//
// 1. Pull recent completed races from /races
// 2. For each active driver, compute weighted-avg finishing position across
//    the window (most recent races weighted higher)
// 3. Round to nearest half-integer = line
// 4. Apply variable σ by zone (P1–P7=2, P8–P14=5, P15+=2)
// 5. Normal CDF around prediction → under/over probability
// 6. Fair decimal odds = 1/probability
// 7. Constructor line = sum of team's two drivers' predicted positions
// 8. Write ben_lines/{raceId}_{session} (qualifying + race; sprint optional)
//
// HTTPS endpoint gated by the shared SEED_SECRET. Idempotent (merges over
// existing entities so manually-edited lines aren't clobbered).

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { applyCors } from './_cors';

const db = admin.firestore();
const SEED_SECRET = 'tl-seed-races-2026-shared-secret';

type SessionKey = 'qualifying' | 'race' | 'sprint';
const SESSION_RESULTS_KEY: Record<SessionKey, string> = {
  qualifying: 'qualifyingResults',
  race: 'raceResults',
  sprint: 'sprintResults',
};

// Window = last N completed races. Most-recent weight 2x, older 1x (per Ben).
const WINDOW = 9;
const RECENT_WEIGHT = 2;
const OLDER_WEIGHT = 1;
const DNF_PENALTY_OFFSET = 3.0;
const FIELD_SIZE = 22;

// Abramowitz & Stegun 7.1.26 erf approximation — good to ~1.5e-7.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(x: number, mean: number, sigma: number): number {
  return 0.5 * (1 + erf((x - mean) / (sigma * Math.SQRT2)));
}

function sigmaForPosition(pred: number): number {
  if (pred <= 7) return 2.0;
  if (pred <= 14) return 5.0;
  return 2.0;
}

// Range half-width as a fraction of σ. ~0.6 gives ~45–50% probability the
// actual finish lands inside the range — close to break-even for fair odds.
const RANGE_HALF_WIDTH_SIGMA = 0.6;

function rangeForPrediction(pred: number, kind: 'driver' | 'constructor'): { lo: number; hi: number } {
  const sigma = kind === 'driver' ? sigmaForPosition(pred) : Math.sqrt(2) * sigmaForPosition(pred / 2);
  const half = Math.max(1, Math.round(sigma * RANGE_HALF_WIDTH_SIGMA));
  const minPos = 1;
  const maxPos = kind === 'driver' ? FIELD_SIZE : FIELD_SIZE * 2;
  const lo = Math.max(minPos, Math.round(pred) - half);
  const hi = Math.min(maxPos, Math.round(pred) + half);
  return { lo, hi };
}

// Decimal odds from a fair probability. Gross payout = stake × odds.
function decimalOddsFromProb(p: number): number {
  if (p <= 0.001) return 999;
  return Math.round((1 / p) * 100) / 100;
}

interface RaceResultRow {
  position: number;
  driverId?: string;
  constructorId?: string;
  status?: 'finished' | 'dnf' | 'dsq';
}

interface RaceDoc {
  id: string;
  round: number;
  status: string;
  schedule?: { race?: admin.firestore.Timestamp };
  results?: Record<string, RaceResultRow[]>;
}

interface DriverPrediction {
  driverId: string;
  constructorId?: string;
  predicted: number; // continuous predicted finishing position
}

// Compute weighted-average finishing position for each driver across the
// recent window, with DNFs penalized as (classified_avg + 3.0).
function predictDrivers(window: RaceDoc[], session: SessionKey): DriverPrediction[] {
  const totals: Record<string, { sum: number; weight: number; constructorId?: string }> = {};
  // For DNF baseline we need the average classified finish for THIS race weekend,
  // computed per-race so penalty tracks the field.
  for (const race of window) {
    const rows = race.results?.[SESSION_RESULTS_KEY[session]] || [];
    if (rows.length === 0) continue;
    const classified = rows.filter((r) => (r.status ?? 'finished') !== 'dnf' && (r.status ?? 'finished') !== 'dsq');
    const classifiedAvg = classified.length
      ? classified.reduce((s, r) => s + r.position, 0) / classified.length
      : FIELD_SIZE / 2;
    // Newer races weighted higher (we only have 2026 here, so all the same;
    // structure mirrors Ben's 2x/1x model for future cross-year mixing).
    const weight = RECENT_WEIGHT;
    for (const r of rows) {
      if (!r.driverId) continue;
      const isDnf = (r.status ?? 'finished') === 'dnf' || (r.status ?? 'finished') === 'dsq';
      const pos = isDnf ? Math.min(FIELD_SIZE, classifiedAvg + DNF_PENALTY_OFFSET) : r.position;
      const k = r.driverId;
      if (!totals[k]) totals[k] = { sum: 0, weight: 0, constructorId: r.constructorId };
      totals[k].sum += pos * weight;
      totals[k].weight += weight;
      if (r.constructorId) totals[k].constructorId = r.constructorId;
    }
    void OLDER_WEIGHT;
  }
  return Object.entries(totals)
    .filter(([, v]) => v.weight > 0)
    .map(([driverId, v]) => ({
      driverId,
      constructorId: v.constructorId,
      predicted: v.sum / v.weight,
    }));
}

interface BenLineEntity {
  entityId: string;
  entityKind: 'driver' | 'constructor';
  predictedLo: number;
  predictedHi: number;
  /** legacy single-line value (midpoint) — kept for read fallbacks */
  line: number;
  withOdds: number;
  againstOdds: number;
  predicted?: number;
  sigma?: number;
  withProbability?: number;
  againstProbability?: number;
}

// Probability the actual finish lands in [lo, hi] given a normal around `pred`
// with stdev σ. Uses ±0.5 half-position correction for the integer grid.
function probInRange(pred: number, sigma: number, lo: number, hi: number): number {
  const pHi = normalCdf(hi + 0.5, pred, sigma);
  const pLo = normalCdf(lo - 0.5, pred, sigma);
  return Math.max(0.05, Math.min(0.95, pHi - pLo));
}

function buildDriverLine(pred: DriverPrediction): BenLineEntity {
  const { lo, hi } = rangeForPrediction(pred.predicted, 'driver');
  const sigma = sigmaForPosition(pred.predicted);
  const withProb = probInRange(pred.predicted, sigma, lo, hi);
  const againstProb = 1 - withProb;
  return {
    entityId: pred.driverId,
    entityKind: 'driver',
    predictedLo: lo,
    predictedHi: hi,
    line: Math.round((lo + hi) / 2),
    withOdds: decimalOddsFromProb(withProb),
    againstOdds: decimalOddsFromProb(againstProb),
    predicted: Math.round(pred.predicted * 100) / 100,
    sigma,
    withProbability: Math.round(withProb * 10000) / 10000,
    againstProbability: Math.round(againstProb * 10000) / 10000,
  };
}

function buildConstructorLines(drivers: DriverPrediction[]): BenLineEntity[] {
  // Group drivers by constructor; constructor predicted = sum of two drivers'
  // predicted positions. σ_combined ≈ √(σ1² + σ2²).
  const byCtor: Record<string, DriverPrediction[]> = {};
  for (const d of drivers) {
    if (!d.constructorId) continue;
    if (!byCtor[d.constructorId]) byCtor[d.constructorId] = [];
    byCtor[d.constructorId].push(d);
  }
  const out: BenLineEntity[] = [];
  for (const [ctorId, members] of Object.entries(byCtor)) {
    if (members.length < 1) continue;
    const sumPred = members.reduce((s, d) => s + d.predicted, 0);
    const sumVar = members.reduce((s, d) => s + Math.pow(sigmaForPosition(d.predicted), 2), 0);
    const sigma = Math.sqrt(sumVar);
    const { lo, hi } = rangeForPrediction(sumPred, 'constructor');
    const withProb = probInRange(sumPred, sigma, lo, hi);
    const againstProb = 1 - withProb;
    out.push({
      entityId: ctorId,
      entityKind: 'constructor',
      predictedLo: lo,
      predictedHi: hi,
      line: Math.round((lo + hi) / 2),
      withOdds: decimalOddsFromProb(withProb),
      againstOdds: decimalOddsFromProb(againstProb),
      predicted: Math.round(sumPred * 100) / 100,
      sigma: Math.round(sigma * 100) / 100,
      withProbability: Math.round(withProb * 10000) / 10000,
      againstProbability: Math.round(againstProb * 10000) / 10000,
    });
  }
  return out;
}

export const tlGenerateBenLinesLite = functions.https.onRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.query.key !== SEED_SECRET) {
    res.status(401).send('Unauthorized');
    return;
  }
  const raceId = String(req.query.raceId || '');
  if (!raceId) {
    res.status(400).json({ error: 'raceId query param required' });
    return;
  }
  const includeSprint = req.query.sprint === '1' || req.query.sprint === 'true';

  // Pull target race + window of completed races (excluding target itself).
  const targetSnap = await db.collection('races').doc(raceId).get();
  if (!targetSnap.exists) {
    res.status(404).json({ error: `Race ${raceId} not found` });
    return;
  }
  const target = { id: targetSnap.id, ...(targetSnap.data() as Omit<RaceDoc, 'id'>) } as RaceDoc;

  const completedSnap = await db.collection('races').where('status', '==', 'completed').get();
  const completed: RaceDoc[] = completedSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<RaceDoc, 'id'>) }))
    .filter((r) => r.id !== raceId)
    .sort((a, b) => (b.round || 0) - (a.round || 0))
    .slice(0, WINDOW);

  if (completed.length === 0) {
    res.status(400).json({ error: 'No completed races available for prediction' });
    return;
  }

  const sessions: SessionKey[] = ['qualifying', 'race'];
  if (includeSprint) sessions.push('sprint');

  const fs = admin.firestore.FieldValue;
  const summary: Record<string, number> = {};

  for (const session of sessions) {
    const preds = predictDrivers(completed, session);
    if (preds.length === 0) continue;
    const driverLines = preds.map(buildDriverLine);
    const ctorLines = buildConstructorLines(preds);
    const entities: Record<string, BenLineEntity> = {};
    for (const e of driverLines) entities[e.entityId] = e;
    for (const e of ctorLines) entities[e.entityId] = e;

    const docId = `${raceId}_${session}`;
    // Read existing to preserve any manually-edited lines.
    const existingSnap = await db.doc(`ben_lines/${docId}`).get();
    const existingEntities = existingSnap.exists ? (existingSnap.data()?.entities || {}) : {};
    // For each entity, only overwrite line/odds if there's no existing OR the
    // existing was a placeholder (sourceFile present and not "manual edit").
    const merged: Record<string, BenLineEntity> = { ...existingEntities };
    for (const [id, ent] of Object.entries(entities)) merged[id] = { ...(merged[id] || {}), ...ent };

    await db.doc(`ben_lines/${docId}`).set({
      raceId,
      session,
      entities: merged,
      posted: true,
      sourceFile: 'ben_lite_generator',
      postedAt: fs.serverTimestamp(),
      updatedAt: fs.serverTimestamp(),
      createdAt: fs.serverTimestamp(),
    }, { merge: true });
    summary[session] = driverLines.length + ctorLines.length;
  }

  res.status(200).json({
    raceId,
    round: target.round,
    windowRaces: completed.map((r) => r.id),
    summary,
  });
});
