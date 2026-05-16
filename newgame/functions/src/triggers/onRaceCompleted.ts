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

// Triggered when a race document is updated to status='completed'.
// Reuses the race results that Undercut's checkResults function writes into races/{raceId}.
export const tlOnRaceCompleted = functions
  .region('us-central1')
  .firestore.document('races/{raceId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === after.status) return;
    if (after.status !== 'completed') return;

    const raceId = context.params.raceId as string;
    const results: RaceResultsBundle = after.results ?? {};

    // Find every TL lineup for this race and score it.
    const lineupSnap = await db.collection('tl_lineups').where('raceId', '==', raceId).get();
    if (lineupSnap.empty) {
      console.log(`[tl] No lineups for race ${raceId}`);
      return;
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

    // Compute median league cash earned to update streaks per league.
    // For now, streak is computed per-user against their own previous race score (simple monotonic check).
    const batch = db.batch();
    let opCount = 0;
    const flushBatch = async () => {
      if (opCount === 0) return;
      await batch.commit();
      opCount = 0;
    };

    const userScoresThisRace: Map<string, number> = new Map();

    for (const lineupDoc of lineupSnap.docs) {
      const lineup = lineupDoc.data() as LineupDoc;
      const userId = lineup.userId;

      const qualifyingPoints = lineup.qualifying.startedDriverIds
        .map((id) => scoreQualifyingForDriver(id, results).points)
        .reduce((a, b) => a + b, 0);

      // Per-driver race scoring + insurance backup substitution
      const insuranceDoc = await db.doc(`tl_insurance/${userId}_${raceId}`).get();
      const insurancePolicies =
        (insuranceDoc.data()?.policies as
          | Record<string, { backupDriverId: string | null; premium: number; active: true }>
          | undefined) ?? {};

      let racePointsFromDrivers = 0;
      let insuranceTriggered = 0; // count of policies that fired
      for (const driverId of lineup.race.startedDriverIds) {
        const baseScore = scoreRaceForDriver(driverId, results, raceCtx);
        const raceResult = results.raceResults?.find((r) => r.driverId === driverId);
        const dnf = raceResult?.status === 'dnf' || raceResult?.status === 'dsq';
        const policy = insurancePolicies[driverId];
        if (dnf && policy && policy.backupDriverId) {
          // Backup scores at 50%
          const backupScore = scoreRaceForDriver(policy.backupDriverId, results, raceCtx);
          const backupHalf = Math.round(backupScore.points * 0.5);
          // Use the better of (DNF -5) or backup-half (still not below floor 0)
          const replaced = Math.max(baseScore.points, backupHalf);
          racePointsFromDrivers += replaced;
          insuranceTriggered++;
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

      // Compute cash payout + streak bonus + interest.
      const garageRef = db.doc(`tl_garages/${userId}`);
      const garageSnap = await garageRef.get();
      const garage = (garageSnap.data() as GarageDoc | undefined) ?? {
        cash: 0,
        totalCashEarned: 0,
        totalPoints: 0,
        raceWinStreak: 0,
        raceLossStreak: 0,
      };

      const interest = interestOnHeld(garage.cash);
      const basePayout = pointsToCash(totalPoints);
      // Streak determination — simple version: scoring above 60 pts continues a win streak,
      // below 30 a loss streak, otherwise neutral. League-median based logic comes later.
      let nextWinStreak = garage.raceWinStreak;
      let nextLossStreak = garage.raceLossStreak;
      if (totalPoints >= 60) {
        nextWinStreak = (garage.lastStreakRaceId === raceId ? nextWinStreak : nextWinStreak + 1);
        nextLossStreak = 0;
      } else if (totalPoints <= 30) {
        nextLossStreak = (garage.lastStreakRaceId === raceId ? nextLossStreak : nextLossStreak + 1);
        nextWinStreak = 0;
      } else {
        nextWinStreak = 0;
        nextLossStreak = 0;
      }
      const streak = streakBonus(nextWinStreak);
      const cashDelta = basePayout + streak + interest;

      // Write the score breakdown doc.
      const scoreRef = db.doc(`tl_scores/${userId}_${raceId}`);
      batch.set(scoreRef, {
        userId,
        raceId,
        qualifyingPoints,
        racePoints: racePointsFromDrivers + constructorPoints,
        totalPoints,
        cashPayout: basePayout,
        streakBonus: streak,
        interest,
        computedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      opCount++;

      batch.update(garageRef, {
        cash: admin.firestore.FieldValue.increment(cashDelta),
        totalCashEarned: admin.firestore.FieldValue.increment(cashDelta),
        totalPoints: admin.firestore.FieldValue.increment(totalPoints),
        raceWinStreak: nextWinStreak,
        raceLossStreak: nextLossStreak,
        lastStreakRaceId: raceId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      opCount++;

      if (opCount > 450) await flushBatch();
    }

    await flushBatch();

    // Update league member totals + per-race winner ledger payouts.
    await updateLeagueStandingsAndPayouts(raceId, userScoresThisRace);

    // Settle pole + league bets across users.
    await settleBets(raceId, results, userScoresThisRace);

    console.log(`[tl] Scored ${lineupSnap.size} lineups for race ${raceId}`);
  });

interface BetsDoc {
  userId: string;
  raceId: string;
  poleBet?: {
    driverId: string;
    driverName: string;
    stake: number;
    odds: number;
    settled?: { won: boolean; payout: number; settledAt: unknown };
  };
  leagueBet?: {
    targetUserId: string;
    targetDisplayName: string;
    leagueId: string;
    stake: number;
    odds: number;
    settled?: { won: boolean; payout: number; settledAt: unknown };
  };
}

async function settleBets(
  raceId: string,
  results: RaceResultsBundle,
  userScoresThisRace: Map<string, number>
): Promise<void> {
  // Pole winner
  const poleDriverId = results.qualifyingResults?.find((q) => q.position === 1)?.driverId;

  // For each league: weekend top scorer
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
    if (topUserId) topScorerByLeague.set(leagueId, topUserId);
  }

  // Find every bets doc for this race and settle
  const betsSnap = await db.collection('tl_bets').where('raceId', '==', raceId).get();
  for (const betDoc of betsSnap.docs) {
    const data = betDoc.data() as BetsDoc;
    let totalCredit = 0;
    const updates: Record<string, unknown> = {};

    if (data.poleBet && !data.poleBet.settled && poleDriverId) {
      const won = data.poleBet.driverId === poleDriverId;
      const payout = won ? Math.round(data.poleBet.stake * data.poleBet.odds) : 0;
      totalCredit += payout;
      updates['poleBet.settled'] = {
        won,
        payout,
        settledAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    }

    if (data.leagueBet && !data.leagueBet.settled) {
      const top = topScorerByLeague.get(data.leagueBet.leagueId);
      const won = top === data.leagueBet.targetUserId;
      const payout = won ? Math.round(data.leagueBet.stake * data.leagueBet.odds) : 0;
      totalCredit += payout;
      updates['leagueBet.settled'] = {
        won,
        payout,
        settledAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    }

    if (Object.keys(updates).length === 0) continue;

    await betDoc.ref.update(updates);

    if (totalCredit > 0) {
      await db.doc(`tl_garages/${data.userId}`).update({
        cash: admin.firestore.FieldValue.increment(totalCredit),
        totalCashEarned: admin.firestore.FieldValue.increment(totalCredit),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection(`tl_garages/${data.userId}/transactions`).add({
        userId: data.userId,
        type: 'reroll',
        delta: totalCredit,
        cashAfter: 0,
        description: `Bet payout · race ${raceId}`,
        raceId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
}

async function updateLeagueStandingsAndPayouts(
  raceId: string,
  userScores: Map<string, number>
): Promise<void> {
  // For each league: update each member's totalPoints by their score, and if ledger
  // template is per_race or hybrid, credit the top scorer.
  const leaguesSnap = await db.collection('tl_leagues').get();

  for (const leagueDoc of leaguesSnap.docs) {
    const league = leagueDoc.data();
    const leagueId = leagueDoc.id;

    const membersSnap = await db.collection(`tl_leagues/${leagueId}/members`).get();
    if (membersSnap.empty) continue;

    let topUserId: string | null = null;
    let topScore = -Infinity;

    const batch = db.batch();
    for (const memberDoc of membersSnap.docs) {
      const memberUserId = memberDoc.data().userId as string;
      const score = userScores.get(memberUserId) ?? 0;
      if (score > topScore) {
        topScore = score;
        topUserId = memberUserId;
      }
      if (score > 0) {
        batch.update(memberDoc.ref, {
          totalPoints: admin.firestore.FieldValue.increment(score),
        });
      }
    }
    await batch.commit();

    // Per-race payout (if ledger template is per_race or hybrid)
    if (
      league.ledger?.enabled &&
      topUserId &&
      topScore > 0 &&
      (league.ledger.payoutTemplate === 'per_race' || league.ledger.payoutTemplate === 'hybrid')
    ) {
      const payoutAmount =
        league.ledger.perRacePayoutAmount ??
        // Default per-race pot: buyIn * memberCount / 24 races (roughly)
        Math.round((league.ledger.buyInAmount * (league.memberCount ?? 1)) / 24);
      if (payoutAmount > 0) {
        await db.collection(`tl_leagues/${leagueId}/ledger`).add({
          leagueId,
          userId: topUserId,
          type: 'race_payout',
          amount: payoutAmount,
          raceId,
          description: `Per-race payout — round winner`,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Bump raceWins on the member doc.
        const memberRef = db.doc(`tl_leagues/${leagueId}/members/${topUserId}`);
        await memberRef.update({
          raceWins: admin.firestore.FieldValue.increment(1),
        });
      }
    }
  }
}
