import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { warnIfNoAppCheck } from '../utils/appCheck';

const db = admin.firestore();

// Points allocation
const RACE_POINTS = [45, 37, 33, 29, 26, 23, 20, 17, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
const FASTEST_LAP_BONUS = 1;
const POSITION_GAINED_BONUS = 1;

// Lock bonus tiers
const LOCK_BONUS = {
  TIER_1: { maxRaces: 3, bonus: 1 },
  TIER_2: { maxRaces: 6, bonus: 2 },
  TIER_3: { maxRaces: Infinity, bonus: 3 },
  FULL_SEASON_BONUS: 100,
  FULL_SEASON_RACES: 24,
};

// Price tier thresholds
const TIER_A_THRESHOLD = 240;
const TIER_B_THRESHOLD = 120;

// PPM thresholds for pricing
const PPM_GREAT = 0.06;
const PPM_GOOD = 0.04;
const PPM_POOR = 0.02;

const PRICE_CHANGES = {
  A_TIER: { great: 36, good: 12, poor: -12, terrible: -36 },
  B_TIER: { great: 24, good: 7, poor: -7, terrible: -24 },
  C_TIER: { great: 12, good: 5, poor: -5, terrible: -12 },
};

const MIN_PRICE = 5;
const MAX_PRICE = 700;
const DIMINISH_FLOOR = 400;
const DIMINISH_MIN_FACTOR = 0.25;

const DNF_PRICE_PENALTY_MAX = 24;
const DNF_PRICE_PENALTY_MIN = 2;

// Firestore batch limit
const BATCH_OP_LIMIT = 499;

interface RaceResult {
  position: number;
  driverId: string;
  constructorId: string;
  gridPosition: number;
  status: 'finished' | 'dnf' | 'dsq';
  fastestLap: boolean;
  laps?: number;
}

interface SprintResult {
  position: number;
  driverId: string;
  status: 'finished' | 'dnf' | 'dsq';
}

interface FantasyDriver {
  driverId: string;
  name: string;
  shortName: string;
  constructorId: string;
  purchasePrice: number;
  currentPrice: number;
  pointsScored: number;
  racesHeld: number;
  purchasedAtRaceId?: string;
}

interface FantasyConstructor {
  constructorId: string;
  name: string;
  purchasePrice: number;
  currentPrice: number;
  pointsScored: number;
  racesHeld: number;
}

interface FantasyTeam {
  userId: string;
  leagueId: string;
  drivers: FantasyDriver[];
  constructor: FantasyConstructor | null;
  totalPoints: number;
  budget: number;
  isLocked: boolean;
  lockStatus: {
    isSeasonLocked: boolean;
    canModify: boolean;
    lockReason?: string;
    nextUnlockTime?: FirebaseFirestore.Timestamp;
    [key: string]: unknown;
  };
  aceDriverId?: string;
  aceConstructorId?: string;
  lastTransferRaceId?: string;
  racesSinceTransfer: number;
}

type PerformanceTier = 'great' | 'good' | 'poor' | 'terrible';

// ─── Helper functions ───

function calculateLockBonus(racesHeld: number): number {
  if (racesHeld >= LOCK_BONUS.FULL_SEASON_RACES) {
    return LOCK_BONUS.FULL_SEASON_BONUS;
  }

  let bonus = 0;
  let remaining = racesHeld;

  const tier1Races = Math.min(remaining, LOCK_BONUS.TIER_1.maxRaces);
  bonus += tier1Races * LOCK_BONUS.TIER_1.bonus;
  remaining -= tier1Races;

  if (remaining > 0) {
    const tier2Races = Math.min(remaining, LOCK_BONUS.TIER_2.maxRaces - LOCK_BONUS.TIER_1.maxRaces);
    bonus += tier2Races * LOCK_BONUS.TIER_2.bonus;
    remaining -= tier2Races;
  }

  if (remaining > 0) {
    bonus += remaining * LOCK_BONUS.TIER_3.bonus;
  }

  return bonus;
}

function calculateDriverPoints(
  result: RaceResult,
  sprintResult: SprintResult | null,
  racesHeld: number,
  isAce: boolean
): number {
  let racePoints = 0;
  let sprintPoints = 0;

  if (result.status === 'finished') {
    if (result.position <= RACE_POINTS.length) {
      racePoints += RACE_POINTS[result.position - 1];
    }
    const positionsGained = result.gridPosition - result.position;
    if (positionsGained > 0) {
      racePoints += positionsGained * POSITION_GAINED_BONUS;
    }
    if (positionsGained < 0) {
      racePoints += positionsGained;
    }
    if (result.fastestLap && result.position <= 10) {
      racePoints += FASTEST_LAP_BONUS;
    }
  } else if (result.status === 'dnf') {
    racePoints = -5;
  } else if (result.status === 'dsq') {
    racePoints = -5;
  }

  if (sprintResult) {
    if (sprintResult.status === 'finished' && sprintResult.position <= SPRINT_POINTS.length) {
      sprintPoints += SPRINT_POINTS[sprintResult.position - 1];
    } else if (sprintResult.status === 'dnf') {
      sprintPoints = -5;
    } else if (sprintResult.status === 'dsq') {
      sprintPoints = -5;
    }
  }

  let points = racePoints + sprintPoints;
  points += calculateLockBonus(racesHeld);

  if (isAce) {
    points *= 2;
  }

  return points;
}

function getPerformanceTier(ppm: number): PerformanceTier {
  if (ppm >= PPM_GREAT) return 'great';
  if (ppm >= PPM_GOOD) return 'good';
  if (ppm >= PPM_POOR) return 'poor';
  return 'terrible';
}

function applyDiminishingReturns(change: number, currentPrice: number): number {
  if (change <= 0) return change;
  if (currentPrice <= DIMINISH_FLOOR) return change;
  const progress = Math.min(1, (currentPrice - DIMINISH_FLOOR) / (MAX_PRICE - DIMINISH_FLOOR));
  const factor = 1 - progress * (1 - DIMINISH_MIN_FACTOR);
  return Math.round(change * factor);
}

function calculatePriceChange(points: number, currentPrice: number): number {
  const ppm = currentPrice === 0 ? 0 : points / currentPrice;
  const performanceTier = getPerformanceTier(ppm);
  const priceChangeMap = currentPrice > TIER_A_THRESHOLD
    ? PRICE_CHANGES.A_TIER
    : currentPrice > TIER_B_THRESHOLD
      ? PRICE_CHANGES.B_TIER
      : PRICE_CHANGES.C_TIER;
  const rawChange = priceChangeMap[performanceTier];
  return applyDiminishingReturns(rawChange, currentPrice);
}

function calculateDnfPricePenalty(dnfLap: number, totalLaps: number): number {
  if (totalLaps <= 1) return DNF_PRICE_PENALTY_MIN;
  if (dnfLap <= 0) return DNF_PRICE_PENALTY_MAX;
  if (dnfLap >= totalLaps) return DNF_PRICE_PENALTY_MIN;
  const progress = (dnfLap - 1) / (totalLaps - 1);
  const penalty = DNF_PRICE_PENALTY_MIN +
    (DNF_PRICE_PENALTY_MAX - DNF_PRICE_PENALTY_MIN) * (1 - progress);
  return Math.ceil(penalty);
}

/**
 * Commit writes in batches respecting the 500-op Firestore limit.
 */
async function commitInBatches(
  ops: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }>
): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_OP_LIMIT) {
    const batch = db.batch();
    const chunk = ops.slice(i, i + BATCH_OP_LIMIT);
    for (const op of chunk) {
      batch.update(op.ref, op.data);
    }
    await batch.commit();
  }
}

// ─── Main trigger ───

/**
 * Single trigger fired when a race transitions to 'completed'.
 * Performs all 5 phases:
 *   1. Score fantasy teams
 *   2. Update driver/constructor market prices
 *   3. Update currentPrices in fantasy team docs + recalc budgets
 *   4. Update league rankings
 *   5. Unlock non-season-locked teams
 */
export const onRaceCompleted = functions
  .runWith({ timeoutSeconds: 540 })
  .firestore.document('races/{raceId}')
  .onUpdate(async (change, context) => {
    const raceId = context.params.raceId;
    const beforeData = change.before.data();
    const afterData = change.after.data();

    // Only process when race just completed
    if (beforeData.status === 'completed' || afterData.status !== 'completed') {
      return null;
    }

    const results = afterData.results;
    if (!results || !results.raceResults) {
      console.log('No race results found');
      return null;
    }

    const raceResults: RaceResult[] = results.raceResults;
    const sprintResults: SprintResult[] | null = results.sprintResults || null;

    // Build lookup maps
    const raceResultsMap = new Map<string, RaceResult>();
    raceResults.forEach((r) => raceResultsMap.set(r.driverId, r));

    const sprintResultsMap = new Map<string, SprintResult>();
    if (sprintResults) {
      sprintResults.forEach((r) => sprintResultsMap.set(r.driverId, r));
    }

    // ─── PHASE 1: Score fantasy teams ───
    console.log(`[Phase 1] Scoring teams for race ${raceId}`);

    const teamsSnapshot = await db.collection('fantasyTeams').get();
    const teamOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];
    const pointsUpdates: { leagueId: string; userId: string; points: number }[] = [];

    for (const teamDoc of teamsSnapshot.docs) {
      const team = teamDoc.data() as FantasyTeam;
      let teamPoints = 0;
      const aceDriverId = team.aceDriverId;

      // Calculate driver points
      const updatedDrivers: FantasyDriver[] = [];
      for (const driver of team.drivers) {
        const raceResult = raceResultsMap.get(driver.driverId);
        const sprintResult = sprintResultsMap.get(driver.driverId) || null;
        let isAce = driver.driverId === aceDriverId;

        // Server-side ace price validation: drivers over $240 cannot be ace
        if (isAce) {
          const driverDoc = await db.collection('drivers').doc(driver.driverId).get();
          const driverPrice = driverDoc.exists ? (driverDoc.data()?.price || 0) : 0;
          if (driverPrice > TIER_A_THRESHOLD) {
            console.warn(`Invalid ace: driver ${driver.driverId} price $${driverPrice} > $${TIER_A_THRESHOLD}`);
            isAce = false;
          }
        }

        let driverPoints = 0;
        if (raceResult) {
          driverPoints = calculateDriverPoints(raceResult, sprintResult, driver.racesHeld, isAce);
        }

        teamPoints += driverPoints;
        updatedDrivers.push({
          ...driver,
          pointsScored: driver.pointsScored + driverPoints,
          racesHeld: driver.racesHeld + 1,
        });
      }

      // Calculate constructor points
      let updatedConstructor: FantasyConstructor | null = null;
      if (team.constructor) {
        const ctor = team.constructor;
        let isAceConstructor = team.aceConstructorId === ctor.constructorId;

        // Server-side ace constructor price validation
        if (isAceConstructor) {
          const ctorDoc = await db.collection('constructors').doc(ctor.constructorId).get();
          const ctorPrice = ctorDoc.exists ? (ctorDoc.data()?.price || 0) : 0;
          if (ctorPrice > TIER_A_THRESHOLD) {
            console.warn(`Invalid ace constructor: ${ctor.constructorId} price $${ctorPrice} > $${TIER_A_THRESHOLD}`);
            isAceConstructor = false;
          }
        }

        let constructorPoints = 0;

        const constructorDriverResults = raceResults.filter(
          (r) => r.constructorId === ctor.constructorId
        );
        for (const result of constructorDriverResults) {
          if (result.status === 'finished' && result.position <= RACE_POINTS.length) {
            constructorPoints += RACE_POINTS[result.position - 1];
          }
        }
        constructorPoints += calculateLockBonus(ctor.racesHeld);
        if (isAceConstructor) {
          constructorPoints *= 2;
        }

        teamPoints += constructorPoints;
        updatedConstructor = {
          ...ctor,
          pointsScored: ctor.pointsScored + constructorPoints,
          racesHeld: ctor.racesHeld + 1,
        };
      }

      // Stale roster penalty
      const racesSinceTransfer = team.racesSinceTransfer || 0;
      if (racesSinceTransfer > 5) {
        const stalePenalty = (racesSinceTransfer - 5) * 5;
        teamPoints -= stalePenalty;
      }

      teamOps.push({
        ref: teamDoc.ref,
        data: {
          drivers: updatedDrivers,
          constructor: updatedConstructor,
          totalPoints: admin.firestore.FieldValue.increment(teamPoints),
          racesSinceTransfer: admin.firestore.FieldValue.increment(1),
        },
      });

      pointsUpdates.push({
        leagueId: team.leagueId,
        userId: team.userId,
        points: teamPoints,
      });
    }

    await commitInBatches(teamOps);
    console.log(`[Phase 1] Scored ${teamsSnapshot.size} teams`);

    // ─── PHASE 2: Update market prices ───
    console.log(`[Phase 2] Updating market prices`);

    // Pricing-specific points calculation (uses different point values from scoring)
    const PRICING_RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    const PRICING_SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

    const driverPricingPoints = new Map<string, number>();
    const constructorPricingPoints = new Map<string, number>();
    const driverDnfPenalties = new Map<string, number>();
    const constructorDnfPenalties = new Map<string, number>();

    let totalLaps = afterData.totalLaps || 0;
    if (!totalLaps) {
      for (const result of raceResults) {
        if (result.status === 'finished' && (result.laps || 0) > totalLaps) {
          totalLaps = result.laps || 0;
        }
      }
    }

    for (const result of raceResults) {
      let points = 0;
      if (result.status === 'finished' && result.position <= PRICING_RACE_POINTS.length) {
        points = PRICING_RACE_POINTS[result.position - 1];
        const positionsGained = result.gridPosition - result.position;
        if (positionsGained > 0) points += positionsGained;
        if (result.fastestLap && result.position <= 10) points += 1;
      } else if (result.status === 'dnf' && totalLaps > 0) {
        const dnfLap = result.laps || 1;
        const dnfPenalty = calculateDnfPricePenalty(dnfLap, totalLaps);
        driverDnfPenalties.set(result.driverId, dnfPenalty);
        const existing = constructorDnfPenalties.get(result.constructorId) || 0;
        constructorDnfPenalties.set(result.constructorId, existing + dnfPenalty);
      }

      driverPricingPoints.set(result.driverId, (driverPricingPoints.get(result.driverId) || 0) + points);
      constructorPricingPoints.set(
        result.constructorId,
        (constructorPricingPoints.get(result.constructorId) || 0) + points
      );
    }

    if (sprintResults) {
      for (const result of sprintResults) {
        if (result.status === 'finished' && result.position <= PRICING_SPRINT_POINTS.length) {
          const points = PRICING_SPRINT_POINTS[result.position - 1];
          driverPricingPoints.set(result.driverId, (driverPricingPoints.get(result.driverId) || 0) + points);
        }
      }
    }

    // Update driver prices
    const driversSnapshot = await db.collection('drivers').where('isActive', '==', true).get();
    const driverPriceOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    for (const driverDoc of driversSnapshot.docs) {
      const driver = driverDoc.data();
      const points = driverPricingPoints.get(driverDoc.id) || 0;
      const performanceChange = calculatePriceChange(points, driver.price);
      const dnfPenalty = driverDnfPenalties.get(driverDoc.id) || 0;
      const totalPriceChange = performanceChange - dnfPenalty;
      const newPrice = Math.max(MIN_PRICE, driver.price + totalPriceChange);

      driverPriceOps.push({
        ref: driverDoc.ref,
        data: {
          previousPrice: driver.price,
          price: newPrice,
          fantasyPoints: admin.firestore.FieldValue.increment(points),
          tier: newPrice >= TIER_A_THRESHOLD ? 'A' : 'B',
        },
      });

      // Record price history (not batched — individual adds)
      await db.collection('priceHistory').add({
        entityId: driverDoc.id,
        entityType: 'driver',
        price: newPrice,
        previousPrice: driver.price,
        change: totalPriceChange,
        performanceChange,
        dnfPenalty,
        points,
        raceId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await commitInBatches(driverPriceOps);

    // Update constructor prices
    const constructorsSnapshot = await db.collection('constructors').where('isActive', '==', true).get();
    const ctorPriceOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    for (const ctorDoc of constructorsSnapshot.docs) {
      const ctor = ctorDoc.data();
      const points = constructorPricingPoints.get(ctorDoc.id) || 0;
      const performanceChange = calculatePriceChange(points, ctor.price);
      const dnfPenalty = constructorDnfPenalties.get(ctorDoc.id) || 0;
      const totalPriceChange = performanceChange - dnfPenalty;
      const newPrice = Math.max(MIN_PRICE, ctor.price + totalPriceChange);

      ctorPriceOps.push({
        ref: ctorDoc.ref,
        data: {
          previousPrice: ctor.price,
          price: newPrice,
          fantasyPoints: admin.firestore.FieldValue.increment(points),
        },
      });

      await db.collection('priceHistory').add({
        entityId: ctorDoc.id,
        entityType: 'constructor',
        price: newPrice,
        previousPrice: ctor.price,
        change: totalPriceChange,
        performanceChange,
        dnfPenalty,
        points,
        raceId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await commitInBatches(ctorPriceOps);
    console.log(`[Phase 2] Updated ${driversSnapshot.size} driver + ${constructorsSnapshot.size} constructor prices`);

    // ─── PHASE 3: Update currentPrices in fantasy teams + recalc budgets ───
    console.log(`[Phase 3] Refreshing team currentPrices`);

    // Re-read latest prices
    const updatedDriversSnap = await db.collection('drivers').get();
    const driverPrices = new Map<string, number>();
    updatedDriversSnap.docs.forEach((d) => driverPrices.set(d.id, d.data().price));

    const updatedCtorsSnap = await db.collection('constructors').get();
    const ctorPrices = new Map<string, number>();
    updatedCtorsSnap.docs.forEach((d) => ctorPrices.set(d.id, d.data().price));

    // Re-read teams (they were updated in phase 1)
    const freshTeamsSnap = await db.collection('fantasyTeams').get();
    const teamPriceOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    for (const teamDoc of freshTeamsSnap.docs) {
      const team = teamDoc.data() as Record<string, unknown>;
      const drivers = (team.drivers || []) as FantasyDriver[];
      const teamCtor = team['constructor'] as FantasyConstructor | null;

      const updatedDrivers = drivers.map((driver) => ({
        ...driver,
        currentPrice: driverPrices.get(driver.driverId) || driver.currentPrice,
      }));

      let updatedConstructor = teamCtor;
      if (teamCtor) {
        updatedConstructor = {
          ...teamCtor,
          currentPrice: ctorPrices.get(teamCtor.constructorId) || teamCtor.currentPrice,
        };
      }

      const totalDriverValue = updatedDrivers.reduce((sum, d) => sum + d.currentPrice, 0);
      const constructorValue = updatedConstructor?.currentPrice || 0;
      const totalSpent = (team.totalSpent as number) || 0;
      const originalValue = drivers.reduce((sum, d) => sum + d.purchasePrice, 0) +
        (teamCtor?.purchasePrice || 0);
      const valueChange = (totalDriverValue + constructorValue) - originalValue;
      const newBudget = 1000 - totalSpent + valueChange;

      teamPriceOps.push({
        ref: teamDoc.ref,
        data: {
          drivers: updatedDrivers,
          constructor: updatedConstructor,
          budget: Math.round(newBudget),
        },
      });
    }

    await commitInBatches(teamPriceOps);
    console.log(`[Phase 3] Updated prices for ${freshTeamsSnap.size} teams`);

    // ─── PHASE 4: Update league rankings ───
    console.log(`[Phase 4] Updating league rankings`);

    const leagueMemberOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    for (const update of pointsUpdates) {
      const memberRef = db
        .collection('leagues')
        .doc(update.leagueId)
        .collection('members')
        .doc(update.userId);

      leagueMemberOps.push({
        ref: memberRef,
        data: { totalPoints: admin.firestore.FieldValue.increment(update.points) },
      });
    }

    await commitInBatches(leagueMemberOps);

    // Recalculate rankings per league
    const affectedLeagues = [...new Set(pointsUpdates.map((u) => u.leagueId))];
    for (const leagueId of affectedLeagues) {
      const membersSnapshot = await db
        .collection('leagues')
        .doc(leagueId)
        .collection('members')
        .orderBy('totalPoints', 'desc')
        .get();

      const rankOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];
      membersSnapshot.docs.forEach((d, index) => {
        rankOps.push({ ref: d.ref, data: { rank: index + 1 } });
      });
      await commitInBatches(rankOps);
    }

    console.log(`[Phase 4] Updated rankings for ${affectedLeagues.length} leagues`);

    // ─── PHASE 5: Unlock non-season-locked teams ───
    console.log(`[Phase 5] Unlocking teams`);

    const lockedTeamsSnap = await db
      .collection('fantasyTeams')
      .where('isLocked', '==', true)
      .get();

    const unlockOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    for (const teamDoc of lockedTeamsSnap.docs) {
      const team = teamDoc.data();
      // Skip season-locked teams
      if (team.lockStatus?.isSeasonLocked) continue;

      unlockOps.push({
        ref: teamDoc.ref,
        data: {
          isLocked: false,
          'lockStatus.canModify': true,
          'lockStatus.lockReason': null,
          'lockStatus.nextUnlockTime': null,
        },
      });
    }

    await commitInBatches(unlockOps);
    console.log(`[Phase 5] Unlocked ${unlockOps.length} teams`);

    console.log(`Race ${raceId} fully processed: scored, priced, ranked, unlocked`);
    return null;
  });

/**
 * HTTP function to manually trigger points calculation
 */
export const calculatePointsManually = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  warnIfNoAppCheck(context, 'calculatePointsManually');

  const { raceId } = data;
  if (!raceId) {
    throw new functions.https.HttpsError('invalid-argument', 'raceId is required');
  }

  const raceDoc = await db.collection('races').doc(raceId).get();
  if (!raceDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Race not found');
  }

  const raceData = raceDoc.data();
  if (!raceData?.results) {
    throw new functions.https.HttpsError('failed-precondition', 'Race has no results');
  }

  // Toggle status to re-trigger the onUpdate
  await raceDoc.ref.update({ status: 'in_progress' });
  await raceDoc.ref.update({ status: 'completed' });

  return { success: true, message: 'Points calculation triggered' };
});
