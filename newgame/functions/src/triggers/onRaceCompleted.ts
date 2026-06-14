import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import {
  scoreQualifyingForDriver,
  scoreRaceForDriver,
  scoreConstructor,
  buildRaceContext,
  RaceResultsBundle,
} from '../scoring/scoreLineup';
import { pointsToCash, streakBonus, interestOnHeld } from '../economy/payouts';
import { settleWeekendCore } from './settleWeekend';

const db = admin.firestore();

interface LineupSlot {
  startedDriverIds: string[];
  startedConstructorId: string | null;
}
interface LineupDoc {
  userId: string;
  raceId: string;
  qualifying: LineupSlot;
  race: LineupSlot;
}

interface GarageDoc {
  cash: number;
  totalCashEarned: number;
  totalPoints: number;
  raceWinStreak: number;
  raceLossStreak: number;
  lastStreakRaceId?: string;
}

interface ScoreDoc {
  totalPoints?: number;
  cashPayout?: number; // base payout that was credited
  streakBonus?: number;
  interest?: number;
  resultsSig?: string;
}

// Stable signature of the scoring-relevant fields of a results bundle. Used to
// detect *corrected* results and to make re-runs no-ops when nothing changed.
function hashResults(results: RaceResultsBundle): string {
  const row = (r: Record<string, unknown>) =>
    `${(r.driverId as string) ?? (r.constructorId as string) ?? ''}:${r.position ?? ''}:${r.status ?? ''}:${r.gridPosition ?? ''}:${r.fastestLap ?? ''}`;
  const join = (rows?: Array<Record<string, unknown>>) => (rows ?? []).map(row).join('|');
  const s =
    `Q[${join(results.qualifyingResults as unknown as Array<Record<string, unknown>>)}]` +
    `R[${join(results.raceResults as unknown as Array<Record<string, unknown>>)}]` +
    `S[${join(results.sprintResults as unknown as Array<Record<string, unknown>>)}]`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

// SCORING + CORRECTIONS + IDEMPOTENCY
// -----------------------------------
// Firestore background triggers are *at-least-once* and a race doc can be
// re-written after completion (F1 post-race penalties / DSQs change finishing
// positions). This handler therefore:
//   1. Fires on the status→completed transition AND on any later results change
//      to an already-completed race (ignoring unrelated edits via a results
//      signature).
//   2. Applies every credit as a DELTA against what was previously applied for
//      this race (stored alongside a resultsSig), so a re-run with identical
//      results is a no-op and a genuine correction adjusts balances to truth.
// Re-graded on correction: lineup points, base cash payout, league standings,
// and bet outcomes/payouts (incl. clawbacks). Preserved at first-scoring value:
// `interest` (results-independent) and `streakBonus` (re-grading would have to
// cascade to later races — see note below).
export const tlOnRaceCompleted = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .region('us-central1')
  .firestore.document('races/{raceId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (after.status !== 'completed') return;

    const raceId = context.params.raceId as string;
    const results: RaceResultsBundle = after.results ?? {};
    const resultsSig = hashResults(results);

    // Skip unrelated edits to an already-completed race (status unchanged AND
    // the scoring-relevant results are identical). A fresh completion or a real
    // results correction proceeds.
    const wasCompleted = before.status === 'completed';
    if (wasCompleted && hashResults(before.results ?? {}) === resultsSig) return;

    // Find every TL lineup for this race and score it. IMPORTANT: a race can
    // have player picks and side-bets even when nobody set a fantasy lineup, so
    // we must NOT bail here — that would skip league standings, bet settlement,
    // and pick auto-settlement entirely. The scoring loop below naturally no-ops
    // on an empty lineup set; everything after it still runs.
    const lineupSnap = await db.collection('tl_lineups').where('raceId', '==', raceId).get();
    if (lineupSnap.empty) {
      console.log(`[tl] No lineups for race ${raceId} — settling picks/bets only`);
    }

    // Pre-fetch constructor → driver mapping so constructor scoring is cheap.
    const constructorsSnap = await db.collection('constructors').get();
    const constructorDrivers: Record<string, string[]> = {};
    constructorsSnap.forEach((d) => {
      const data = d.data();
      constructorDrivers[d.id] = (data.drivers as string[] | undefined) ?? [];
    });

    // Pre-fetch driver tier map so positions-gained scaling and the long-shot
    // pole bonus can resolve without per-driver fetches.
    const driversSnap = await db.collection('drivers').get();
    const driverTiers: Record<string, 'A' | 'B' | 'C'> = {};
    driversSnap.forEach((d) => {
      const tier = d.data().tier;
      if (tier === 'A' || tier === 'B' || tier === 'C') driverTiers[d.id] = tier;
    });
    const raceCtx = buildRaceContext(results, driverTiers);

    const userScoresThisRace: Map<string, number> = new Map();

    for (const lineupDoc of lineupSnap.docs) {
      const lineup = lineupDoc.data() as LineupDoc;
      const userId = lineup.userId;

      const qualifyingPoints = lineup.qualifying.startedDriverIds
        .map((id) => scoreQualifyingForDriver(id, results).points)
        .reduce((a, b) => a + b, 0);

      // Per-driver race scoring + insurance backup substitution. Insurance is a
      // read-only lookup here (premiums were charged at purchase time); it only
      // affects how a DNF'd driver scores.
      const insuranceDoc = await db.doc(`tl_insurance/${userId}_${raceId}`).get();
      const insurancePolicies =
        (insuranceDoc.data()?.policies as
          | Record<string, { backupDriverId: string | null; premium: number; active: true }>
          | undefined) ?? {};

      let racePointsFromDrivers = 0;
      for (const driverId of lineup.race.startedDriverIds) {
        const baseScore = scoreRaceForDriver(driverId, results, raceCtx);
        const raceResult = results.raceResults?.find((r) => r.driverId === driverId);
        const dnf = raceResult?.status === 'dnf' || raceResult?.status === 'dsq';
        const policy = insurancePolicies[driverId];
        if (dnf && policy && policy.backupDriverId) {
          const backupScore = scoreRaceForDriver(policy.backupDriverId, results, raceCtx);
          const backupHalf = Math.round(backupScore.points * 0.5);
          racePointsFromDrivers += Math.max(baseScore.points, backupHalf);
        } else {
          racePointsFromDrivers += baseScore.points;
        }
      }

      let constructorPoints = 0;
      if (lineup.race.startedConstructorId) {
        const cId = lineup.race.startedConstructorId;
        constructorPoints = scoreConstructor(cId, constructorDrivers[cId] ?? [], results, raceCtx).points;
      }

      const totalPoints = qualifyingPoints + racePointsFromDrivers + constructorPoints;
      userScoresThisRace.set(userId, totalPoints);

      const scoreRef = db.doc(`tl_scores/${userId}_${raceId}`);
      const garageRef = db.doc(`tl_garages/${userId}`);

      // Delta-based + idempotent. First scoring credits the full amount and sets
      // the streak; a correction re-grades points + base payout and applies only
      // the difference, preserving the originally-credited interest and streak.
      await db.runTransaction(async (tx) => {
        const scoreSnap = await tx.get(scoreRef);
        const prev = scoreSnap.exists ? (scoreSnap.data() as ScoreDoc) : null;
        if (prev && prev.resultsSig === resultsSig) return; // already applied these results
        const isFirst = !prev;

        const garageSnap = await tx.get(garageRef);
        const garage = (garageSnap.data() as GarageDoc | undefined) ?? {
          cash: 0,
          totalCashEarned: 0,
          totalPoints: 0,
          raceWinStreak: 0,
          raceLossStreak: 0,
        };

        const basePayout = pointsToCash(totalPoints);

        // Interest + streak are path-dependent; compute on FIRST scoring only and
        // preserve on corrections. (Re-grading streak would have to cascade to
        // races scored after this one, which we don't attempt.)
        let interest: number;
        let streak: number;
        let streakFields: Record<string, unknown> = {};
        if (isFirst) {
          interest = interestOnHeld(garage.cash);
          let nextWinStreak = garage.raceWinStreak;
          let nextLossStreak = garage.raceLossStreak;
          if (totalPoints >= 60) {
            nextWinStreak = garage.lastStreakRaceId === raceId ? nextWinStreak : nextWinStreak + 1;
            nextLossStreak = 0;
          } else if (totalPoints <= 30) {
            nextLossStreak = garage.lastStreakRaceId === raceId ? nextLossStreak : nextLossStreak + 1;
            nextWinStreak = 0;
          } else {
            nextWinStreak = 0;
            nextLossStreak = 0;
          }
          streak = streakBonus(nextWinStreak);
          streakFields = {
            raceWinStreak: nextWinStreak,
            raceLossStreak: nextLossStreak,
            lastStreakRaceId: raceId,
          };
        } else {
          interest = prev!.interest ?? 0;
          streak = prev!.streakBonus ?? 0;
        }

        const newCashCredited = basePayout + streak + interest;
        const oldCashCredited = isFirst
          ? 0
          : (prev!.cashPayout ?? 0) + (prev!.streakBonus ?? 0) + (prev!.interest ?? 0);
        const cashDelta = newCashCredited - oldCashCredited;
        const pointsDelta = totalPoints - (isFirst ? 0 : prev!.totalPoints ?? 0);

        tx.set(scoreRef, {
          userId,
          raceId,
          qualifyingPoints,
          racePoints: racePointsFromDrivers + constructorPoints,
          totalPoints,
          cashPayout: basePayout,
          streakBonus: streak,
          interest,
          resultsSig,
          computedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(
          garageRef,
          {
            cash: admin.firestore.FieldValue.increment(cashDelta),
            totalCashEarned: admin.firestore.FieldValue.increment(cashDelta),
            totalPoints: admin.firestore.FieldValue.increment(pointsDelta),
            ...streakFields,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
    }

    // Update league member totals + per-race winner ledger payouts (delta-based).
    await updateLeagueStandingsAndPayouts(raceId, resultsSig, userScoresThisRace);

    // Settle / re-settle pole + league bets across users (delta-based).
    await settleBets(raceId, resultsSig, results, userScoresThisRace);

    // Auto-settle the bet-against-the-book picks for this race. Idempotent and
    // correction-aware: settlement keys on a results signature, so an unchanged
    // re-run no-ops and a corrected-results re-fire re-grades picks by delta
    // (clawing back / topping up). Wrapped so a settlement issue (e.g. lines not
    // posted yet) can't undo the lineup scoring already committed above — it can
    // always be re-run via the admin tlSettleWeekend callable.
    const seasonId = after.seasonId as string | undefined;
    const round = after.round as number | undefined;
    if (seasonId && typeof round === 'number') {
      try {
        const r = await settleWeekendCore(raceId, seasonId, round);
        console.log(`[tl] Auto-settled ${r.processed} pick docs for race ${raceId}`);
      } catch (err) {
        console.warn(
          `[tl] Auto-settle skipped/failed for race ${raceId}:`,
          err instanceof Error ? err.message : err
        );
      }
    } else {
      console.warn(`[tl] Auto-settle skipped: race ${raceId} missing seasonId/round`);
    }

    console.log(`[tl] Scored ${lineupSnap.size} lineups for race ${raceId} (sig ${resultsSig})`);
  });

interface BetSettleState {
  won: boolean;
  payout: number;
  settledAt: unknown;
}
interface PoleBet {
  driverId: string;
  stake: number;
  odds: number;
  settled?: BetSettleState;
}
interface LeagueBet {
  targetUserId: string;
  leagueId: string;
  stake: number;
  odds: number;
  settled?: BetSettleState;
}
interface BetsDoc {
  userId: string;
  raceId: string;
  poleBet?: PoleBet;
  leagueBet?: LeagueBet;
  settleSig?: string;
}

async function settleBets(
  raceId: string,
  resultsSig: string,
  results: RaceResultsBundle,
  userScoresThisRace: Map<string, number>
): Promise<void> {
  const poleDriverId = results.qualifyingResults?.find((q) => q.position === 1)?.driverId;

  // Weekend top scorer per league (read-only; from this race's lineup scores).
  const leaguesSnap = await db.collection('tl_leagues').get();
  const topScorerByLeague: Map<string, string> = new Map();
  for (const leagueDoc of leaguesSnap.docs) {
    const leagueId = leagueDoc.id;
    const membersSnap = await db.collection(`tl_leagues/${leagueId}/members`).get();
    let topUserId: string | null = null;
    let topScore = -Infinity;
    membersSnap.forEach((m) => {
      const uid = m.data().userId as string;
      const score = userScoresThisRace.get(uid) ?? 0;
      if (score > topScore) {
        topScore = score;
        topUserId = uid;
      }
    });
    // Only crown a top scorer when someone actually scored above zero, so a race
    // where nobody set a lineup (or all scored 0) can't hand a league bet a win.
    if (topUserId && topScore > 0) topScorerByLeague.set(leagueId, topUserId);
  }

  // Settle each bets doc in its own transaction, applying the payout DELTA vs
  // whatever was previously paid. Keyed on a settleSig so a no-op re-run doesn't
  // re-log; a correction that flips an outcome claws back / tops up the delta.
  const betsSnap = await db.collection('tl_bets').where('raceId', '==', raceId).get();
  for (const betDocSnap of betsSnap.docs) {
    const betRef = betDocSnap.ref;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(betRef);
      if (!snap.exists) return;
      const data = snap.data() as BetsDoc;
      if (data.settleSig === resultsSig) return; // already settled for these results

      const updates: Record<string, unknown> = { settleSig: resultsSig };
      let creditDelta = 0;

      if (data.poleBet && poleDriverId) {
        const won = data.poleBet.driverId === poleDriverId;
        const payout = won ? Math.round(data.poleBet.stake * data.poleBet.odds) : 0;
        const oldPayout = data.poleBet.settled?.payout ?? 0;
        creditDelta += payout - oldPayout;
        updates['poleBet.settled'] = {
          won,
          payout,
          settledAt: admin.firestore.FieldValue.serverTimestamp(),
        };
      }

      if (data.leagueBet) {
        const top = topScorerByLeague.get(data.leagueBet.leagueId);
        const won = top === data.leagueBet.targetUserId;
        const payout = won ? Math.round(data.leagueBet.stake * data.leagueBet.odds) : 0;
        const oldPayout = data.leagueBet.settled?.payout ?? 0;
        creditDelta += payout - oldPayout;
        updates['leagueBet.settled'] = {
          won,
          payout,
          settledAt: admin.firestore.FieldValue.serverTimestamp(),
        };
      }

      // Read the garage inside the transaction so the logged cashAfter is real.
      const garageRef = db.doc(`tl_garages/${data.userId}`);
      let cashAfter: number | null = null;
      if (creditDelta !== 0) {
        const gSnap = await tx.get(garageRef);
        cashAfter = ((gSnap.data()?.cash as number | undefined) ?? 0) + creditDelta;
      }

      tx.update(betRef, updates as admin.firestore.UpdateData<admin.firestore.DocumentData>);
      if (creditDelta !== 0) {
        tx.set(
          garageRef,
          {
            cash: admin.firestore.FieldValue.increment(creditDelta),
            totalCashEarned: admin.firestore.FieldValue.increment(creditDelta),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        const txLogRef = db.collection(`tl_garages/${data.userId}/transactions`).doc();
        tx.set(txLogRef, {
          userId: data.userId,
          type: creditDelta >= 0 ? 'bet_payout' : 'bet_refund',
          delta: creditDelta,
          cashAfter,
          description:
            creditDelta >= 0
              ? `Bet payout · race ${raceId}`
              : `Bet correction (results revised) · race ${raceId}`,
          raceId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });
  }
}

interface StandingsAppliedDoc {
  scores?: Record<string, number>;
  winnerId?: string | null;
  resultsSig?: string;
}

async function updateLeagueStandingsAndPayouts(
  raceId: string,
  resultsSig: string,
  userScores: Map<string, number>
): Promise<void> {
  // Per league: bump each member's totalPoints by their score and credit the
  // round winner (per_race/hybrid ledger). Delta-based + concurrency-safe: a
  // transaction reads a per-race "standingsApplied" doc holding the scores and
  // winner previously applied; member point bumps and raceWins are adjusted by
  // the difference, and the ledger payout uses a deterministic doc id. A no-op
  // re-run (same resultsSig) does nothing; a correction reconciles to truth,
  // including reassigning the round winner if it changed.
  const leaguesSnap = await db.collection('tl_leagues').get();

  for (const leagueDoc of leaguesSnap.docs) {
    const league = leagueDoc.data();
    const leagueId = leagueDoc.id;

    const membersSnap = await db.collection(`tl_leagues/${leagueId}/members`).get();
    if (membersSnap.empty) continue;

    // New scores + round winner from this race's lineup scores.
    const newScores: Record<string, number> = {};
    const memberRefById: Record<string, admin.firestore.DocumentReference> = {};
    let newWinnerId: string | null = null;
    let topScore = -Infinity;
    for (const memberDoc of membersSnap.docs) {
      const uid = memberDoc.data().userId as string;
      const score = userScores.get(uid) ?? 0;
      newScores[uid] = score;
      memberRefById[uid] = memberDoc.ref;
      if (score > topScore) {
        topScore = score;
        newWinnerId = uid;
      }
    }

    const payoutEligible =
      league.ledger?.enabled &&
      newWinnerId &&
      topScore > 0 &&
      (league.ledger.payoutTemplate === 'per_race' || league.ledger.payoutTemplate === 'hybrid');
    const payoutAmount = payoutEligible
      ? league.ledger.perRacePayoutAmount ??
        Math.round((league.ledger.buyInAmount * (league.memberCount ?? 1)) / 24)
      : 0;
    const effectiveWinnerId = payoutEligible && payoutAmount > 0 ? newWinnerId : null;

    const standRef = db.doc(`tl_leagues/${leagueId}/standingsApplied/${raceId}`);

    await db.runTransaction(async (tx) => {
      const sSnap = await tx.get(standRef);
      const prev = sSnap.exists ? (sSnap.data() as StandingsAppliedDoc) : null;
      if (prev && prev.resultsSig === resultsSig) return; // already applied these results
      const appliedScores = prev?.scores ?? {};
      const appliedWinner = prev?.winnerId ?? null;

      // Build one update per member doc (point delta + optional raceWins delta).
      const memberUpdates = new Map<string, Record<string, unknown>>();
      const addUpdate = (uid: string, field: string, value: admin.firestore.FieldValue) => {
        const ref = memberRefById[uid];
        if (!ref) return; // member no longer present
        const existing = memberUpdates.get(uid) ?? {};
        existing[field] = value;
        memberUpdates.set(uid, existing);
      };

      // Point deltas for every member who scored differently than last applied.
      const allUids = new Set([...Object.keys(newScores), ...Object.keys(appliedScores)]);
      for (const uid of allUids) {
        const delta = (newScores[uid] ?? 0) - (appliedScores[uid] ?? 0);
        if (delta !== 0) addUpdate(uid, 'totalPoints', admin.firestore.FieldValue.increment(delta));
      }

      // raceWins reassignment if the round winner changed.
      if (appliedWinner !== effectiveWinnerId) {
        if (appliedWinner) addUpdate(appliedWinner, 'raceWins', admin.firestore.FieldValue.increment(-1));
        if (effectiveWinnerId) addUpdate(effectiveWinnerId, 'raceWins', admin.firestore.FieldValue.increment(1));
      }

      for (const [uid, data] of memberUpdates) {
        tx.update(memberRefById[uid], data as admin.firestore.UpdateData<admin.firestore.DocumentData>);
      }

      // Deterministic ledger payout entry (reassigned to the current winner).
      if (effectiveWinnerId && payoutAmount > 0) {
        tx.set(
          db.doc(`tl_leagues/${leagueId}/ledger/${raceId}__race_payout`),
          {
            leagueId,
            userId: effectiveWinnerId,
            type: 'race_payout',
            amount: payoutAmount,
            raceId,
            description: 'Per-race payout — round winner',
            status: 'pending',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      tx.set(standRef, {
        leagueId,
        raceId,
        scores: newScores,
        winnerId: effectiveWinnerId,
        resultsSig,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  }
}
