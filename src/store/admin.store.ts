import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { demoDrivers, demoConstructors, demoRaces } from '../data/demoData';
// Note: useTeamStore is imported dynamically to avoid circular dependency
import { pricingService } from '../services/pricing.service';

// Price update tracking for demo mode
export interface PriceUpdate {
  previousPrice: number;
  currentPrice: number;
  lastRaceId: string;
  totalPoints: number; // Season points for this entity
}

// Race result for a single driver
export interface DriverRaceResult {
  driverId: string;
  points: number;
  position: number | null; // null = DNF/DNS
  fastestLap: boolean;
  dnf?: boolean; // Did Not Finish flag
}

// Sprint result for a single driver
export interface DriverSprintResult {
  driverId: string;
  points: number;
  position: number | null;
  dnf?: boolean; // Did Not Finish flag
}

// Race result for a constructor
export interface ConstructorRaceResult {
  constructorId: string;
  points: number;
}

// Sprint result for a constructor
export interface ConstructorSprintResult {
  constructorId: string;
  points: number;
}

// Full race results
export interface RaceResult {
  raceId: string;
  isComplete: boolean;
  driverResults: DriverRaceResult[];
  constructorResults: ConstructorRaceResult[];
  sprintResults?: DriverSprintResult[];
  sprintConstructorResults?: ConstructorSprintResult[];
  completedAt: Date | null;
}

// Cloud sync tracking per race
export interface CloudSyncInfo {
  syncedAt: string;
  version: number;
}

interface AdminState {
  raceResults: Record<string, RaceResult>; // keyed by raceId

  // Price tracking for demo mode (keyed by driver/constructor ID)
  driverPrices: Record<string, PriceUpdate>;
  constructorPrices: Record<string, PriceUpdate>;

  // Cloud sync tracking (keyed by raceId)
  cloudSyncedRaces: Record<string, CloudSyncInfo>;

  // V5: Lockout override for testing
  adminLockOverride: 'locked' | 'unlocked' | null;

  // Actions
  initializeRaceResult: (raceId: string) => void;
  updateDriverPoints: (raceId: string, driverId: string, points: number) => void;
  updateDriverPosition: (raceId: string, driverId: string, position: number | null) => void;
  updateDriverFastestLap: (raceId: string, driverId: string, hasFastestLap: boolean) => void;
  updateDriverDnf: (raceId: string, driverId: string, dnf: boolean) => void;
  updateConstructorPoints: (raceId: string, constructorId: string, points: number) => void;
  updateSprintDriverPoints: (raceId: string, driverId: string, points: number) => void;
  updateSprintDriverDnf: (raceId: string, driverId: string, dnf: boolean) => void;
  updateSprintConstructorPoints: (raceId: string, constructorId: string, points: number) => void;
  markRaceComplete: (raceId: string) => void;
  resetRaceResults: (raceId: string) => void;

  // Getters
  getRaceResult: (raceId: string) => RaceResult | null;
  getDriverTotalPoints: (driverId: string) => number;
  getConstructorTotalPoints: (constructorId: string) => number;
  getDriverPrice: (driverId: string) => PriceUpdate | null;
  getConstructorPrice: (constructorId: string) => PriceUpdate | null;
  getCompletedRaceCount: () => number;

  // V5: Lockout override
  setAdminLockOverride: (override: 'locked' | 'unlocked' | null) => void;

  // Cloud sync tracking
  markRaceCloudSynced: (raceId: string) => void;
  isRaceCloudSynced: (raceId: string) => boolean;
  incrementSyncVersion: (raceId: string) => void;

  // Reset prices only (keeps race results)
  resetPrices: () => void;

  // Reset all race results only (keeps prices and teams)
  resetAllRaceResults: () => void;

  // Reset all cached data
  resetAllData: () => void;
}

// Initialize empty race result with all drivers and constructors
const createEmptyRaceResult = (raceId: string): RaceResult => ({
  raceId,
  isComplete: false,
  driverResults: demoDrivers.map(driver => ({
    driverId: driver.id,
    points: 0,
    position: null,
    fastestLap: false,
  })),
  constructorResults: demoConstructors.map(constructor => ({
    constructorId: constructor.id,
    points: 0,
  })),
  completedAt: null,
});

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      raceResults: {},
      driverPrices: {},
      constructorPrices: {},
      cloudSyncedRaces: {},
      adminLockOverride: null,

      initializeRaceResult: (raceId) => {
        const { raceResults } = get();
        if (!raceResults[raceId]) {
          set({
            raceResults: {
              ...raceResults,
              [raceId]: createEmptyRaceResult(raceId),
            },
          });
        }
      },

      updateDriverPoints: (raceId, driverId, points) => {
        const { raceResults } = get();
        const raceResult = raceResults[raceId];
        if (!raceResult) return;

        const updatedDriverResults = raceResult.driverResults.map(dr =>
          dr.driverId === driverId ? { ...dr, points } : dr
        );

        set({
          raceResults: {
            ...raceResults,
            [raceId]: {
              ...raceResult,
              driverResults: updatedDriverResults,
            },
          },
        });
      },

      updateDriverPosition: (raceId, driverId, position) => {
        const { raceResults } = get();
        const raceResult = raceResults[raceId];
        if (!raceResult) return;

        const updatedDriverResults = raceResult.driverResults.map(dr =>
          dr.driverId === driverId ? { ...dr, position } : dr
        );

        set({
          raceResults: {
            ...raceResults,
            [raceId]: {
              ...raceResult,
              driverResults: updatedDriverResults,
            },
          },
        });
      },

      updateDriverFastestLap: (raceId, driverId, hasFastestLap) => {
        const { raceResults } = get();
        const raceResult = raceResults[raceId];
        if (!raceResult) return;

        // Only one driver can have fastest lap
        const updatedDriverResults = raceResult.driverResults.map(dr => ({
          ...dr,
          fastestLap: dr.driverId === driverId ? hasFastestLap : (hasFastestLap ? false : dr.fastestLap),
        }));

        set({
          raceResults: {
            ...raceResults,
            [raceId]: {
              ...raceResult,
              driverResults: updatedDriverResults,
            },
          },
        });
      },

      updateDriverDnf: (raceId, driverId, dnf) => {
        const { raceResults } = get();
        const raceResult = raceResults[raceId];
        if (!raceResult) return;

        const updatedDriverResults = raceResult.driverResults.map(dr =>
          dr.driverId === driverId ? { ...dr, dnf, points: dnf ? 0 : dr.points } : dr
        );

        set({
          raceResults: {
            ...raceResults,
            [raceId]: {
              ...raceResult,
              driverResults: updatedDriverResults,
            },
          },
        });
      },

      updateConstructorPoints: (raceId, constructorId, points) => {
        const { raceResults } = get();
        const raceResult = raceResults[raceId];
        if (!raceResult) return;

        const updatedConstructorResults = raceResult.constructorResults.map(cr =>
          cr.constructorId === constructorId ? { ...cr, points } : cr
        );

        set({
          raceResults: {
            ...raceResults,
            [raceId]: {
              ...raceResult,
              constructorResults: updatedConstructorResults,
            },
          },
        });
      },

      updateSprintDriverPoints: (raceId, driverId, points) => {
        const { raceResults } = get();
        const raceResult = raceResults[raceId];
        if (!raceResult) return;

        // Initialize sprint results if not present
        const sprintResults = raceResult.sprintResults || demoDrivers.map(d => ({
          driverId: d.id,
          points: 0,
          position: null,
        }));

        const updatedSprintResults = sprintResults.map(sr =>
          sr.driverId === driverId ? { ...sr, points } : sr
        );

        set({
          raceResults: {
            ...raceResults,
            [raceId]: {
              ...raceResult,
              sprintResults: updatedSprintResults,
            },
          },
        });
      },

      updateSprintDriverDnf: (raceId, driverId, dnf) => {
        const { raceResults } = get();
        const raceResult = raceResults[raceId];
        if (!raceResult) return;

        // Initialize sprint results if not present
        const sprintResults = raceResult.sprintResults || demoDrivers.map(d => ({
          driverId: d.id,
          points: 0,
          position: null,
        }));

        const updatedSprintResults = sprintResults.map(sr =>
          sr.driverId === driverId ? { ...sr, dnf, points: dnf ? 0 : sr.points } : sr
        );

        set({
          raceResults: {
            ...raceResults,
            [raceId]: {
              ...raceResult,
              sprintResults: updatedSprintResults,
            },
          },
        });
      },

      updateSprintConstructorPoints: (raceId, constructorId, points) => {
        const { raceResults } = get();
        const raceResult = raceResults[raceId];
        if (!raceResult) return;

        // Initialize sprint constructor results if not present
        const sprintConstructorResults = raceResult.sprintConstructorResults || demoConstructors.map(c => ({
          constructorId: c.id,
          points: 0,
        }));

        const updatedSprintConstructorResults = sprintConstructorResults.map(scr =>
          scr.constructorId === constructorId ? { ...scr, points } : scr
        );

        set({
          raceResults: {
            ...raceResults,
            [raceId]: {
              ...raceResult,
              sprintConstructorResults: updatedSprintConstructorResults,
            },
          },
        });
      },

      markRaceComplete: (raceId) => {
        const { raceResults, driverPrices, constructorPrices } = get();
        const raceResult = raceResults[raceId];
        if (!raceResult) return;

        // Calculate new driver prices based on race performance
        const newDriverPrices: Record<string, PriceUpdate> = { ...driverPrices };
        raceResult.driverResults.forEach(dr => {
          // Get current price (from updates or original demo data)
          const existingUpdate = driverPrices[dr.driverId];
          const baseDriver = demoDrivers.find(d => d.id === dr.driverId);
          const currentPrice = existingUpdate?.currentPrice ?? baseDriver?.price ?? 100;
          const previousTotalPoints = existingUpdate?.totalPoints ?? 0;

          // Calculate race + sprint points for this driver
          let racePoints = dr.points;
          const sprintResult = raceResult.sprintResults?.find(sr => sr.driverId === dr.driverId);
          if (sprintResult) {
            racePoints += sprintResult.points;
          }

          // Calculate new price using pricing service logic
          const { newPrice } = pricingService.calculatePriceChange(racePoints, currentPrice);

          newDriverPrices[dr.driverId] = {
            previousPrice: currentPrice,
            currentPrice: newPrice,
            lastRaceId: raceId,
            totalPoints: previousTotalPoints + racePoints,
          };
        });

        // Calculate new constructor prices based on race performance
        const newConstructorPrices: Record<string, PriceUpdate> = { ...constructorPrices };
        raceResult.constructorResults.forEach(cr => {
          // Get current price (from updates or original demo data)
          const existingUpdate = constructorPrices[cr.constructorId];
          const baseConstructor = demoConstructors.find(c => c.id === cr.constructorId);
          const currentPrice = existingUpdate?.currentPrice ?? baseConstructor?.price ?? 100;
          const previousTotalPoints = existingUpdate?.totalPoints ?? 0;

          // Calculate race + sprint points for this constructor
          let racePoints = cr.points;
          const sprintResult = raceResult.sprintConstructorResults?.find(scr => scr.constructorId === cr.constructorId);
          if (sprintResult) {
            racePoints += sprintResult.points;
          }

          // Calculate new price using pricing service logic
          const { newPrice } = pricingService.calculatePriceChange(racePoints, currentPrice);

          newConstructorPrices[cr.constructorId] = {
            previousPrice: currentPrice,
            currentPrice: newPrice,
            lastRaceId: raceId,
            totalPoints: previousTotalPoints + racePoints,
          };
        });

        set({
          raceResults: {
            ...raceResults,
            [raceId]: {
              ...raceResult,
              isComplete: true,
              completedAt: new Date(),
            },
          },
          driverPrices: newDriverPrices,
          constructorPrices: newConstructorPrices,
        });

        // Recalculate all team points after race completion
        // Dynamic import to avoid circular dependency
        setTimeout(() => {
          const { useTeamStore } = require('./team.store');
          useTeamStore.getState().recalculateAllTeamsPoints();
        }, 100);
      },

      resetRaceResults: (raceId) => {
        const { raceResults } = get();
        set({
          raceResults: {
            ...raceResults,
            [raceId]: createEmptyRaceResult(raceId),
          },
        });
      },

      getRaceResult: (raceId) => {
        const { raceResults } = get();
        return raceResults[raceId] || null;
      },

      getDriverTotalPoints: (driverId) => {
        const { raceResults } = get();
        let total = 0;
        Object.values(raceResults).forEach(result => {
          // Add race points
          const driverResult = result.driverResults.find(dr => dr.driverId === driverId);
          if (driverResult) {
            total += driverResult.points;
          }
          // Add sprint points
          const sprintResult = result.sprintResults?.find(sr => sr.driverId === driverId);
          if (sprintResult) {
            total += sprintResult.points;
          }
        });
        return total;
      },

      getConstructorTotalPoints: (constructorId) => {
        const { raceResults } = get();
        let total = 0;
        Object.values(raceResults).forEach(result => {
          // Add race points
          const constructorResult = result.constructorResults.find(cr => cr.constructorId === constructorId);
          if (constructorResult) {
            total += constructorResult.points;
          }
          // Add sprint points
          const sprintConstructorResult = result.sprintConstructorResults?.find(scr => scr.constructorId === constructorId);
          if (sprintConstructorResult) {
            total += sprintConstructorResult.points;
          }
        });
        return total;
      },

      getDriverPrice: (driverId) => {
        const { driverPrices } = get();
        return driverPrices[driverId] || null;
      },

      getConstructorPrice: (constructorId) => {
        const { constructorPrices } = get();
        return constructorPrices[constructorId] || null;
      },

      getCompletedRaceCount: () => {
        return Object.values(get().raceResults).filter(r => r.isComplete).length;
      },

      setAdminLockOverride: (override) => {
        set({ adminLockOverride: override });
      },

      markRaceCloudSynced: (raceId) => {
        const { cloudSyncedRaces } = get();
        const existing = cloudSyncedRaces[raceId];
        set({
          cloudSyncedRaces: {
            ...cloudSyncedRaces,
            [raceId]: {
              syncedAt: new Date().toISOString(),
              version: (existing?.version ?? 0) + 1,
            },
          },
        });
      },

      isRaceCloudSynced: (raceId) => {
        return !!get().cloudSyncedRaces[raceId];
      },

      incrementSyncVersion: (raceId) => {
        const { cloudSyncedRaces } = get();
        const existing = cloudSyncedRaces[raceId];
        if (!existing) return;
        set({
          cloudSyncedRaces: {
            ...cloudSyncedRaces,
            [raceId]: {
              ...existing,
              syncedAt: new Date().toISOString(),
              version: existing.version + 1,
            },
          },
        });
      },

      // Reset prices only, keeping race results intact
      resetPrices: () => {
        console.log('Resetting all driver/constructor prices to initial values...');
        set({
          driverPrices: {},
          constructorPrices: {},
        });
      },

      // Reset all race results only (keeps prices and teams)
      resetAllRaceResults: () => {
        console.log('Resetting all race results...');
        set({ raceResults: {} });
        console.log('All race results reset');
      },

      // Reset all cached data to fresh state
      resetAllData: () => {
        console.log('Resetting all admin data...');
        set({
          raceResults: {},
          driverPrices: {},
          constructorPrices: {},
          cloudSyncedRaces: {},
          adminLockOverride: null,
        });
        console.log('Admin data reset complete');
      },
    }),
    {
      name: 'admin-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert date strings back to Date objects
          Object.keys(state.raceResults).forEach(raceId => {
            const result = state.raceResults[raceId];
            if (result.completedAt) {
              result.completedAt = new Date(result.completedAt);
            }
          });
        }
      },
    }
  )
);
