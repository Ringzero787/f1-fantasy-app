import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { warnIfNoAppCheck } from '../utils/appCheck';
import { rebuildMarketCache } from '../cache/marketCache';

const db = admin.firestore();

// Points allocation
const RACE_POINTS = [45, 37, 33, 29, 26, 23, 20, 17, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
const FASTEST_LAP_BONUS = 1;
const POSITION_GAINED_BONUS = 1;
const GRID_SIZE = 22;

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

// Ace system: only drivers/constructors at or below this price can be ace
const ACE_MAX_PRICE = 200;

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

// Contract system
const CONTRACT_LENGTH_DEFAULT = 3;
const CONTRACT_LOCKOUT_RACES = 1;
const TEAM_SIZE = 5;

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

interface QualifyingResult {
  position: number;
  driverId: string;
  constructorId: string;
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
  contractLength?: number;
  isReservePick?: boolean;
  addedAtRace?: number;
}

interface FantasyConstructor {
  constructorId: string;
  name: string;
  purchasePrice: number;
  currentPrice: number;
  pointsScored: number;
  racesHeld: number;
  contractLength?: number;
  isReservePick?: boolean;
  addedAtRace?: number;
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
  driverLockouts?: Record<string, number>;
  lockedPoints?: number;
  totalSpent?: number;
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
    // Position bonus: all classified finishers P1-P22 get reverse-grid points
    if (result.position >= 1 && result.position <= GRID_SIZE) {
      racePoints += GRID_SIZE + 1 - result.position;
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

// ─── Qualifying scoring (standalone) ───

/**
 * Score qualifying results independently of race completion.
 * Awards half-rate position bonus: floor((GRID_SIZE + 1 - pos) / 2)
 * Skipped on sprint weekends.
 */
export async function handleQualifyingScoring(
  raceId: string,
  raceData: FirebaseFirestore.DocumentData,
): Promise<null> {
  const qualifyingResults: QualifyingResult[] = raceData.results?.qualifyingResults;
  if (!qualifyingResults || qualifyingResults.length === 0) {
    console.log(`[Qualifying] No qualifying results for ${raceId}`);
    return null;
  }

  console.log(`[Qualifying] Scoring qualifying for ${raceId} (${qualifyingResults.length} drivers)`);

  const qualifyingResultsMap = new Map<string, QualifyingResult>();
  qualifyingResults.forEach((r) => qualifyingResultsMap.set(r.driverId, r));

  // Pre-fetch driver/constructor prices for ace validation
  const [driverPriceSnap, ctorPriceSnap] = await Promise.all([
    db.collection('drivers').get(),
    db.collection('constructors').get(),
  ]);
  const driverPriceMap = new Map<string, number>();
  driverPriceSnap.docs.forEach((d) => driverPriceMap.set(d.id, d.data().price || 0));
  const ctorPriceMap = new Map<string, number>();
  ctorPriceSnap.docs.forEach((d) => ctorPriceMap.set(d.id, d.data().price || 0));

  const teamsSnapshot = await db.collection('fantasyTeams').get();
  const pointsUpdates: { leagueId: string; userId: string; points: number }[] = [];

  for (const teamDoc of teamsSnapshot.docs) {
    const team = teamDoc.data() as FantasyTeam;
    let teamPoints = 0;
    const aceDriverId = team.aceDriverId;

    // Score driver qualifying points
    const updatedDrivers = team.drivers.map((driver) => {
      let isAce = driver.driverId === aceDriverId;
      if (isAce) {
        const price = driverPriceMap.get(driver.driverId) || 0;
        if (price > ACE_MAX_PRICE) isAce = false;
      }

      const qualiResult = qualifyingResultsMap.get(driver.driverId);
      let qualiPoints = 0;
      if (qualiResult && qualiResult.position >= 1 && qualiResult.position <= 16) {
        qualiPoints = Math.floor((GRID_SIZE + 1 - qualiResult.position) / 4);
        if (isAce) qualiPoints *= 2;
      }

      teamPoints += qualiPoints;
      return {
        ...driver,
        pointsScored: driver.pointsScored + qualiPoints,
      };
    });

    // Score constructor qualifying points
    // Access via bracket notation to avoid Object.prototype.constructor
    const teamCtor = (team as Record<string, any>)['constructor'] as FantasyConstructor | null;
    let updatedConstructor = teamCtor;
    if (teamCtor) {
      const ctor = teamCtor;
      let isAceConstructor = team.aceConstructorId === ctor.constructorId;
      if (isAceConstructor) {
        const price = ctorPriceMap.get(ctor.constructorId) || 0;
        if (price > ACE_MAX_PRICE) isAceConstructor = false;
      }

      let ctorQualiPoints = 0;
      const ctorQualiResults = qualifyingResults.filter(
        (r) => r.constructorId === ctor.constructorId,
      );
      for (const qr of ctorQualiResults) {
        if (qr.position >= 1 && qr.position <= 16) {
          ctorQualiPoints += Math.floor((GRID_SIZE + 1 - qr.position) / 4);
        }
      }
      if (isAceConstructor) ctorQualiPoints *= 2;

      teamPoints += ctorQualiPoints;
      updatedConstructor = {
        ...ctor,
        pointsScored: ctor.pointsScored + ctorQualiPoints,
      };
    }

    if (teamPoints !== 0) {
      const updateData: Record<string, any> = {
        drivers: updatedDrivers,
        totalPoints: admin.firestore.FieldValue.increment(teamPoints),
      };
      if (updatedConstructor) {
        updateData['constructor'] = updatedConstructor;
      }

      try {
        await teamDoc.ref.set(updateData, { merge: true });
      } catch (err) {
        console.error(`[Qualifying] Failed to update team ${teamDoc.id}:`, err);
        continue;
      }

      pointsUpdates.push({
        leagueId: team.leagueId,
        userId: team.userId,
        points: teamPoints,
      });
    }
  }

  console.log(`[Qualifying] Scored ${pointsUpdates.length} teams for ${raceId}`);

  // Update league rankings
  const leagueMemberOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];
  for (const update of pointsUpdates) {
    leagueMemberOps.push({
      ref: db.collection('leagues').doc(update.leagueId).collection('members').doc(update.userId),
      data: { totalPoints: admin.firestore.FieldValue.increment(update.points) },
    });
  }
  await commitInBatches(leagueMemberOps);

  const affectedLeagues = [...new Set(pointsUpdates.map((u) => u.leagueId))];
  for (const leagueId of affectedLeagues) {
    const membersSnapshot = await db
      .collection('leagues').doc(leagueId).collection('members')
      .orderBy('totalPoints', 'desc').get();
    const rankOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];
    membersSnapshot.docs.forEach((d, index) => {
      rankOps.push({ ref: d.ref, data: { rank: index + 1 } });
    });
    await commitInBatches(rankOps);
  }

  console.log(`[Qualifying] Updated rankings for ${affectedLeagues.length} leagues`);
  return null;
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

    // Handle qualifying scored event (separate from race completion)
    if (!beforeData.qualifyingScored && afterData.qualifyingScored === true
        && afterData.status !== 'completed') {
      return handleQualifyingScoring(raceId, afterData);
    }

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
    const qualifyingResults: QualifyingResult[] | null = results.qualifyingResults || null;

    // Skip qualifying if already scored independently, or on sprint weekends
    const hasSprintWeekend = !!sprintResults;
    const qualifyingAlreadyScored = afterData.qualifyingScored === true && beforeData.qualifyingScored === true;
    const scoreQualifying = !hasSprintWeekend && !qualifyingAlreadyScored
      && !!qualifyingResults && qualifyingResults.length > 0;

    // Build lookup maps
    const raceResultsMap = new Map<string, RaceResult>();
    raceResults.forEach((r) => raceResultsMap.set(r.driverId, r));

    const sprintResultsMap = new Map<string, SprintResult>();
    if (sprintResults) {
      sprintResults.forEach((r) => sprintResultsMap.set(r.driverId, r));
    }

    const qualifyingResultsMap = new Map<string, QualifyingResult>();
    if (scoreQualifying && qualifyingResults) {
      qualifyingResults.forEach((r) => qualifyingResultsMap.set(r.driverId, r));
    }

    // Pre-fetch all driver and constructor prices for ace validation
    const driverPriceSnap = await db.collection('drivers').get();
    const driverPriceMap = new Map<string, number>();
    driverPriceSnap.docs.forEach((d) => driverPriceMap.set(d.id, d.data().price || 0));

    const ctorPriceSnap = await db.collection('constructors').get();
    const ctorPriceMap = new Map<string, number>();
    ctorPriceSnap.docs.forEach((d) => ctorPriceMap.set(d.id, d.data().price || 0));

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

        // Server-side ace price validation: drivers over $200 cannot be ace
        if (isAce) {
          const driverPrice = driverPriceMap.get(driver.driverId) || 0;
          if (driverPrice > ACE_MAX_PRICE) {
            console.warn(`Invalid ace: driver ${driver.driverId} price $${driverPrice} > $${ACE_MAX_PRICE}`);
            isAce = false;
          }
        }

        let driverPoints = 0;
        if (raceResult) {
          driverPoints = calculateDriverPoints(raceResult, sprintResult, driver.racesHeld, isAce);
        }

        // Qualifying points: half-rate position bonus (non-sprint weekends only)
        if (scoreQualifying) {
          const qualiResult = qualifyingResultsMap.get(driver.driverId);
          if (qualiResult && qualiResult.position >= 1 && qualiResult.position <= GRID_SIZE) {
            let qualiPoints = Math.floor((GRID_SIZE + 1 - qualiResult.position) / 2);
            if (isAce) qualiPoints *= 2;
            driverPoints += qualiPoints;
          }
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

        // Server-side ace constructor price validation: constructors over $200 cannot be ace
        if (isAceConstructor) {
          const ctorPrice = ctorPriceMap.get(ctor.constructorId) || 0;
          if (ctorPrice > ACE_MAX_PRICE) {
            console.warn(`Invalid ace constructor: ${ctor.constructorId} price $${ctorPrice} > $${ACE_MAX_PRICE}`);
            isAceConstructor = false;
          }
        }

        let constructorPoints = 0;

        const constructorDriverResults = raceResults.filter(
          (r) => r.constructorId === ctor.constructorId
        );
        for (const result of constructorDriverResults) {
          if (result.status === 'finished') {
            if (result.position <= RACE_POINTS.length) {
              constructorPoints += RACE_POINTS[result.position - 1];
            }
            // Position bonus for each constructor driver
            if (result.position >= 1 && result.position <= GRID_SIZE) {
              constructorPoints += GRID_SIZE + 1 - result.position;
            }
          }
        }
        // Qualifying points for constructor: sum both drivers' half-rate qualifying bonus
        if (scoreQualifying && qualifyingResults) {
          const ctorQualiResults = qualifyingResults.filter(
            (r) => r.constructorId === ctor.constructorId
          );
          for (const qr of ctorQualiResults) {
            if (qr.position >= 1 && qr.position <= GRID_SIZE) {
              constructorPoints += Math.floor((GRID_SIZE + 1 - qr.position) / 2);
            }
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
      if (result.status === 'finished') {
        if (result.position <= PRICING_RACE_POINTS.length) {
          points = PRICING_RACE_POINTS[result.position - 1];
        }
        const positionsGained = result.gridPosition - result.position;
        if (positionsGained > 0) points += positionsGained;
        if (result.fastestLap && result.position <= 10) points += 1;
        // Position bonus for pricing
        if (result.position >= 1 && result.position <= GRID_SIZE) {
          points += GRID_SIZE + 1 - result.position;
        }
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
    // Reuse pre-fetched driver data, filter to active only
    const driversSnapshot = { docs: driverPriceSnap.docs.filter(d => d.data().isActive === true), size: 0 };
    driversSnapshot.size = driversSnapshot.docs.length;
    const driverPriceOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    const priceHistoryOps: Array<{ data: Record<string, any> }> = [];

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

      priceHistoryOps.push({ data: {
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
      } });
    }

    await commitInBatches(driverPriceOps);

    // Update constructor prices
    const constructorsSnapshot = { docs: ctorPriceSnap.docs.filter(d => d.data().isActive === true), size: 0 };
    constructorsSnapshot.size = constructorsSnapshot.docs.length;
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

      priceHistoryOps.push({ data: {
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
      } });
    }

    await commitInBatches(ctorPriceOps);

    // Batch write price history
    for (let i = 0; i < priceHistoryOps.length; i += BATCH_OP_LIMIT) {
      const batch = db.batch();
      const chunk = priceHistoryOps.slice(i, i + BATCH_OP_LIMIT);
      for (const op of chunk) {
        batch.set(db.collection('priceHistory').doc(), op.data);
      }
      await batch.commit();
    }

    console.log(`[Phase 2] Updated ${driversSnapshot.size} driver + ${constructorsSnapshot.size} constructor prices`);

    // Rebuild market cache after price updates (non-blocking)
    rebuildMarketCache().catch((e) => console.warn('Market cache rebuild failed:', e));

    // ─── PHASE 3: Update currentPrices in fantasy teams + recalc budgets ───
    console.log(`[Phase 3] Refreshing team currentPrices`);

    // Build updated price maps from Phase 2 results (no re-query needed)
    const driverPrices = new Map<string, number>();
    for (const op of driverPriceOps) {
      driverPrices.set(op.ref.id, op.data.price);
    }
    // Include inactive drivers that weren't in driverPriceOps
    driverPriceSnap.docs.forEach((d) => {
      if (!driverPrices.has(d.id)) driverPrices.set(d.id, d.data().price || 0);
    });

    const ctorPrices = new Map<string, number>();
    for (const op of ctorPriceOps) {
      ctorPrices.set(op.ref.id, op.data.price);
    }
    ctorPriceSnap.docs.forEach((d) => {
      if (!ctorPrices.has(d.id)) ctorPrices.set(d.id, d.data().price || 0);
    });

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

    // ─── PHASE 3.5: Contract expiry + auto-fill ───
    console.log(`[Phase 3.5] Processing contract expiry and auto-fill`);

    const completedRacesSnap = await db.collection('races').where('status', '==', 'completed').get();
    const completedRaceCount = completedRacesSnap.size;

    // Reuse freshTeamsSnap from Phase 3 (no re-query needed)
    const contractOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    // Reuse pre-fetched snapshots with updated prices from Phase 2
    const allDriversList: Array<{ id: string; name: string; shortName: string; constructorId: string; price: number }> = [];
    for (const d of driverPriceSnap.docs) {
      const data = d.data();
      if (!data.isActive) continue;
      allDriversList.push({
        id: d.id,
        name: data.name || '',
        shortName: data.shortName || '',
        constructorId: data.constructorId || '',
        price: driverPrices.get(d.id) || data.price || 0,
      });
    }
    allDriversList.sort((a, b) => a.price - b.price);

    const allCtorsList: Array<{ id: string; name: string; price: number }> = [];
    for (const c of ctorPriceSnap.docs) {
      const data = c.data();
      if (!data.isActive) continue;
      allCtorsList.push({ id: c.id, name: data.name || '', price: ctorPrices.get(c.id) || data.price || 0 });
    }
    allCtorsList.sort((a, b) => a.price - b.price);

    let totalExpiredDrivers = 0;
    let totalExpiredConstructors = 0;
    let totalAutoFilled = 0;

    for (const teamDoc of freshTeamsSnap.docs) {
      const team = teamDoc.data() as FantasyTeam & Record<string, unknown>;
      let drivers = [...(team.drivers || [])] as FantasyDriver[];
      let teamCtor = (team['constructor'] as FantasyConstructor | null);
      let budget = (team.budget as number) ?? 0;
      let aceDriverId = team.aceDriverId;
      let aceConstructorId = team.aceConstructorId;
      let lockedPoints = team.lockedPoints || 0;
      const lockouts: Record<string, number> = { ...(team.driverLockouts || {}) };

      let saleReturns = 0;
      let autoFillCosts = 0;
      const expiredDriverIds: string[] = [];
      let constructorExpired = false;

      // (a) Driver contract expiry
      const remainingDrivers: FantasyDriver[] = [];
      for (const driver of drivers) {
        const contractLen = driver.contractLength || CONTRACT_LENGTH_DEFAULT;
        if (driver.racesHeld >= contractLen) {
          // Expired: sell at current price, bank points, add lockout
          saleReturns += driver.currentPrice; // SALE_COMMISSION_RATE is 0
          lockedPoints += driver.pointsScored;
          lockouts[driver.driverId] = completedRaceCount + CONTRACT_LOCKOUT_RACES;
          expiredDriverIds.push(driver.driverId);
          if (aceDriverId === driver.driverId) aceDriverId = undefined;
          totalExpiredDrivers++;
        } else {
          remainingDrivers.push(driver);
        }
      }
      drivers = remainingDrivers;

      // (b) Constructor contract expiry
      let expiredConstructorId: string | undefined;
      if (teamCtor) {
        const cContractLen = teamCtor.contractLength || CONTRACT_LENGTH_DEFAULT;
        if (teamCtor.racesHeld >= cContractLen) {
          saleReturns += teamCtor.currentPrice;
          lockedPoints += teamCtor.pointsScored;
          expiredConstructorId = teamCtor.constructorId;
          if (aceConstructorId === teamCtor.constructorId) aceConstructorId = undefined;
          teamCtor = null;
          constructorExpired = true;
          totalExpiredConstructors++;
        }
      }

      // Skip if nothing expired
      if (expiredDriverIds.length === 0 && !constructorExpired) {
        // Still prune expired lockouts even if no new expirations
        let lockoutsChanged = false;
        for (const [dId, expiresAt] of Object.entries(lockouts)) {
          if (completedRaceCount >= expiresAt) {
            delete lockouts[dId];
            lockoutsChanged = true;
          }
        }
        if (lockoutsChanged) {
          contractOps.push({
            ref: teamDoc.ref,
            data: {
              driverLockouts: Object.keys(lockouts).length > 0 ? lockouts : admin.firestore.FieldValue.delete(),
            },
          });
        }
        continue;
      }

      // (c) Prune expired lockouts
      for (const [dId, expiresAt] of Object.entries(lockouts)) {
        if (completedRaceCount >= expiresAt) {
          delete lockouts[dId];
        }
      }

      // (d) Auto-fill drivers (only if drivers expired this pass)
      if (expiredDriverIds.length > 0) {
        const teamDriverIds = new Set(drivers.map(d => d.driverId));
        const expiredSet = new Set(expiredDriverIds);
        let fillBudget = budget + saleReturns - autoFillCosts;

        for (const candidate of allDriversList) {
          if (drivers.length >= TEAM_SIZE) break;
          if (candidate.price > fillBudget) break;
          if (teamDriverIds.has(candidate.id)) continue;
          if (expiredSet.has(candidate.id)) continue;
          // Check lockout
          const lockExpiry = lockouts[candidate.id];
          if (lockExpiry !== undefined && completedRaceCount < lockExpiry) continue;

          drivers.push({
            driverId: candidate.id,
            name: candidate.name,
            shortName: candidate.shortName,
            constructorId: candidate.constructorId,
            purchasePrice: candidate.price,
            currentPrice: candidate.price,
            pointsScored: 0,
            racesHeld: 0,
            contractLength: CONTRACT_LENGTH_DEFAULT,
            isReservePick: true,
            addedAtRace: completedRaceCount,
          });
          teamDriverIds.add(candidate.id);
          autoFillCosts += candidate.price;
          fillBudget -= candidate.price;
          totalAutoFilled++;
        }
      }

      // (e) Auto-fill constructor (only if constructor expired this pass)
      if (constructorExpired) {
        let fillBudget = budget + saleReturns - autoFillCosts;
        for (const candidate of allCtorsList) {
          if (candidate.price > fillBudget) break;
          if (candidate.id === expiredConstructorId) continue;

          teamCtor = {
            constructorId: candidate.id,
            name: candidate.name,
            purchasePrice: candidate.price,
            currentPrice: candidate.price,
            pointsScored: 0,
            racesHeld: 0,
            contractLength: CONTRACT_LENGTH_DEFAULT,
            isReservePick: true,
            addedAtRace: completedRaceCount,
          };
          autoFillCosts += candidate.price;
          totalAutoFilled++;
          break;
        }
      }

      // (f) Budget = original budget + sale returns - auto-fill costs
      const newBudget = budget + saleReturns - autoFillCosts;

      // (g) Ace auto-clear if price > $200
      if (aceDriverId) {
        const aceDriver = drivers.find(d => d.driverId === aceDriverId);
        if (aceDriver && aceDriver.currentPrice > ACE_MAX_PRICE) {
          aceDriverId = undefined;
        }
      }
      if (aceConstructorId && teamCtor) {
        if (teamCtor.currentPrice > ACE_MAX_PRICE) {
          aceConstructorId = undefined;
        }
      }

      contractOps.push({
        ref: teamDoc.ref,
        data: {
          drivers,
          constructor: teamCtor,
          budget: Math.round(newBudget),
          aceDriverId: aceDriverId ?? admin.firestore.FieldValue.delete(),
          aceConstructorId: aceConstructorId ?? admin.firestore.FieldValue.delete(),
          driverLockouts: Object.keys(lockouts).length > 0 ? lockouts : admin.firestore.FieldValue.delete(),
          lockedPoints: lockedPoints > 0 ? lockedPoints : admin.firestore.FieldValue.delete(),
        },
      });
    }

    await commitInBatches(contractOps);
    console.log(`[Phase 3.5] Expired ${totalExpiredDrivers} drivers, ${totalExpiredConstructors} constructors, auto-filled ${totalAutoFilled} slots`);

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

    // ─── PHASE 5: Schedule delayed unlock (3 hours after race completion) ───
    const UNLOCK_DELAY_MS = 3 * 60 * 60 * 1000; // 3 hours
    const unlockTime = admin.firestore.Timestamp.fromMillis(Date.now() + UNLOCK_DELAY_MS);
    console.log(`[Phase 5] Scheduling team unlock for ${unlockTime.toDate().toISOString()}`);

    const lockedTeamsSnap = await db
      .collection('fantasyTeams')
      .where('isLocked', '==', true)
      .get();

    const unlockOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    for (const teamDoc of lockedTeamsSnap.docs) {
      const team = teamDoc.data();
      if (team.lockStatus?.isSeasonLocked) continue;

      unlockOps.push({
        ref: teamDoc.ref,
        data: {
          'lockStatus.nextUnlockTime': unlockTime,
          'lockStatus.lockReason': 'Results processed — unlocking soon',
        },
      });
    }

    await commitInBatches(unlockOps);
    console.log(`[Phase 5] Scheduled unlock for ${unlockOps.length} teams`);

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
  if (!context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
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
