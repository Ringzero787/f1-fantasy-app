// Player picks store. Reads come from an onSnapshot listener (subscribe()).
// Writes go through the server-authoritative tlSetPick callable (a stake
// escrows real cash). setSide/setStake apply an optimistic local patch first so
// the UI updates instantly, then push the write; the snapshot listener
// reconciles to server truth, and a failed write rolls the patch back.

import { create } from 'zustand';
import { picksService } from '../services/picks.service';
import type { PicksDoc, Pick, SessionKey, BenSide } from '../types';

// Return a copy of the picks doc with one entity's side/stake patched. Used for
// the optimistic update; the server write is still authoritative.
function patchPick(
  doc: PicksDoc | null,
  session: SessionKey,
  entityId: string,
  patch: Partial<Pick>,
): PicksDoc {
  const base: PicksDoc =
    doc ?? ({ picks: {} } as unknown as PicksDoc);
  const picks = { ...(base.picks ?? {}) } as PicksDoc['picks'];
  const sessionPicks = { ...(picks?.[session] ?? {}) };
  const existing = sessionPicks[entityId] ?? { side: 'with', stake: 0 };
  sessionPicks[entityId] = { ...existing, ...patch };
  picks[session] = sessionPicks;
  return { ...base, picks };
}

// Optimistically remove one entity's pick (return it to "no selection").
function removePick(doc: PicksDoc | null, session: SessionKey, entityId: string): PicksDoc | null {
  if (!doc?.picks?.[session]?.[entityId]) return doc;
  const picks = { ...(doc.picks ?? {}) } as PicksDoc['picks'];
  const sessionPicks = { ...(picks?.[session] ?? {}) };
  delete sessionPicks[entityId];
  picks[session] = sessionPicks;
  return { ...doc, picks };
}

interface PicksState {
  byRaceId: Record<string, PicksDoc | null>;

  /** Subscribe to the user's picks doc for a race. Returns an unsubscribe
   *  function — call it when the screen unmounts. Safe to call repeatedly
   *  for the same (userId, raceId); subsequent calls return new
   *  subscriptions, so callers must manage the cleanup. */
  subscribe: (userId: string, raceId: string) => () => void;

  pickFor: (raceId: string, session: SessionKey, entityId: string) => Pick | null;
  clearPick: (
    userId: string,
    raceId: string,
    session: SessionKey,
    entityId: string,
  ) => Promise<void>;
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

  clearPick: async (userId, raceId, session, entityId) => {
    const prior = get().byRaceId[raceId] ?? null;
    set((s) => ({ byRaceId: { ...s.byRaceId, [raceId]: removePick(prior, session, entityId) } }));
    try {
      await picksService.clearPick({ userId, raceId, session, entityId });
    } catch (err) {
      set((s) => ({ byRaceId: { ...s.byRaceId, [raceId]: prior } }));
      console.error('[tl] clearPick.fail', { entityId, err: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  setSide: async (userId, raceId, session, entityId, side) => {
    const prior = get().byRaceId[raceId] ?? null;
    set((s) => ({ byRaceId: { ...s.byRaceId, [raceId]: patchPick(prior, session, entityId, { side }) } }));
    try {
      await picksService.setSide({ userId, raceId, session, entityId, side });
    } catch (err) {
      set((s) => ({ byRaceId: { ...s.byRaceId, [raceId]: prior } }));
      console.error('[tl] setSide.fail', { entityId, side, err: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  setStake: async (userId, raceId, session, entityId, stake) => {
    const prior = get().byRaceId[raceId] ?? null;
    set((s) => ({ byRaceId: { ...s.byRaceId, [raceId]: patchPick(prior, session, entityId, { stake }) } }));
    try {
      await picksService.setStake({ userId, raceId, session, entityId, stake });
    } catch (err) {
      set((s) => ({ byRaceId: { ...s.byRaceId, [raceId]: prior } }));
      console.error('[tl] setStake.fail', { entityId, stake, err: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  reset: () => set({ byRaceId: {} }),
}));
