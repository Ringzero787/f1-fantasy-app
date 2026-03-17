import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { demoDrivers, demoConstructors, demoRaces } from '../data/demoData';
// Note: useTeamStore is imported dynamically to avoid circular dependency
import { pricingService } from '../services/pricing.service';
import { getMarketSnapshot } from '../services/marketCache.service';

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

  // Load prices from server-side market cache (single doc read)
  loadMarketCache: () => Promise<boolean>;

  // Sync completed race IDs from Firestore so client lockout stays accurate
  syncCompletedRaces: () => Promise<void>;

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

      // Load prices from server-side market cache (single doc read instead of 20+ individual reads).
      // Falls back to false if cache doesn't exist yet — caller should use existing individual-read methods.
      loadMarketCache: async () => {
        try {
          const snapshot = await getMarketSnapshot();
          if (!snapshot) return false;

          const newDriverPrices: Record<string, PriceUpdate> = {};
          for (const d of snapshot.drivers) {
            newDriverPrices[d.id] = {
              previousPrice: d.previousPrice,
              currentPrice: d.price,
              lastRaceId: '',
              totalPoints: d.fantasyPoints,
            };
          }

          const newConstructorPrices: Record<string, PriceUpdate> = {};
          for (const c of snapshot.constructors) {
            newConstructorPrices[c.id] = {
              previousPrice: c.previousPrice,
              currentPrice: c.price,
              lastRaceId: '',
              totalPoints: c.fantasyPoints,
            };
          }

          set({
            driverPrices: newDriverPrices,
            constructorPrices: newConstructorPrices,
          });
          return true;
        } catch (e) {
          console.warn('Failed to load market cache, falling back to individual reads:', e);
          return false;
        }
      },

      // Sync completed race IDs from Firestore so client lockout logic stays accurate
      // Also populates per-driver/constructor point breakdowns for "last race" display
      syncCompletedRaces: async () => {
        try {
          const { collection, query, where, getDocs } = await import('firebase/firestore');
          const { db } = await import('../config/firebase');
          const {
            RACE_POINTS, SPRINT_POINTS, GRID_SIZE, FASTEST_LAP_BONUS,
            POSITION_GAINED_BONUS, DNF_PENALTY, SPRINT_DNF_PENALTY,
          } = await import('../config/constants');
          const racesRef = collection(db, 'races');
          const q = query(racesRef, where('status', '==', 'completed'));
          const snap = await getDocs(q);

          const { raceResults } = get();
          let updated = false;
          const newResults = { ...raceResults };

          for (const doc of snap.docs) {
            const raceId = doc.id;
            const data = doc.data();
            const results = data.results;

            // Skip if already fully populated (has non-zero driver points)
            const existing = newResults[raceId];
            if (existing?.isComplete && existing.driverResults.some(dr => dr.points !== 0)) {
              continue;
            }

            // Compute per-driver race points from results
            const driverResults: DriverRaceResult[] = demoDrivers.map(driver => {
              const rr = results?.raceResults?.find((r: any) => r.driverId === driver.id);
              if (!rr) return { driverId: driver.id, points: 0, position: null, fastestLap: false };

              if (rr.status === 'dnf' || rr.status === 'dsq') {
                return { driverId: driver.id, points: DNF_PENALTY, position: null, fastestLap: false, dnf: true };
              }

              let pts = 0;
              // Position points
              if (rr.position >= 1 && rr.position <= RACE_POINTS.length) {
                pts += RACE_POINTS[rr.position - 1];
              }
              // Position bonus (reverse-grid)
              if (rr.position >= 1 && rr.position <= GRID_SIZE) {
                pts += GRID_SIZE + 1 - rr.position;
              }
              // Positions gained/lost
              const posGained = (rr.gridPosition || rr.position) - rr.position;
              if (posGained > 0) pts += posGained * POSITION_GAINED_BONUS;
              if (posGained < 0) pts += posGained; // penalty
              // Fastest lap
              if (rr.fastestLap && rr.position <= 10) pts += FASTEST_LAP_BONUS;

              return { driverId: driver.id, points: pts, position: rr.position, fastestLap: !!rr.fastestLap };
            });

            // Compute per-driver sprint points
            let sprintResults: DriverSprintResult[] | undefined;
            if (results?.sprintResults?.length > 0) {
              sprintResults = demoDrivers.map(driver => {
                const sr = results.sprintResults.find((r: any) => r.driverId === driver.id);
                if (!sr) return { driverId: driver.id, points: 0, position: null };

                if (sr.status === 'dnf' || sr.status === 'dsq') {
                  return { driverId: driver.id, points: SPRINT_DNF_PENALTY, position: null, dnf: true };
                }

                let pts = 0;
                if (sr.position >= 1 && sr.position <= SPRINT_POINTS.length) {
                  pts += SPRINT_POINTS[sr.position - 1];
                }
                return { driverId: driver.id, points: pts, position: sr.position };
              });
            }

            // Compute constructor points (sum of both drivers' points)
            const constructorResults: ConstructorRaceResult[] = demoConstructors.map(c => {
              const cDrivers = driverResults.filter(dr => {
                const rr = results?.raceResults?.find((r: any) => r.driverId === dr.driverId);
                return rr?.constructorId === c.id;
              });
              return { constructorId: c.id, points: cDrivers.reduce((sum, d) => sum + d.points, 0) };
            });

            let sprintConstructorResults: ConstructorSprintResult[] | undefined;
            if (sprintResults) {
              sprintConstructorResults = demoConstructors.map(c => {
                // For sprint we need to match drivers to constructors via raceResults (sprint doesn't have constructorId)
                const cDriverIds = results?.raceResults
                  ?.filter((r: any) => r.constructorId === c.id)
                  .map((r: any) => r.driverId) || [];
                const cSprints = sprintResults!.filter(sr => cDriverIds.includes(sr.driverId));
                return { constructorId: c.id, points: cSprints.reduce((sum, s) => sum + s.points, 0) };
              });
            }

            newResults[raceId] = {
              raceId,
              isComplete: true,
              driverResults,
              constructorResults,
              sprintResults,
              sprintConstructorResults,
              completedAt: new Date(),
            };
            updated = true;
          }

          if (updated) {
            set({ raceResults: newResults });
            console.log('[syncCompletedRaces] Synced completed races with point breakdowns');
          }
        } catch (e) {
          console.warn('[syncCompletedRaces] Failed:', e);
        }
      },

      // Reset prices only, keeping race results intact
      resetPrices: () => {
        console.log('Resetting all driver/constructor prices to initial values...');
        set({
          driverPrices: {},
          constructorPrices: {},
        });
      },

      // Reset all race results and prices (prices are derived from races, so both must reset together)
      resetAllRaceResults: () => {
        console.log('Resetting all race results and prices...');
        set({ raceResults: {}, driverPrices: {}, constructorPrices: {} });
        console.log('All race results and prices reset');
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
