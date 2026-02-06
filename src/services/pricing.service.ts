import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  TIER_A_THRESHOLD,
  PPM_GREAT,
  PPM_GOOD,
  PPM_POOR,
  PRICE_CHANGES,
  DNF_PRICE_PENALTY_MAX,
  DNF_PRICE_PENALTY_MIN,
} from '../config/constants';
import type { Driver, Constructor, PriceHistory } from '../types';

export type PerformanceTier = 'great' | 'good' | 'poor' | 'terrible';
export type PriceTier = 'A' | 'B';

const driversCollection = collection(db, 'drivers');
const constructorsCollection = collection(db, 'constructors');
const priceHistoryCollection = collection(db, 'priceHistory');

export const pricingService = {
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
  calculateDnfPricePenalty(dnfLap: number, totalLaps: number): number {
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
  },

  /**
   * Apply DNF price penalty to current price
   * @returns New price after penalty (minimum 50)
   */
  applyDnfPenalty(currentPrice: number, dnfLap: number, totalLaps: number): {
    newPrice: number;
    penalty: number;
  } {
    const penalty = this.calculateDnfPricePenalty(dnfLap, totalLaps);
    const newPrice = Math.max(50, currentPrice - penalty); // Minimum price of 50
    return { newPrice, penalty };
  },

  /**
   * Calculate Points Per Million (PPM) for a driver
   */
  calculatePPM(pointsScored: number, price: number): number {
    if (price === 0) return 0;
    return pointsScored / price;
  },

  /**
   * Determine performance tier based on PPM
   */
  getPerformanceTier(ppm: number): PerformanceTier {
    if (ppm >= PPM_GREAT) return 'great';
    if (ppm >= PPM_GOOD) return 'good';
    if (ppm >= PPM_POOR) return 'poor';
    return 'terrible';
  },

  /**
   * Determine price tier based on current price
   */
  getPriceTier(price: number): PriceTier {
    return price >= TIER_A_THRESHOLD ? 'A' : 'B';
  },

  /**
   * Calculate price change based on performance
   */
  calculatePriceChange(
    pointsScored: number,
    currentPrice: number
  ): { newPrice: number; change: number; ppm: number; performanceTier: PerformanceTier } {
    const ppm = this.calculatePPM(pointsScored, currentPrice);
    const performanceTier = this.getPerformanceTier(ppm);
    const priceTier = this.getPriceTier(currentPrice);

    const priceChangeMap = priceTier === 'A' ? PRICE_CHANGES.A_TIER : PRICE_CHANGES.B_TIER;
    const change = priceChangeMap[performanceTier];
    const newPrice = Math.max(50, currentPrice + change); // Minimum price of 50

    return { newPrice, change, ppm, performanceTier };
  },

  /**
   * Update driver price after race
   */
  async updateDriverPrice(
    driverId: string,
    pointsScored: number,
    raceId: string
  ): Promise<{ previousPrice: number; newPrice: number; change: number }> {
    const driverRef = doc(db, 'drivers', driverId);
    const driverDoc = await getDoc(driverRef);

    if (!driverDoc.exists()) {
      throw new Error(`Driver ${driverId} not found`);
    }

    const driver = driverDoc.data() as Driver;
    const { newPrice, change } = this.calculatePriceChange(pointsScored, driver.price);

    // Update driver price
    await updateDoc(driverRef, {
      previousPrice: driver.price,
      price: newPrice,
      fantasyPoints: driver.fantasyPoints + pointsScored,
    });

    // Record price history
    await this.recordPriceHistory({
      entityId: driverId,
      entityType: 'driver',
      price: newPrice,
      raceId,
    });

    return {
      previousPrice: driver.price,
      newPrice,
      change,
    };
  },

  /**
   * Update constructor price after race
   */
  async updateConstructorPrice(
    constructorId: string,
    pointsScored: number,
    raceId: string
  ): Promise<{ previousPrice: number; newPrice: number; change: number }> {
    const constructorRef = doc(db, 'constructors', constructorId);
    const constructorDoc = await getDoc(constructorRef);

    if (!constructorDoc.exists()) {
      throw new Error(`Constructor ${constructorId} not found`);
    }

    const constructor = constructorDoc.data() as Constructor;
    const { newPrice, change } = this.calculatePriceChange(pointsScored, constructor.price);

    // Update constructor price
    await updateDoc(constructorRef, {
      previousPrice: constructor.price,
      price: newPrice,
      fantasyPoints: constructor.fantasyPoints + pointsScored,
    });

    // Record price history
    await this.recordPriceHistory({
      entityId: constructorId,
      entityType: 'constructor',
      price: newPrice,
      raceId,
    });

    return {
      previousPrice: constructor.price,
      newPrice,
      change,
    };
  },

  /**
   * Record price history for tracking trends
   */
  async recordPriceHistory(data: Omit<PriceHistory, 'id' | 'timestamp'>): Promise<void> {
    await addDoc(priceHistoryCollection, {
      ...data,
      timestamp: serverTimestamp(),
    });
  },

  /**
   * Get price history for an entity
   */
  async getPriceHistory(
    entityId: string,
    limitCount: number = 10
  ): Promise<PriceHistory[]> {
    const q = query(
      priceHistoryCollection,
      where('entityId', '==', entityId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
      timestamp: docSnap.data().timestamp?.toDate(),
    })) as PriceHistory[];
  },

  /**
   * Calculate price trend (up, down, neutral)
   */
  getPriceTrend(currentPrice: number, previousPrice: number): 'up' | 'down' | 'neutral' {
    if (currentPrice > previousPrice) return 'up';
    if (currentPrice < previousPrice) return 'down';
    return 'neutral';
  },

  /**
   * Get price change percentage
   */
  getPriceChangePercentage(currentPrice: number, previousPrice: number): number {
    if (previousPrice === 0) return 0;
    return ((currentPrice - previousPrice) / previousPrice) * 100;
  },

  /**
   * Batch update all driver/constructor prices after a race
   */
  async batchUpdatePrices(
    raceId: string,
    scores: Array<{ entityId: string; entityType: 'driver' | 'constructor'; points: number }>
  ): Promise<void> {
    const batch = writeBatch(db);

    for (const score of scores) {
      if (score.entityType === 'driver') {
        const driverRef = doc(db, 'drivers', score.entityId);
        const driverDoc = await getDoc(driverRef);

        if (driverDoc.exists()) {
          const driver = driverDoc.data() as Driver;
          const { newPrice } = this.calculatePriceChange(score.points, driver.price);

          batch.update(driverRef, {
            previousPrice: driver.price,
            price: newPrice,
            fantasyPoints: driver.fantasyPoints + score.points,
          });
        }
      } else {
        const constructorRef = doc(db, 'constructors', score.entityId);
        const constructorDoc = await getDoc(constructorRef);

        if (constructorDoc.exists()) {
          const constructor = constructorDoc.data() as Constructor;
          const { newPrice } = this.calculatePriceChange(score.points, constructor.price);

          batch.update(constructorRef, {
            previousPrice: constructor.price,
            price: newPrice,
            fantasyPoints: constructor.fantasyPoints + score.points,
          });
        }
      }
    }

    await batch.commit();
  },
};
