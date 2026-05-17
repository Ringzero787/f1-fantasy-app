// tlSettleWeekend — Cloud Function that grades all player picks for a race
// against Ben's posted lines, writes per-pick outcomes, weekend scores, and
// updates the season totals.
//
// IMPORTANT: the payout formula (computePayout) is a stub pending Ben's odds
// spec. The shape and bookkeeping are in place; only the per-pick maths needs
// to be filled in once Ben confirms decimal vs American, push rules, vig, etc.
//
// Trigger: HTTPS callable for now (manual run from admin/dev). Will move to a
// Firestore trigger on ben_lines settlement once Ben's pipeline writes the
// `result`/`outcome` fields on each line.

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

type SessionKey = 'qualifying' | 'race' | 'sprint';
type BenSide = 'with' | 'against';
const SESSION_WEIGHT: Record<SessionKey, number> = { race: 1, qualifying: 0.5, sprint: 0.25 };

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
}

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
}

interface PicksDoc {
  userId: string;
  raceId: string;
  picks: Partial<Record<SessionKey, Record<string, Pick>>>;
  totalStaked: number;
  settled?: boolean;
}

interface PickOutcome {
  side: BenSide;
  stake: number;
  result: number;
  outcome: BenSide;
  won: boolean;
  payout: number;
  pointsCredit: number;
}

// Per-pick payout calc. Odds are decimal; gross payout = stake × odds (incl.
// stake back). Loss = forfeit. Range model: no pushes — the result either
// falls inside [lo, hi] (WITH wins) or outside (AGAINST wins).
function computePayout(pick: Pick, line: BenLine): Omit<PickOutcome, 'side' | 'stake' | 'result' | 'outcome'> {
  if (line.result == null || line.outcome == null) {
    return { won: false, payout: 0, pointsCredit: 0 };
  }
  const won = pick.side === line.outcome;
  const odds = pick.side === 'with' ? line.withOdds : line.againstOdds;
  const payout = won ? Math.round(pick.stake * odds * 100) / 100 : 0;
  const pointsCredit = won ? 1 : 0;
  return { won, payout, pointsCredit };
}

// Decide which side of Ben's predicted range the actual result fell on.
//   WITH    = result ∈ [predictedLo, predictedHi]  (Ben called it right)
//   AGAINST = result outside the range             (Ben was wrong)
function decideOutcome(line: BenLine): BenSide | null {
  if (line.result == null) return null;
  const lo = lineLo(line);
  const hi = lineHi(line);
  return line.result >= lo && line.result <= hi ? 'with' : 'against';
}

const DNF_POSITION_PLACEHOLDER = 22;

interface SettleArgs {
  raceId: string;
  seasonId: string;
  round: number;
}

export const tlSettleWeekend = functions.https.onCall(async (data: SettleArgs, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  const { raceId, seasonId, round } = data;
  if (!raceId || !seasonId || typeof round !== 'number') {
    throw new functions.https.HttpsError('invalid-argument', 'raceId, seasonId, round required');
  }

  // 1. Pull Ben's three session line docs. Sprint may not exist.
  const sessions: SessionKey[] = ['qualifying', 'race', 'sprint'];
  const sessionDocs: Partial<Record<SessionKey, BenSessionDoc>> = {};
  for (const s of sessions) {
    const snap = await db.doc(`ben_lines/${raceId}_${s}`).get();
    if (!snap.exists) continue;
    const doc = snap.data() as BenSessionDoc;
    // Ensure outcomes are populated; fall back to decideOutcome if Ben didn't.
    // (Also: void warning on the constant import.)
    void DNF_POSITION_PLACEHOLDER;
    for (const entityId of Object.keys(doc.entities || {})) {
      const line = doc.entities[entityId];
      if (line.result != null && line.outcome == null) {
        const decided = decideOutcome(line);
        if (decided) line.outcome = decided as BenSide;
      }
    }
    sessionDocs[s] = doc;
  }

  // 2. Pull every player's picks for this race.
  const picksSnap = await db.collection('tl_picks').where('raceId', '==', raceId).get();

  const batch = db.batch();
  let processed = 0;

  for (const pickSnap of picksSnap.docs) {
    const pickDoc = pickSnap.data() as PicksDoc;
    if (pickDoc.settled) continue;

    let weekendPoints = 0;
    let weekendCash = 0;
    let callsCorrect = 0;
    let callsTotal = 0;
    const outcomesBySession: Partial<Record<SessionKey, Record<string, PickOutcome>>> = {};

    for (const session of sessions) {
      const sessionPicks = pickDoc.picks?.[session];
      const sessionDoc = sessionDocs[session];
      if (!sessionPicks || !sessionDoc) continue;
      const weight = SESSION_WEIGHT[session];
      const sessionOutcomes: Record<string, PickOutcome> = {};

      for (const [entityId, pick] of Object.entries(sessionPicks)) {
        const line = sessionDoc.entities?.[entityId];
        if (!line || line.result == null || line.outcome == null) continue;
        const calc = computePayout(pick, line);
        const pickedOdds = pick.side === 'with' ? line.withOdds : line.againstOdds;
        const outcome: PickOutcome = {
          side: pick.side,
          stake: pick.stake,
          result: line.result,
          outcome: line.outcome,
          won: calc.won,
          payout: calc.payout,
          pointsCredit: calc.pointsCredit * weight,
        };
        sessionOutcomes[entityId] = outcome;
        weekendPoints += outcome.pointsCredit;
        weekendCash += calc.won ? calc.payout - pick.stake : -pick.stake;
        if (calc.won) callsCorrect++;
        callsTotal++;
        void pickedOdds;
      }
      if (Object.keys(sessionOutcomes).length > 0) outcomesBySession[session] = sessionOutcomes;
    }

    // Write the settled picks doc.
    batch.update(pickSnap.ref, {
      settled: true,
      settledAt: admin.firestore.FieldValue.serverTimestamp(),
      weekendPoints,
      weekendCash: Math.round(weekendCash * 100) / 100,
      callsCorrect,
      callsTotal,
      settledOutcomes: outcomesBySession,
    });

    // Write the weekend score (for the leaderboard).
    const userId = pickDoc.userId;
    const userSnap = await db.doc(`tl_users/${userId}`).get();
    const displayName = (userSnap.data()?.displayName as string | undefined) ?? 'Anonymous';

    batch.set(db.doc(`tl_weekend_scores/${userId}_${raceId}`), {
      userId,
      displayName,
      raceId,
      seasonId,
      round,
      points: weekendPoints,
      cash: Math.round(weekendCash * 100) / 100,
      callsCorrect,
      callsTotal,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Bump the running season totals.
    batch.set(
      db.doc(`tl_season_scores/${userId}_${seasonId}`),
      {
        userId,
        displayName,
        seasonId,
        totalPoints: admin.firestore.FieldValue.increment(weekendPoints),
        totalCash: admin.firestore.FieldValue.increment(Math.round(weekendCash * 100) / 100),
        callsCorrect: admin.firestore.FieldValue.increment(callsCorrect),
        callsTotal: admin.firestore.FieldValue.increment(callsTotal),
        weekendsScored: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Apply the weekend cash to the garage so the bankroll reflects it.
    if (weekendCash !== 0) {
      batch.update(db.doc(`tl_garages/${userId}`), {
        cash: admin.firestore.FieldValue.increment(Math.round(weekendCash * 100) / 100),
        totalCashEarned: admin.firestore.FieldValue.increment(Math.max(0, weekendCash)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    processed++;
  }

  await batch.commit();
  return { processed, raceId, seasonId, round };
});
