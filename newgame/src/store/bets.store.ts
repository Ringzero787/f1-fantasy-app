import { create } from 'zustand';
import { betsService } from '../services/bets.service';
import type { RaceBets } from '../types';

interface BetsState {
  byRaceId: Record<string, RaceBets | null>;
  load: (userId: string, raceId: string) => Promise<void>;
  refresh: (userId: string, raceId: string) => Promise<void>;
  reset: () => void;
}

export const useBetsStore = create<BetsState>((set) => ({
  byRaceId: {},
  load: async (userId, raceId) => {
    const data = await betsService.getForRace(userId, raceId);
    set((s) => ({ byRaceId: { ...s.byRaceId, [raceId]: data } }));
  },
  refresh: async (userId, raceId) => {
    const data = await betsService.getForRace(userId, raceId);
    set((s) => ({ byRaceId: { ...s.byRaceId, [raceId]: data } }));
  },
  reset: () => set({ byRaceId: {} }),
}));
