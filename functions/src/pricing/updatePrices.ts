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
      const priceChange = calculatePriceChange(points, driver.price);
      const newPrice = Math.max(MIN_PRICE, driver.price + priceChange);

      driverBatch.update(driverDoc.ref, {
        previousPrice: driver.price,
        price: newPrice,
        fantasyPoints: admin.firestore.FieldValue.increment(points),
        tier: newPrice >= TIER_A_THRESHOLD ? 'A' : 'B',
      });

      // Record price history
      await db.collection('priceHistory').add({
        entityId: driverDoc.id,
        entityType: 'driver',
        price: newPrice,
        previousPrice: driver.price,
        change: priceChange,
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
      const priceChange = calculatePriceChange(points, constructor.price);
      const newPrice = Math.max(MIN_PRICE, constructor.price + priceChange);

      constructorBatch.update(constructorDoc.ref, {
        previousPrice: constructor.price,
        price: newPrice,
        fantasyPoints: admin.firestore.FieldValue.increment(points),
      });

      // Record price history
      await db.collection('priceHistory').add({
        entityId: constructorDoc.id,
        entityType: 'constructor',
        price: newPrice,
        previousPrice: constructor.price,
        change: priceChange,
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
      const team = teamDoc.data();

      // Update driver current prices
      const updatedDrivers = team.drivers.map((driver: any) => ({
        ...driver,
        currentPrice: driverPrices.get(driver.driverId) || driver.currentPrice,
      }));

      // Update constructor current price
      let updatedConstructor = team.constructor;
      if (team.constructor) {
        updatedConstructor = {
          ...team.constructor,
          currentPrice: constructorPrices.get(team.constructor.constructorId) || team.constructor.currentPrice,
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
      ) + (team.constructor?.purchasePrice || 0);
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
