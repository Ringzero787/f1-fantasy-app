import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { demoDrivers, demoConstructors, demoRaces } from '../data/demoData';
import { useTeamStore } from './team.store';
import { useLeagueStore } from './league.store';

// Race result for a single driver
export interface DriverRaceResult {
  driverId: string;
  points: number;
  position: number | null; // null = DNF/DNS
  fastestLap: boolean;
}

// Race result for a constructor
export interface ConstructorRaceResult {
  constructorId: string;
  points: number;
}

// Full race results
export interface RaceResult {
  raceId: string;
  isComplete: boolean;
  driverResults: DriverRaceResult[];
  constructorResults: ConstructorRaceResult[];
  completedAt: Date | null;
}

interface AdminState {
  raceResults: Record<string, RaceResult>; // keyed by raceId

  // Actions
  initializeRaceResult: (raceId: string) => void;
  updateDriverPoints: (raceId: string, driverId: string, points: number) => void;
  updateDriverPosition: (raceId: string, driverId: string, position: number | null) => void;
  updateDriverFastestLap: (raceId: string, driverId: string, hasFastestLap: boolean) => void;
  updateConstructorPoints: (raceId: string, constructorId: string, points: number) => void;
  markRaceComplete: (raceId: string) => void;
  resetRaceResults: (raceId: string) => void;

  // Getters
  getRaceResult: (raceId: string) => RaceResult | null;
  getDriverTotalPoints: (driverId: string) => number;
  getConstructorTotalPoints: (constructorId: string) => number;
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

      markRaceComplete: (raceId) => {
        const { raceResults } = get();
        const raceResult = raceResults[raceId];
        if (!raceResult) return;

        set({
          raceResults: {
            ...raceResults,
            [raceId]: {
              ...raceResult,
              isComplete: true,
              completedAt: new Date(),
            },
          },
        });

        // Recalculate all team points after race completion
        setTimeout(() => {
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
          const driverResult = result.driverResults.find(dr => dr.driverId === driverId);
          if (driverResult) {
            total += driverResult.points;
          }
        });
        return total;
      },

      getConstructorTotalPoints: (constructorId) => {
        const { raceResults } = get();
        let total = 0;
        Object.values(raceResults).forEach(result => {
          const constructorResult = result.constructorResults.find(cr => cr.constructorId === constructorId);
          if (constructorResult) {
            total += constructorResult.points;
          }
        });
        return total;
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
