import { create } from 'zustand';
import { raceScoresService, type RaceScore } from '../services/raceScores.service';

// Re-fetching on every Team-screen mount is wasted reads; scores only change
// when a race is scored, and pull-to-refresh forces it.
const FRESH_MS = 60 * 1000;

interface RaceScoresState {
  /** Last race scores keyed by entityId (driver/constructor) */
  lastRaceScores: Record<string, RaceScore>;
  /** The race before the last one, keyed by entityId (for ▲/▼ trends) */
  prevRaceScores: Record<string, RaceScore>;
  /** All scores keyed by entityId for trending */
  entityHistory: Record<string, RaceScore[]>;
  /** The raceId of the last completed race */
  lastRaceId: string | null;
  prevRaceId: string | null;
  lastFetched: number | null;
  /** Loading state */
  isLoading: boolean;

  /** Fetch last two races' scores (for the Team grid). `force` skips the freshness window. */
  fetchLastRaceScores: (force?: boolean) => Promise<void>;
  /** Fetch full history for an entity (for trending charts) */
  fetchEntityHistory: (entityId: string) => Promise<RaceScore[]>;
  /** Get last race score for a specific entity */
  getLastRaceScore: (entityId: string) => RaceScore | null;
}

function byEntity(scores: RaceScore[]): Record<string, RaceScore> {
  const map: Record<string, RaceScore> = {};
  for (const s of scores) map[s.entityId] = s;
  return map;
}

export const useRaceScoresStore = create<RaceScoresState>((set, get) => ({
  lastRaceScores: {},
  prevRaceScores: {},
  entityHistory: {},
  lastRaceId: null,
  prevRaceId: null,
  lastFetched: null,
  isLoading: false,

  fetchLastRaceScores: async (force = false) => {
    const { isLoading, lastFetched } = get();
    if (isLoading) return;
    if (!force && lastFetched && Date.now() - lastFetched < FRESH_MS) return;
    set({ isLoading: true });
    try {
      const latest = await raceScoresService.getLatestRound();
      if (!latest) {
        set({ lastRaceScores: {}, prevRaceScores: {}, lastRaceId: null, prevRaceId: null, lastFetched: Date.now(), isLoading: false });
        return;
      }
      const [last, prev] = await Promise.all([
        raceScoresService.getScoresForRace(latest.raceId),
        raceScoresService.getPreviousRaceScores(latest.round),
      ]);
      set({
        lastRaceScores: byEntity(last),
        prevRaceScores: byEntity(prev),
        lastRaceId: latest.raceId,
        prevRaceId: prev[0]?.raceId ?? null,
        lastFetched: Date.now(),
        isLoading: false,
      });
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
      // Record the miss so callers stop showing a loading state.
      set(state => ({ entityHistory: { ...state.entityHistory, [entityId]: state.entityHistory[entityId] ?? [] } }));
      return [];
    }
  },

  getLastRaceScore: (entityId: string) => {
    return get().lastRaceScores[entityId] ?? null;
  },
}));
