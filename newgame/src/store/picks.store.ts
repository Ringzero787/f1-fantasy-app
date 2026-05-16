// Player picks store — one PicksDoc per (user, race).

import { create } from 'zustand';
import { picksService } from '../services/picks.service';
import type { PicksDoc, Pick, SessionKey, BenSide } from '../types';

interface PicksState {
  byRaceId: Record<string, PicksDoc | null>;
  loading: Record<string, boolean>;

  load: (userId: string, raceId: string) => Promise<void>;
  pickFor: (raceId: string, session: SessionKey, entityId: string) => Pick;
  setSide: (userId: string, raceId: string, session: SessionKey, entityId: string, side: BenSide) => Promise<void>;
  setStake: (userId: string, raceId: string, session: SessionKey, entityId: string, stake: number) => Promise<void>;
  reset: () => void;
}

export const usePicksStore = create<PicksState>((set, get) => ({
  byRaceId: {},
  loading: {},

  load: async (userId, raceId) => {
    if (get().loading[raceId]) return;
    set((s) => ({ loading: { ...s.loading, [raceId]: true } }));
    try {
      const doc = await picksService.getOrCreate(userId, raceId);
      set((s) => ({
        byRaceId: { ...s.byRaceId, [raceId]: doc },
        loading: { ...s.loading, [raceId]: false },
      }));
    } catch {
      set((s) => ({ loading: { ...s.loading, [raceId]: false } }));
    }
  },

  pickFor: (raceId, session, entityId) => {
    const picks = get().byRaceId[raceId] ?? null;
    return picksService.pickFor(picks, session, entityId);
  },

  setSide: async (userId, raceId, session, entityId, side) => {
    const updated = await picksService.setSide({ userId, raceId, session, entityId, side });
    set((s) => ({ byRaceId: { ...s.byRaceId, [raceId]: updated } }));
  },

  setStake: async (userId, raceId, session, entityId, stake) => {
    const updated = await picksService.setStake({ userId, raceId, session, entityId, stake });
    set((s) => ({ byRaceId: { ...s.byRaceId, [raceId]: updated } }));
  },

  reset: () => set({ byRaceId: {}, loading: {} }),
}));
