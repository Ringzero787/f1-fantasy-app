import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Driver, DriverFilter } from '../types';

const driversCollection = collection(db, 'drivers');

export const driverService = {
  /**
   * Get all active drivers
   */
  async getAllDrivers(): Promise<Driver[]> {
    const q = query(
      driversCollection,
      where('isActive', '==', true),
      orderBy('price', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Driver[];
  },

  /**
   * Get driver by ID
   */
  async getDriverById(driverId: string): Promise<Driver | null> {
    const docRef = doc(db, 'drivers', driverId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return { id: docSnap.id, ...docSnap.data() } as Driver;
  },

  /**
   * Get drivers by constructor
   */
  async getDriversByConstructor(constructorId: string): Promise<Driver[]> {
    const q = query(
      driversCollection,
      where('constructorId', '==', constructorId),
      where('isActive', '==', true)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Driver[];
  },

  /**
   * Get drivers with filters
   */
  async getDriversFiltered(filter: DriverFilter): Promise<Driver[]> {
    const constraints: QueryConstraint[] = [where('isActive', '==', true)];

    if (filter.constructorId) {
      constraints.push(where('constructorId', '==', filter.constructorId));
    }

    if (filter.tier) {
      constraints.push(where('tier', '==', filter.tier));
    }

    const q = query(driversCollection, ...constraints);
    const snapshot = await getDocs(q);

    let drivers = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Driver[];

    // Apply search filter (client-side)
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      drivers = drivers.filter(
        (d) =>
          d.name.toLowerCase().includes(searchLower) ||
          d.shortName.toLowerCase().includes(searchLower)
      );
    }

    // Apply price filters (client-side)
    if (filter.minPrice !== undefined) {
      drivers = drivers.filter((d) => d.price >= filter.minPrice!);
    }
    if (filter.maxPrice !== undefined) {
      drivers = drivers.filter((d) => d.price <= filter.maxPrice!);
    }

    // Apply sorting
    if (filter.sortBy) {
      drivers.sort((a, b) => {
        let comparison = 0;

        switch (filter.sortBy) {
          case 'price':
            comparison = a.price - b.price;
            break;
          case 'points':
            comparison = a.fantasyPoints - b.fantasyPoints;
            break;
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'priceChange':
            comparison = (a.price - a.previousPrice) - (b.price - b.previousPrice);
            break;
        }

        return filter.sortOrder === 'desc' ? -comparison : comparison;
      });
    }

    return drivers;
  },

  /**
   * Get drivers by price range (for budget filtering)
   */
  async getAffordableDrivers(maxPrice: number, excludeIds: string[] = []): Promise<Driver[]> {
    const q = query(
      driversCollection,
      where('isActive', '==', true),
      where('price', '<=', maxPrice),
      orderBy('price', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as Driver)
      .filter((d) => !excludeIds.includes(d.id));
  },

  /**
   * Get top drivers by fantasy points
   */
  async getTopDrivers(limitCount: number = 10): Promise<Driver[]> {
    const q = query(
      driversCollection,
      where('isActive', '==', true),
      orderBy('fantasyPoints', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Driver[];
  },

  /**
   * Get drivers with biggest price changes
   */
  async getPriceMovers(direction: 'up' | 'down', limitCount: number = 5): Promise<Driver[]> {
    const q = query(driversCollection, where('isActive', '==', true));
    const snapshot = await getDocs(q);

    const drivers = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Driver[];

    // Calculate price change and sort
    const sorted = drivers
      .map((d) => ({
        ...d,
        priceChange: d.price - d.previousPrice,
      }))
      .sort((a, b) => {
        if (direction === 'up') {
          return b.priceChange - a.priceChange;
        }
        return a.priceChange - b.priceChange;
      })
      .slice(0, limitCount);

    return sorted;
  },

  /**
   * Subscribe to driver updates
   */
  subscribeToDrivers(callback: (drivers: Driver[]) => void) {
    const q = query(
      driversCollection,
      where('isActive', '==', true),
      orderBy('price', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const drivers = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Driver[];
      callback(drivers);
    });
  },

  /**
   * Subscribe to single driver updates
   */
  subscribeToDriver(driverId: string, callback: (driver: Driver | null) => void) {
    const docRef = doc(db, 'drivers', driverId);

    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        callback({ id: docSnap.id, ...docSnap.data() } as Driver);
      } else {
        callback(null);
      }
    });
  },
};
