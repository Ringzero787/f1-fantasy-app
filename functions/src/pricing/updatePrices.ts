import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Price tier thresholds
const TIER_A_THRESHOLD = 200;

// PPM (Points Per Million) thresholds
const PPM_GREAT = 0.8;
const PPM_GOOD = 0.6;
const PPM_POOR = 0.4;

// Price changes based on tier and performance
const PRICE_CHANGES = {
  A_TIER: {
    great: 15,
    good: 5,
    poor: -5,
    terrible: -15,
  },
  B_TIER: {
    great: 10,
    good: 3,
    poor: -3,
    terrible: -10,
  },
};

const MIN_PRICE = 50;

// DNF Price Penalty Configuration
// DNF on lap 1 = -10 price points
// DNF on final lap = -1 price point
const DNF_PRICE_PENALTY_MAX = 10;
const DNF_PRICE_PENALTY_MIN = 1;

type PerformanceTier = 'great' | 'good' | 'poor' | 'terrible';

/**
 * Calculate PPM (Points Per Million)
 */
function calculatePPM(points: number, price: number): number {
  if (price === 0) return 0;
  return points / price;
}

/**
 * Determine performance tier based on PPM
 */
function getPerformanceTier(ppm: number): PerformanceTier {
  if (ppm >= PPM_GREAT) return 'great';
  if (ppm >= PPM_GOOD) return 'good';
  if (ppm >= PPM_POOR) return 'poor';
  return 'terrible';
}

/**
 * Calculate price change based on performance
 */
function calculatePriceChange(points: number, currentPrice: number): number {
  const ppm = calculatePPM(points, currentPrice);
  const performanceTier = getPerformanceTier(ppm);
  const isATier = currentPrice >= TIER_A_THRESHOLD;
  const priceChangeMap = isATier ? PRICE_CHANGES.A_TIER : PRICE_CHANGES.B_TIER;

  return priceChangeMap[performanceTier];
}

/**
 * Calculate DNF price penalty based on which lap the driver retired
 * - DNF on lap 1 = maximum penalty (10 points)
 * - DNF on final lap = minimum penalty (1 point)
 * - Linear scale between based on race progress
 *
 * @param dnfLap - The lap number where the driver retired
 * @param totalLaps - Total laps in the race
 * @returns Price penalty (positive number to be subtracted from price)
 */
function calculateDnfPricePenalty(dnfLap: number, totalLaps: number): number {
  // Safety checks
  if (totalLaps <= 1) return DNF_PRICE_PENALTY_MIN;
  if (dnfLap <= 0) return DNF_PRICE_PENALTY_MAX;
  if (dnfLap >= totalLaps) return DNF_PRICE_PENALTY_MIN;

  // Calculate penalty: early DNF = higher penalty
  // Formula: min + (max - min) * (1 - progress)
  // where progress = (dnfLap - 1) / (totalLaps - 1)
  const progress = (dnfLap - 1) / (totalLaps - 1);
  const penalty = DNF_PRICE_PENALTY_MIN +
    (DNF_PRICE_PENALTY_MAX - DNF_PRICE_PENALTY_MIN) * (1 - progress);

  return Math.ceil(penalty); // Round up to ensure at least 1 point penalty
}

/**
 * Triggered after race results are processed
 * Updates driver and constructor prices based on performance
 */
export const onRaceCompleted = functions.firestore
  .document('races/{raceId}')
  .onUpdate(async (change, context) => {
    const raceId = context.params.raceId;
    const beforeData = change.before.data();
    const afterData = change.after.data();

    // Only process if race just completed
    if (beforeData.status === 'completed' || afterData.status !== 'completed') {
      return null;
    }

    const results = afterData.results;
    if (!results || !results.raceResults) {
      console.log('No race results found for pricing update');
      return null;
    }

    // Calculate points scored by each driver in this race
    const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

    const driverPoints = new Map<string, number>();
    const constructorPoints = new Map<string, number>();

    // Track DNF penalties: driverId -> { dnfLap, totalLaps }
    const driverDnfPenalties = new Map<string, number>();
    const constructorDnfPenalties = new Map<string, number>();

    // Determine total laps from race data or from results
    // Use the max laps completed by any finished driver, or fall back to race.totalLaps
    let totalLaps = afterData.totalLaps || 0;
    if (!totalLaps) {
      // Find max laps from finished drivers
      for (const result of results.raceResults) {
        if (result.status === 'finished' && result.laps > totalLaps) {
          totalLaps = result.laps;
        }
      }
    }

    // Calculate race points
    for (const result of results.raceResults) {
      let points = 0;
      if (result.status === 'finished' && result.position <= RACE_POINTS.length) {
        points = RACE_POINTS[result.position - 1];

        // Position gained bonus
        const positionsGained = result.gridPosition - result.position;
        if (positionsGained > 0) {
          points += positionsGained;
        }

        // Fastest lap
        if (result.fastestLap && result.position <= 10) {
          points += 1;
        }
      } else if (result.status === 'dnf' && totalLaps > 0) {
        // Calculate DNF price penalty for driver
        const dnfLap = result.laps || 1; // Default to lap 1 if not specified
        const dnfPenalty = calculateDnfPricePenalty(dnfLap, totalLaps);
        driverDnfPenalties.set(result.driverId, dnfPenalty);

        // Also penalize the constructor for DNF (add to existing penalty)
        const existingConstructorPenalty = constructorDnfPenalties.get(result.constructorId) || 0;
        constructorDnfPenalties.set(result.constructorId, existingConstructorPenalty + dnfPenalty);

        console.log(`DNF penalty for ${result.driverId}: -${dnfPenalty} (lap ${dnfLap}/${totalLaps})`);
      }

      driverPoints.set(result.driverId, (driverPoints.get(result.driverId) || 0) + points);

      // Accumulate constructor points
      constructorPoints.set(
        result.constructorId,
        (constructorPoints.get(result.constructorId) || 0) + points
      );
    }

    // Calculate sprint points if applicable
    if (results.sprintResults) {
      for (const result of results.sprintResults) {
        if (result.status === 'finished' && result.position <= SPRINT_POINTS.length) {
          const points = SPRINT_POINTS[result.position - 1];
          driverPoints.set(result.driverId, (driverPoints.get(result.driverId) || 0) + points);
        }
      }
    }

    // Update driver prices
    const driversSnapshot = await db.collection('drivers').where('isActive', '==', true).get();
    const driverBatch = db.batch();

    for (const driverDoc of driversSnapshot.docs) {
      const driver = driverDoc.data();
      const points = driverPoints.get(driverDoc.id) || 0;

      // Calculate performance-based price change
      const performanceChange = calculatePriceChange(points, driver.price);

      // Get DNF penalty if applicable
      const dnfPenalty = driverDnfPenalties.get(driverDoc.id) || 0;

      // Total price change: performance change minus DNF penalty
      const totalPriceChange = performanceChange - dnfPenalty;
      const newPrice = Math.max(MIN_PRICE, driver.price + totalPriceChange);

      driverBatch.update(driverDoc.ref, {
        previousPrice: driver.price,
        price: newPrice,
        fantasyPoints: admin.firestore.FieldValue.increment(points),
        tier: newPrice >= TIER_A_THRESHOLD ? 'A' : 'B',
      });

      // Record price history with DNF penalty info
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

    await driverBatch.commit();

    // Update constructor prices
    const constructorsSnapshot = await db
      .collection('constructors')
      .where('isActive', '==', true)
      .get();
    const constructorBatch = db.batch();

    for (const constructorDoc of constructorsSnapshot.docs) {
      const constructor = constructorDoc.data();
      const points = constructorPoints.get(constructorDoc.id) || 0;

      // Calculate performance-based price change
      const performanceChange = calculatePriceChange(points, constructor.price);

      // Get DNF penalty if applicable (sum of both drivers' DNF penalties)
      const dnfPenalty = constructorDnfPenalties.get(constructorDoc.id) || 0;

      // Total price change: performance change minus DNF penalty
      const totalPriceChange = performanceChange - dnfPenalty;
      const newPrice = Math.max(MIN_PRICE, constructor.price + totalPriceChange);

      constructorBatch.update(constructorDoc.ref, {
        previousPrice: constructor.price,
        price: newPrice,
        fantasyPoints: admin.firestore.FieldValue.increment(points),
      });

      // Record price history with DNF penalty info
      await db.collection('priceHistory').add({
        entityId: constructorDoc.id,
        entityType: 'constructor',
        price: newPrice,
        previousPrice: constructor.price,
        change: totalPriceChange,
        performanceChange,
        dnfPenalty,
        points,
        raceId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await constructorBatch.commit();

    // Update current prices in fantasy teams
    const teamsSnapshot = await db.collection('fantasyTeams').get();
    const teamBatch = db.batch();

    // Create price lookup maps
    const driverPrices = new Map<string, number>();
    const updatedDriversSnapshot = await db.collection('drivers').get();
    updatedDriversSnapshot.docs.forEach((doc) => {
      driverPrices.set(doc.id, doc.data().price);
    });

    const constructorPrices = new Map<string, number>();
    const updatedConstructorsSnapshot = await db.collection('constructors').get();
    updatedConstructorsSnapshot.docs.forEach((doc) => {
      constructorPrices.set(doc.id, doc.data().price);
    });

    for (const teamDoc of teamsSnapshot.docs) {
      const team = teamDoc.data() as Record<string, any>;

      // Update driver current prices
      const updatedDrivers = team.drivers.map((driver: any) => ({
        ...driver,
        currentPrice: driverPrices.get(driver.driverId) || driver.currentPrice,
      }));

      // Update constructor current price
      const teamConstructor = team['constructor'] as any;
      let updatedConstructor = teamConstructor;
      if (teamConstructor) {
        updatedConstructor = {
          ...teamConstructor,
          currentPrice: constructorPrices.get(teamConstructor.constructorId) || teamConstructor.currentPrice,
        };
      }

      // Recalculate budget
      const totalDriverValue = updatedDrivers.reduce(
        (sum: number, d: any) => sum + d.currentPrice,
        0
      );
      const constructorValue = updatedConstructor?.currentPrice || 0;
      const totalSpent = team.totalSpent;
      const originalValue = team.drivers.reduce(
        (sum: number, d: any) => sum + d.purchasePrice,
        0
      ) + (teamConstructor?.purchasePrice || 0);
      const valueChange = (totalDriverValue + constructorValue) - originalValue;
      const newBudget = 1000 - totalSpent + valueChange;

      teamBatch.update(teamDoc.ref, {
        drivers: updatedDrivers,
        constructor: updatedConstructor,
        budget: Math.round(newBudget),
      });
    }

    await teamBatch.commit();

    console.log(`Updated prices after race ${raceId}`);
    return null;
  });

/**
 * Get price history for a driver or constructor
 */
export const getPriceHistory = functions.https.onCall(async (data, context) => {
  const { entityId, entityType, limit = 10 } = data;

  if (!entityId || !entityType) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'entityId and entityType are required'
    );
  }

  const historySnapshot = await db
    .collection('priceHistory')
    .where('entityId', '==', entityId)
    .where('entityType', '==', entityType)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return historySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate(),
  }));
});
