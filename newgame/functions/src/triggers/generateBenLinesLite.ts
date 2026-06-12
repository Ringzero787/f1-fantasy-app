// tlGenerateBenLinesLite — Ben-mechanic line generator that mirrors the
// methodology in MODELS.md without Ben's full Python pipeline.
//
// 1. Pull recent completed races from /races
// 2. For each active driver, compute weighted-avg finishing position across
//    the window (most recent races weighted higher)
// 3. Round to nearest half-integer = line
// 4. Apply variable σ by zone — per MODELS v1.2:
//      Race / Sprint: P1–P7=2.0, P8–P14=5.0, P15+=2.0
//      Quali       : P1–P5=3.5, P6–P14=5.0, P15+=4.0  (1-lap event, wider front)
// 5. Normal CDF around prediction → with/against probability
// 6. Fair decimal odds = 1/probability
// 7. Constructor line = sum of team's two drivers' predicted positions
// 8. Write ben_lines/{raceId}_{session} (qualifying + race; sprint optional)
//
// HTTPS endpoint gated by the shared SEED_SECRET. Idempotent (merges over
// existing entities so manually-edited lines aren't clobbered).

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { applyCors } from './_cors';
import { offeredOddsFromFairProb, BOOK_VIG } from './_odds';

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

// Per MODELS v1.2: race + sprint share one σ schedule (predictable top, chaotic
// midfield, compressed backmarkers). Quali is wider because a single lap-time
// mistake costs 5+ slots with no recovery, so even front-runners have variance.
function sigmaForPosition(pred: number, session: SessionKey): number {
  if (session === 'qualifying') {
    if (pred <= 5) return 3.5;
    if (pred <= 14) return 5.0;
    return 4.0;
  }
  // race + sprint
  if (pred <= 7) return 2.0;
  if (pred <= 14) return 5.0;
  return 2.0;
}

// Range half-width as a fraction of σ. ~0.6 gives ~45–50% probability the
// actual finish lands inside the range — close to break-even for fair odds.
const RANGE_HALF_WIDTH_SIGMA = 0.6;

function rangeForPrediction(
  pred: number,
  kind: 'driver' | 'constructor',
  session: SessionKey,
): { lo: number; hi: number } {
  const sigma = kind === 'driver'
    ? sigmaForPosition(pred, session)
    : Math.sqrt(2) * sigmaForPosition(pred / 2, session);
  const half = Math.max(1, Math.round(sigma * RANGE_HALF_WIDTH_SIGMA));
  const minPos = 1;
  const maxPos = kind === 'driver' ? FIELD_SIZE : FIELD_SIZE * 2;
  const lo = Math.max(minPos, Math.round(pred) - half);
  const hi = Math.min(maxPos, Math.round(pred) + half);
  return { lo, hi };
}

// Offered odds carry the bookmaker's hold (the game's cash sink) — see _odds.ts.
// The fair probabilities are still stored on each entity for analytics.

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
  /** One of Ben's 3 featured picks for the GP (race session only). Betting
   *  AGAINST a best bet is boosted risk/reward: win pays profit × 1.5, loss
   *  costs −1 pt (session-weighted). Settled in settleWeekend. */
  bestBet?: boolean;
  /** Admin hand-set this entity's range/odds (e.g. one of Ben's O/U calls).
   *  The generator preserves these entities verbatim on regeneration — it
   *  never recomputes their line. */
  manualLine?: boolean;
  /** Human-readable form of the admin's call, e.g. "U 4.5" / "O 11.5". */
  benCall?: string;
}

// How many lines Ben features per Grand Prix, and how they're auto-chosen:
// the most confident DRIVER calls (highest withProbability, tie-broken by
// lowest sigma). Drivers only — constructor lines are sums of two cars, so
// they score structurally higher confidence and would otherwise crowd out the
// driver picks every week. Admins can hand-pick instead (incl. constructors)
// by setting `bestBetsSource: 'manual'` on the ben_lines doc — the generator
// then leaves all bestBet flags untouched.
const BEST_BET_COUNT = 3;

function flagBestBets(entities: Record<string, BenLineEntity>): void {
  const ranked = Object.values(entities)
    .filter((e) => e.entityKind === 'driver')
    .sort(
      (a, b) =>
        (b.withProbability ?? 0) - (a.withProbability ?? 0) ||
        (a.sigma ?? 99) - (b.sigma ?? 99),
    );
  const top = new Set(ranked.slice(0, BEST_BET_COUNT).map((e) => e.entityId));
  for (const e of Object.values(entities)) e.bestBet = top.has(e.entityId);
}

// Probability the actual finish lands in [lo, hi] given a normal around `pred`
// with stdev σ. Uses ±0.5 half-position correction for the integer grid.
function probInRange(pred: number, sigma: number, lo: number, hi: number): number {
  const pHi = normalCdf(hi + 0.5, pred, sigma);
  const pLo = normalCdf(lo - 0.5, pred, sigma);
  return Math.max(0.05, Math.min(0.95, pHi - pLo));
}

function buildDriverLine(pred: DriverPrediction, session: SessionKey): BenLineEntity {
  const { lo, hi } = rangeForPrediction(pred.predicted, 'driver', session);
  const sigma = sigmaForPosition(pred.predicted, session);
  const withProb = probInRange(pred.predicted, sigma, lo, hi);
  const againstProb = 1 - withProb;
  return {
    entityId: pred.driverId,
    entityKind: 'driver',
    predictedLo: lo,
    predictedHi: hi,
    line: Math.round((lo + hi) / 2),
    withOdds: offeredOddsFromFairProb(withProb),
    againstOdds: offeredOddsFromFairProb(againstProb),
    predicted: Math.round(pred.predicted * 100) / 100,
    sigma,
    withProbability: Math.round(withProb * 10000) / 10000,
    againstProbability: Math.round(againstProb * 10000) / 10000,
  };
}

function buildConstructorLines(drivers: DriverPrediction[], session: SessionKey): BenLineEntity[] {
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
    const sumVar = members.reduce((s, d) => s + Math.pow(sigmaForPosition(d.predicted, session), 2), 0);
    const sigma = Math.sqrt(sumVar);
    const { lo, hi } = rangeForPrediction(sumPred, 'constructor', session);
    const withProb = probInRange(sumPred, sigma, lo, hi);
    const againstProb = 1 - withProb;
    out.push({
      entityId: ctorId,
      entityKind: 'constructor',
      predictedLo: lo,
      predictedHi: hi,
      line: Math.round((lo + hi) / 2),
      withOdds: offeredOddsFromFairProb(withProb),
      againstOdds: offeredOddsFromFairProb(againstProb),
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
    // Per MODELS v1.2, sprint uses GP rank as proxy when no sprint pace data
    // exists yet (sprints only happen ~6× a season). Fall back to race history.
    let preds = predictDrivers(completed, session);
    if (preds.length === 0 && session === 'sprint') {
      preds = predictDrivers(completed, 'race');
    }
    if (preds.length === 0) continue;
    const driverLines = preds.map((p) => buildDriverLine(p, session));
    const ctorLines = buildConstructorLines(preds, session);
    const entities: Record<string, BenLineEntity> = {};
    for (const e of driverLines) entities[e.entityId] = e;
    for (const e of ctorLines) entities[e.entityId] = e;

    const docId = `${raceId}_${session}`;
    // Read existing to preserve any manually-edited lines.
    const existingSnap = await db.doc(`ben_lines/${docId}`).get();
    const existingData = existingSnap.exists ? existingSnap.data() : null;
    const existingEntities = (existingData?.entities || {}) as Record<string, BenLineEntity>;
    // Merge freshly-computed lines over existing ones — EXCEPT entities an admin
    // hand-set (manualLine), which are preserved verbatim so a regeneration run
    // never reverts a manual line (e.g. one of Ben's O/U calls). Brand-new and
    // non-manual entities get the recomputed range/odds.
    const merged: Record<string, BenLineEntity> = { ...existingEntities };
    for (const [id, ent] of Object.entries(entities)) {
      if (merged[id]?.manualLine) continue;
      merged[id] = { ...(merged[id] || {}), ...ent };
    }

    // Best bets — Ben's 3 featured picks, race session only. Auto-flag the top
    // 3 by confidence UNLESS an admin hand-picked them (bestBetsSource:
    // 'manual'), in which case the existing flags are restored untouched.
    const manualBestBets = existingData?.bestBetsSource === 'manual';
    if (session === 'race') {
      if (manualBestBets) {
        for (const [id, ent] of Object.entries(merged)) {
          ent.bestBet = existingEntities[id]?.bestBet === true;
        }
      } else {
        flagBestBets(merged);
      }
    }

    await db.doc(`ben_lines/${docId}`).set({
      raceId,
      session,
      entities: merged,
      posted: true,
      vig: BOOK_VIG,
      ...(session === 'race' && !manualBestBets ? { bestBetsSource: 'auto' } : {}),
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
