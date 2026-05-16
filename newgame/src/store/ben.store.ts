// Ben lines store — caches per-race line docs across the three sessions. Keyed
// by raceId so switching races doesn't trash other races' data.

import { create } from 'zustand';
import { benService } from '../services/ben.service';
import type { BenSessionDoc, SessionKey } from '../types';

type LinesByRace = Record<
  string,
  {
    qualifying: BenSessionDoc | null;
    race: BenSessionDoc | null;
    sprint: BenSessionDoc | null;
  }
>;

interface BenState {
  byRaceId: LinesByRace;
  loading: Record<string, boolean>;
  load: (raceId: string) => Promise<void>;
  lineFor: (raceId: string, session: SessionKey, entityId: string) => ReturnType<typeof benService.lineFor>;
  reset: () => void;
}

export const useBenStore = create<BenState>((set, get) => ({
  byRaceId: {},
  loading: {},

  load: async (raceId) => {
    if (get().loading[raceId]) return;
    set((s) => ({ loading: { ...s.loading, [raceId]: true } }));
    try {
      const all = await benService.getAllForRace(raceId);
      set((s) => ({
        byRaceId: { ...s.byRaceId, [raceId]: all },
        loading: { ...s.loading, [raceId]: false },
      }));
    } catch {
      set((s) => ({ loading: { ...s.loading, [raceId]: false } }));
    }
  },

  lineFor: (raceId, session, entityId) => {
    const sessionDoc = get().byRaceId[raceId]?.[session] ?? null;
    return benService.lineFor(sessionDoc, entityId);
  },

  reset: () => set({ byRaceId: {}, loading: {} }),
}));
