import { create } from 'zustand';
import { insuranceService } from '../services/insurance.service';
import type { RaceInsurance } from '../types';

interface InsuranceState {
  byRaceId: Record<string, RaceInsurance | null>;
  load: (userId: string, raceId: string) => Promise<void>;
  refresh: (userId: string, raceId: string) => Promise<void>;
  reset: () => void;
}

export const useInsuranceStore = create<InsuranceState>((set) => ({
  byRaceId: {},
  load: async (userId, raceId) => {
    const data = await insuranceService.getForRace(userId, raceId);
    set((s) => ({ byRaceId: { ...s.byRaceId, [raceId]: data } }));
  },
  refresh: async (userId, raceId) => {
    const data = await insuranceService.getForRace(userId, raceId);
    set((s) => ({ byRaceId: { ...s.byRaceId, [raceId]: data } }));
  },
  reset: () => set({ byRaceId: {} }),
}));
