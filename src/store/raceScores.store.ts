import { create } from 'zustand';
import { raceScoresService, type RaceScore } from '../services/raceScores.service';

interface RaceScoresState {
  /** Last race scores keyed by entityId (driver/constructor) */
  lastRaceScores: Record<string, RaceScore>;
  /** All scores keyed by entityId for trending */
  entityHistory: Record<string, RaceScore[]>;
  /** The raceId of the last completed race */
  lastRaceId: string | null;
  /** Loading state */
  isLoading: boolean;

  /** Fetch last race scores (for My Team page) */
  fetchLastRaceScores: () => Promise<void>;
  /** Fetch full history for an entity (for trending charts) */
  fetchEntityHistory: (entityId: string) => Promise<RaceScore[]>;
  /** Get last race score for a specific entity */
  getLastRaceScore: (entityId: string) => RaceScore | null;
}

export const useRaceScoresStore = create<RaceScoresState>((set, get) => ({
  lastRaceScores: {},
  entityHistory: {},
  lastRaceId: null,
  isLoading: false,

  fetchLastRaceScores: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const scores = await raceScoresService.getLatestRaceScores();
      const map: Record<string, RaceScore> = {};
      let raceId: string | null = null;
      for (const s of scores) {
        map[s.entityId] = s;
        raceId = s.raceId;
      }
      set({ lastRaceScores: map, lastRaceId: raceId, isLoading: false });
    } catch (e) {
      console.warn('[RaceScores] Failed to fetch last race scores:', e);
      set({ isLoading: false });
    }
  },

  fetchEntityHistory: async (entityId: string) => {
    try {
      const scores = await raceScoresService.getScoresForEntity(entityId);
      set(state => ({
        entityHistory: { ...state.entityHistory, [entityId]: scores },
      }));
      return scores;
    } catch (e) {
      console.warn('[RaceScores] Failed to fetch entity history:', e);
      return [];
    }
  },

  getLastRaceScore: (entityId: string) => {
    return get().lastRaceScores[entityId] ?? null;
  },
}));
