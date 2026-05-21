// Player picks store. Firestore is the source of truth — subscribe() attaches
// an onSnapshot listener, and the snapshot callback is the ONLY thing that
// writes to byRaceId. setSide/setStake just push a Firestore write; the
// snapshot listener pushes the new state back to the store automatically
// (with the Firestore SDK's built-in latency compensation, so it's instant).

import { create } from 'zustand';
import { picksService } from '../services/picks.service';
import type { PicksDoc, Pick, SessionKey, BenSide } from '../types';

interface PicksState {
  byRaceId: Record<string, PicksDoc | null>;

  /** Subscribe to the user's picks doc for a race. Returns an unsubscribe
   *  function — call it when the screen unmounts. Safe to call repeatedly
   *  for the same (userId, raceId); subsequent calls return new
   *  subscriptions, so callers must manage the cleanup. */
  subscribe: (userId: string, raceId: string) => () => void;

  pickFor: (raceId: string, session: SessionKey, entityId: string) => Pick;
  setSide: (
    userId: string,
    raceId: string,
    session: SessionKey,
    entityId: string,
    side: BenSide,
  ) => Promise<void>;
  setStake: (
    userId: string,
    raceId: string,
    session: SessionKey,
    entityId: string,
    stake: number,
  ) => Promise<void>;
  reset: () => void;
}

export const usePicksStore = create<PicksState>((set, get) => ({
  byRaceId: {},

  subscribe: (userId, raceId) => {
    const unsub = picksService.subscribe(userId, raceId, (doc) => {
      set((s) => ({ byRaceId: { ...s.byRaceId, [raceId]: doc } }));
    });
    return unsub;
  },

  pickFor: (raceId, session, entityId) => {
    const picks = get().byRaceId[raceId] ?? null;
    return picksService.pickFor(picks, session, entityId);
  },

  setSide: async (userId, raceId, session, entityId, side) => {
    try {
      await picksService.setSide({ userId, raceId, session, entityId, side });
    } catch (err) {
      console.error('[tl] setSide.fail', { entityId, side, err: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  setStake: async (userId, raceId, session, entityId, stake) => {
    try {
      await picksService.setStake({ userId, raceId, session, entityId, stake });
    } catch (err) {
      console.error('[tl] setStake.fail', { entityId, stake, err: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  reset: () => set({ byRaceId: {} }),
}));
