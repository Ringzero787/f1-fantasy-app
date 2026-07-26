// tlSettleWeekend — Cloud Function that grades all player picks for a race
// against Ben's posted lines, writes per-pick outcomes, weekend scores, and
// updates the season totals.
//
// RESULT SOURCE: each entity's actual finishing position is derived from the
// OFFICIAL race document (races/{raceId}.results) at settlement time — NOT from
// a `result`/`outcome` field copied onto ben_lines. ben_lines is read only for
// the book's predicted range (predictedLo/Hi) and decimal odds. This removes
// the manual backfill step from the settlement path and guarantees picks settle
// against the same results the rest of the app shows. The function refuses to
// run unless the race is `completed` with results present.
//
// Trigger: HTTPS callable, admin-only (manual run).

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

type SessionKey = 'qualifying' | 'race' | 'sprint';
type BenSide = 'with' | 'against';
const SESSION_WEIGHT: Record<SessionKey, number> = { race: 1, qualifying: 0.5, sprint: 0.25 };

// Worst classified position used when a result row has no usable position.
const FIELD_SIZE = 22;

const SESSION_RESULTS_KEY: Record<SessionKey, 'qualifyingResults' | 'raceResults' | 'sprintResults'> = {
  qualifying: 'qualifyingResults',
  race: 'raceResults',
  sprint: 'sprintResults',
};

interface ResultRow {
  position: number;
  driverId?: string;
  constructorId?: string;
  status?: 'finished' | 'dnf' | 'dsq';
}
interface RaceResultsBundle {
  qualifyingResults?: ResultRow[];
  sprintResults?: ResultRow[];
  raceResults?: ResultRow[];
}

// Per-session lookups built from the official race results. Driver result = its
// finishing position; constructor result = sum of its drivers' positions (the
// same quantity the lines were built/predicted against).
interface SessionResults {
  driver: Record<string, number>;
  constructor: Record<string, number>;
}

function posOf(r: ResultRow): number {
  return typeof r.position === 'number' && r.position > 0 ? r.position : FIELD_SIZE;
}

// `driverToCtor` maps driverId → constructorId so constructor sums can be built
// even when a result row omits constructorId (sprint results in particular carry
// only driverId). Race/quali rows that DO carry constructorId use it directly.
function buildSessionResults(
  rows: ResultRow[] | undefined,
  driverToCtor: Record<string, string>
): SessionResults | null {
  if (!rows || rows.length === 0) return null;
  const driver: Record<string, number> = {};
  const ctor: Record<string, number> = {};
  for (const r of rows) {
    const p = posOf(r);
    if (r.driverId) driver[r.driverId] = p;
    const cid = r.constructorId ?? (r.driverId ? driverToCtor[r.driverId] : undefined);
    if (cid) ctor[cid] = (ctor[cid] ?? 0) + p;
  }
  return { driver, constructor: ctor };
}

// Stable signature of the official results used for grading. Stored on each
// settled pick so an unchanged re-run is a no-op and a results correction
// (different signature) triggers a delta-based re-grade.
function sigOfResults(bySession: Partial<Record<SessionKey, SessionResults | null>>): string {
  const parts: string[] = [];
  for (const s of ['qualifying', 'race', 'sprint'] as SessionKey[]) {
    const r = bySession[s];
    if (!r) {
      parts.push(`${s}:none`);
      continue;
    }
    const d = Object.keys(r.driver).sort().map((k) => `${k}=${r.driver[k]}`).join(',');
    const c = Object.keys(r.constructor).sort().map((k) => `${k}=${r.constructor[k]}`).join(',');
    parts.push(`${s}:D[${d}]C[${c}]`);
  }
  const str = parts.join('|');
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

interface BenLine {
  entityId: string;
  entityKind: 'driver' | 'constructor';
  // New range-based prediction. Legacy single `line` kept as fallback so docs
  // written before the range migration still settle correctly.
  predictedLo?: number;
  predictedHi?: number;
  line?: number;
  withOdds: number;
  againstOdds: number;
  result?: number;
  outcome?: BenSide;
  // Ben's featured pick (race session). Betting AGAINST it is boosted
  // risk/reward — see BEST_BET_* constants.
  bestBet?: boolean;
}

// Best-bet mechanics: beat Ben on one of his 3 featured picks and the PROFIT
// portion of the payout is multiplied; side with him being right and you take
// a points penalty (session-weighted) on top of the normal stake loss.
const BEST_BET_PROFIT_MULT = 1.5;
const BEST_BET_LOSS_POINTS = -1;
// Flat cash reward for every correct call, staked or not — a free pick that
// wins pays this, and a staked win pays it on top of stake × odds. Applied
// after the best-bet profit multiplier (the bonus itself is never multiplied).
const WIN_BONUS = 10;
// The balancing sink: every wrong call costs this flat, on top of any stake
// forfeited. Counts fully in weekend/season P&L (leaderboards), but the
// garage debit is floored so spendable cash never goes below $0 — you can't
// owe what you don't have.
const LOSS_PENALTY = 10;

function lineLo(l: BenLine): number {
  if (typeof l.predictedLo === 'number') return l.predictedLo;
  if (typeof l.line === 'number') return Math.max(1, Math.round(l.line - 1));
  return 0;
}
function lineHi(l: BenLine): number {
  if (typeof l.predictedHi === 'number') return l.predictedHi;
  if (typeof l.line === 'number') return Math.round(l.line + 1);
  return 0;
}

interface BenSessionDoc {
  raceId: string;
  session: SessionKey;
  entities: Record<string, BenLine>;
  posted: boolean;
  settledAt?: admin.firestore.Timestamp;
}

interface Pick {
  side: BenSide;
  stake: number;
  // True once the stake's cash was escrowed (debited) at placement. Escrowed
  // picks credit only the gross payout at settlement; legacy (pre-escrow) picks
  // are still debited their stake here.
  escrowed?: boolean;
}

interface PicksDoc {
  userId: string;
  raceId: string;
  picks: Partial<Record<SessionKey, Record<string, Pick>>>;
  totalStaked: number;
  settled?: boolean;
  // Set at settlement; lets a results correction re-grade an already-settled
  // pick (different sig) while an unchanged re-run no-ops. The stored weekend
  // totals + outcomes are the baseline the re-grade computes deltas against.
  settleSig?: string;
  weekendPoints?: number;
  weekendCash?: number;
  // Garage cash actually credited/debited for this race at last settlement —
  // can differ from raw P&L because loss penalties are floored at $0 cash.
  // Corrections delta against this; docs settled before the field existed
  // fall back to reconstructing from settledOutcomes.
  garageApplied?: number;
  callsCorrect?: number;
  callsTotal?: number;
  settledOutcomes?: Partial<Record<SessionKey, Record<string, PickOutcome>>>;
}

interface PickOutcome {
  side: BenSide;
  stake: number;
  result: number;
  outcome: BenSide;
  won: boolean;
  payout: number;
  pointsCredit: number;
  // Flat cash penalty charged for a wrong call (LOSS_PENALTY at grading time).
  // Stored per-outcome so corrections re-grade against what was actually
  // assessed; absent on wins and on outcomes settled before the sink existed.
  penalty?: number;
  // True when this pick was graded against one of Ben's best bets (boosted
  // profit / points penalty applied for AGAINST picks). For UI badging.
  bestBet?: boolean;
}

// Per-pick payout calc. Odds are decimal; gross payout = stake × odds (incl.
// stake back) + WIN_BONUS flat on every correct call (so a zero-stake pick
// still pays WIN_BONUS when it wins). Loss = stake forfeited + LOSS_PENALTY
// flat (garage debit floored at $0 downstream). Range model: no pushes — the
// result either falls inside [lo, hi] (WITH wins) or outside (AGAINST wins).
//
// Best-bet twist: betting AGAINST one of Ben's featured picks boosts the
// profit portion ×1.5 on a win, and costs BEST_BET_LOSS_POINTS (instead of 0)
// on a loss. WITH bets on a best bet are unchanged.
function computePayout(
  pick: Pick,
  line: BenLine,
  outcome: BenSide,
): Omit<PickOutcome, 'side' | 'stake' | 'result' | 'outcome'> {
  const won = pick.side === outcome;
  const odds = pick.side === 'with' ? line.withOdds : line.againstOdds;
  const againstBestBet = line.bestBet === true && pick.side === 'against';
  let payout = 0;
  if (won) {
    const base = pick.stake * odds;
    const staked = againstBestBet
      ? pick.stake + (base - pick.stake) * BEST_BET_PROFIT_MULT
      : base;
    payout = Math.round((staked + WIN_BONUS) * 100) / 100;
  }
  const pointsCredit = won ? 1 : againstBestBet && pick.stake > 0 ? BEST_BET_LOSS_POINTS : 0;
  return { won, payout, pointsCredit, ...(won ? {} : { penalty: LOSS_PENALTY }) };
}

// Decide which side of Ben's predicted range the actual (official) result fell
// on. WITH = result ∈ [predictedLo, predictedHi] (Ben called it right);
// AGAINST = result outside the range (Ben was wrong).
function decideOutcome(line: BenLine, result: number): BenSide {
  const lo = lineLo(line);
  const hi = lineHi(line);
  return result >= lo && result <= hi ? 'with' : 'against';
}

interface SettleArgs {
  raceId: string;
  seasonId: string;
  round: number;
}

// Core settlement, callable both by the admin onCall wrapper (manual) and by
// tlOnRaceCompleted (auto-settle on race completion). Idempotent: picks already
// flagged `settled` are skipped, so a re-run / retry never double-credits.
// Throws if the race isn't completed with results, or if no posted lines exist
// to grade against (so a premature auto-fire can't settle picks against nothing).
export async function settleWeekendCore(
  raceId: string,
  seasonId: string,
  round: number
): Promise<{ processed: number; raceId: string; seasonId: string; round: number }> {
  const sessions: SessionKey[] = ['qualifying', 'race', 'sprint'];

  // 1. Load the OFFICIAL race results and refuse to settle unless the race is
  // completed with results present. These are the actuals every pick is graded
  // against (not a copy on ben_lines).
  const raceSnap = await db.doc(`races/${raceId}`).get();
  if (!raceSnap.exists) {
    throw new functions.https.HttpsError('not-found', `Race ${raceId} not found`);
  }
  const raceData = raceSnap.data() as { status?: string; results?: RaceResultsBundle };
  // Allow settling once the race is under way (in_progress) or done (completed).
  // in_progress covers sprint weekends: the sprint concludes and posts results
  // Saturday, well before the race completes Sunday. Only sessions whose results
  // are actually present get graded (see the per-session skip below), so a
  // sprint-only pass settles just the sprint; the completion pass settles the
  // rest and re-confirms the sprint (delta-based, no double-count).
  if (raceData.status !== 'completed' && raceData.status !== 'in_progress') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Race ${raceId} is not in progress or completed (status: ${raceData.status ?? 'unknown'})`
    );
  }
  // Driver → constructor map, so constructor position-sums resolve even for
  // sessions whose result rows omit constructorId (e.g. sprint).
  const constructorsSnap = await db.collection('constructors').get();
  const driverToCtor: Record<string, string> = {};
  constructorsSnap.forEach((c) => {
    for (const dId of ((c.data().drivers as string[] | undefined) ?? [])) driverToCtor[dId] = c.id;
  });

  const officialResults = raceData.results ?? {};
  const resultsBySession: Partial<Record<SessionKey, SessionResults | null>> = {};
  for (const s of sessions) {
    resultsBySession[s] = buildSessionResults(officialResults[SESSION_RESULTS_KEY[s]], driverToCtor);
  }
  if (!sessions.some((s) => resultsBySession[s])) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Race ${raceId} has no session results to settle against`
    );
  }
  const resultsSig = sigOfResults(resultsBySession);

  // 2. Pull Ben's three session line docs (predicted ranges + odds only). Sprint
  // may not exist.
  const sessionDocs: Partial<Record<SessionKey, BenSessionDoc>> = {};
  for (const s of sessions) {
    const snap = await db.doc(`ben_lines/${raceId}_${s}`).get();
    if (!snap.exists) continue;
    sessionDocs[s] = snap.data() as BenSessionDoc;
  }
  if (Object.keys(sessionDocs).length === 0) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Race ${raceId} has no posted ben_lines to settle picks against`
    );
  }

  // 3. Pull every player's picks for this race.
  const picksSnap = await db.collection('tl_picks').where('raceId', '==', raceId).get();

  // 2a. Bulk pre-fetch display names for all unsettled players in one shot
  // (chunked getAll) instead of a serial get inside the loop.
  const userIds = Array.from(
    new Set(
      picksSnap.docs
        .map((d) => d.data() as PicksDoc)
        // Unsettled picks AND already-settled picks whose results changed (a
        // correction needs re-grading) both need their owner's display name.
        .filter((p) => !p.settled || p.settleSig !== resultsSig)
        .map((p) => p.userId)
    )
  );
  const displayNameById: Record<string, string> = {};
  for (let i = 0; i < userIds.length; i += 300) {
    const refs = userIds.slice(i, i + 300).map((uid) => db.doc(`tl_users/${uid}`));
    if (refs.length === 0) continue;
    const snaps = await db.getAll(...refs);
    for (const s of snaps) {
      displayNameById[s.id] = (s.data()?.displayName as string | undefined) ?? 'Anonymous';
    }
  }

  // 2b. Garage balances for the same players, needed to floor loss-penalty
  // debits at $0 cash. Snapshot-read; a concurrent spend between this read and
  // the batch commit can still nudge cash slightly negative — rare and small,
  // and the next settlement's floor math self-corrects.
  const garageCashById: Record<string, number> = {};
  for (let i = 0; i < userIds.length; i += 300) {
    const refs = userIds.slice(i, i + 300).map((uid) => db.doc(`tl_garages/${uid}`));
    if (refs.length === 0) continue;
    const snaps = await db.getAll(...refs);
    for (const s of snaps) {
      const c = s.data()?.cash;
      garageCashById[s.id] = typeof c === 'number' && Number.isFinite(c) ? c : 0;
    }
  }

  // Chunked batch: Firestore caps a batch at 500 writes, and each player adds up
  // to 4 writes (pick + weekend score + season score + garage). We commit every
  // ~450 ops, ALWAYS at a player boundary, so a player's writes never straddle a
  // commit. If a chunk fails partway, already-settled players are skipped on a
  // re-run (the `settled` flag is set atomically with that player's increments),
  // so re-running never double-credits.
  let batch = db.batch();
  let opCount = 0;
  const flush = async () => {
    if (opCount === 0) return;
    await batch.commit();
    batch = db.batch();
    opCount = 0;
  };
  let processed = 0;

  for (const pickSnap of picksSnap.docs) {
    const pickDoc = pickSnap.data() as PicksDoc;
    // Skip only if already settled against THESE results; a correction (different
    // sig) falls through and re-grades by delta.
    if (pickDoc.settled && pickDoc.settleSig === resultsSig) continue;
    const isResettle = pickDoc.settled === true;

    let weekendPoints = 0;
    let weekendCash = 0; // net P&L for display/leaderboard (payout − stake)
    let garageDelta = 0; // actual cash to apply to the garage at settlement
    let callsCorrect = 0;
    let callsTotal = 0;
    const outcomesBySession: Partial<Record<SessionKey, Record<string, PickOutcome>>> = {};

    for (const session of sessions) {
      const sessionPicks = pickDoc.picks?.[session];
      const sessionDoc = sessionDocs[session];
      const sessionResults = resultsBySession[session];
      if (!sessionPicks || !sessionDoc || !sessionResults) continue;
      const weight = SESSION_WEIGHT[session];
      const sessionOutcomes: Record<string, PickOutcome> = {};

      for (const [entityId, rawPick] of Object.entries(sessionPicks)) {
        const line = sessionDoc.entities?.[entityId];
        if (!line) continue;
        // Normalise the stake: legacy picks (pre-0.1.21 escrow) could have a
        // `side` but no `stake` field — treat any missing/non-finite stake as 0
        // so the math never produces NaN.
        const stake = typeof rawPick.stake === 'number' && Number.isFinite(rawPick.stake) ? rawPick.stake : 0;
        const pick: Pick = { ...rawPick, stake };
        // Actual result comes from the OFFICIAL race doc, keyed by entity kind.
        const actualResult =
          line.entityKind === 'constructor'
            ? sessionResults.constructor[entityId]
            : sessionResults.driver[entityId];
        if (actualResult == null) continue; // entity not in the official results
        const decidedOutcome = decideOutcome(line, actualResult);
        const calc = computePayout(pick, line, decidedOutcome);
        const penalty = calc.penalty ?? 0;
        const outcome: PickOutcome = {
          side: pick.side,
          stake,
          result: actualResult,
          outcome: decidedOutcome,
          won: calc.won,
          payout: calc.payout,
          pointsCredit: calc.pointsCredit * weight,
          ...(penalty ? { penalty } : {}),
          ...(line.bestBet ? { bestBet: true } : {}),
        };
        sessionOutcomes[entityId] = outcome;
        weekendPoints += outcome.pointsCredit;
        // Net P&L is the same regardless of when the stake was taken. A wrong
        // call costs the flat penalty on top of any forfeited stake.
        weekendCash += calc.won ? calc.payout - stake : -stake - penalty;
        // Cash to actually move now: escrowed picks already had their stake
        // debited at placement, so credit gross payout on a win and charge only
        // the penalty on a loss. Legacy (pre-escrow) picks are still debited
        // their stake here.
        if (pick.escrowed) {
          garageDelta += calc.won ? calc.payout : -penalty;
        } else {
          garageDelta += calc.won ? calc.payout - stake : -stake - penalty;
        }
        if (calc.won) callsCorrect++;
        callsTotal++;
      }
      if (Object.keys(sessionOutcomes).length > 0) outcomesBySession[session] = sessionOutcomes;
    }

    // What this race previously moved in the garage (for a re-grade on
    // corrected results); zero for a first settlement. Prefer the stored
    // applied amount (exact, floor-aware); docs settled before garageApplied
    // existed rebuild it from the stored outcomes + per-entity escrowed flag,
    // matching the escrow/penalty-aware math used originally.
    let oldGarageDelta = 0;
    if (isResettle) {
      if (typeof pickDoc.garageApplied === 'number' && Number.isFinite(pickDoc.garageApplied)) {
        oldGarageDelta = pickDoc.garageApplied;
      } else if (pickDoc.settledOutcomes) {
        for (const [s, outs] of Object.entries(pickDoc.settledOutcomes)) {
          for (const [e, o] of Object.entries(outs)) {
            const escrowed = pickDoc.picks?.[s as SessionKey]?.[e]?.escrowed;
            const pen = o.won ? 0 : o.penalty ?? 0;
            oldGarageDelta += escrowed
              ? o.won ? o.payout : -pen
              : o.won ? o.payout - o.stake : -o.stake - pen;
          }
        }
      }
    }
    const oldPoints = isResettle ? pickDoc.weekendPoints ?? 0 : 0;
    const oldCash = isResettle ? pickDoc.weekendCash ?? 0 : 0;
    const oldCorrect = isResettle ? pickDoc.callsCorrect ?? 0 : 0;
    const oldTotal = isResettle ? pickDoc.callsTotal ?? 0 : 0;

    const userId = pickDoc.userId;
    const displayName = displayNameById[userId] ?? 'Anonymous';
    const roundCash = Math.round(weekendCash * 100) / 100;

    // Floor the garage movement so loss penalties never drive spendable cash
    // below $0 (P&L above stays un-floored — leaderboards count full losses).
    // The clamp applies to the whole diff, so a correction clawback is likewise
    // limited to cash on hand.
    const rawDiff = Math.round((garageDelta - oldGarageDelta) * 100) / 100;
    const cashNow = garageCashById[userId] ?? 0;
    const cashDelta = Math.max(rawDiff, -Math.max(0, Math.round(cashNow * 100) / 100));
    const garageApplied = Math.round((oldGarageDelta + cashDelta) * 100) / 100;

    // Pick doc — overwrite outcomes + stamp the results signature used so an
    // unchanged re-run no-ops and a correction re-grades.
    batch.update(pickSnap.ref, {
      settled: true,
      settledAt: admin.firestore.FieldValue.serverTimestamp(),
      settleSig: resultsSig,
      weekendPoints,
      weekendCash: roundCash,
      garageApplied,
      callsCorrect,
      callsTotal,
      settledOutcomes: outcomesBySession,
    });
    opCount++;

    // Weekend score — absolute set, so overwriting with the new values is
    // correct on a re-grade (no delta needed).
    batch.set(
      db.doc(`tl_weekend_scores/${userId}_${raceId}`),
      {
        userId,
        displayName,
        raceId,
        seasonId,
        round,
        points: weekendPoints,
        cash: roundCash,
        callsCorrect,
        callsTotal,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    opCount++;

    // Season totals — apply DELTAS vs this race's previous contribution, and
    // count the weekend only the first time.
    batch.set(
      db.doc(`tl_season_scores/${userId}_${seasonId}`),
      {
        userId,
        displayName,
        seasonId,
        totalPoints: admin.firestore.FieldValue.increment(weekendPoints - oldPoints),
        totalCash: admin.firestore.FieldValue.increment(roundCash - oldCash),
        callsCorrect: admin.firestore.FieldValue.increment(callsCorrect - oldCorrect),
        callsTotal: admin.firestore.FieldValue.increment(callsTotal - oldTotal),
        weekendsScored: admin.firestore.FieldValue.increment(isResettle ? 0 : 1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    opCount++;

    // Garage cash — apply the floored DELTA vs what was previously credited
    // for this race (claws back / tops up when a correction flips outcomes).
    if (cashDelta !== 0) {
      batch.update(db.doc(`tl_garages/${userId}`), {
        cash: admin.firestore.FieldValue.increment(cashDelta),
        totalCashEarned: admin.firestore.FieldValue.increment(Math.max(0, cashDelta)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      opCount++;
    }

    processed++;
    // Flush at the player boundary so a player's writes never split across a
    // commit, keeping each player's settlement atomic.
    if (opCount >= 450) await flush();
  }

  await flush();
  return { processed, raceId, seasonId, round };
}

// Admin-only manual trigger. Delegates to settleWeekendCore.
export const tlSettleWeekend = functions.https.onCall(async (data: SettleArgs, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  const { raceId, seasonId, round } = data;
  if (!raceId || !seasonId || typeof round !== 'number') {
    throw new functions.https.HttpsError('invalid-argument', 'raceId, seasonId, round required');
  }
  return settleWeekendCore(raceId, seasonId, round);
});
