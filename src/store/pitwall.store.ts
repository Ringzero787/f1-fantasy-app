/**
 * Pit Wall state shared across the app (F-077): the pass on the user's token and, for pass
 * holders, the published projections for the coming round.
 *
 * Not persisted. The pass is an auth claim and the projections change every refresh, so a stale
 * copy restored from disk would mark the wrong picks. Both reload on sign-in and on a pull to
 * refresh; everything stays hidden until they arrive.
 */
import { create } from 'zustand';
import { loadPass, loadProjections } from '../pitwall/client';
import { NO_PASS, type PassState } from '../pitwall/pass';
import type { Projection, ProjectionSet } from '../pitwall/projections';

interface PitWallState {
  pass: PassState;
  projections: ProjectionSet | null;
  loading: boolean;
  /** Read the pass, then the projections if it is active. `force` refreshes the auth token. */
  refresh: (force?: boolean) => Promise<void>;
  clear: () => void;
  /** The projection for one driver or constructor, or null without a pass. */
  projectionFor: (id: string) => Projection | null;
}

// Increments per refresh so an overtaken run cannot write its older answer.
let seq = 0;

export const usePitWallStore = create<PitWallState>()((set, get) => ({
  pass: NO_PASS,
  projections: null,
  loading: false,

  refresh: async (force = false) => {
    // A forced refresh is never dropped. It is what runs when the browser closes after a purchase,
    // and the ordinary refresh it would collide with is exactly the one holding a stale token.
    if (get().loading && !force) return;
    const ticket = seq + 1;
    seq = ticket;
    set({ loading: true });
    try {
      const pass = await loadPass(force);
      // No pass, no read: the rules would refuse it anyway, and asking wastes a round trip.
      const projections = pass.active ? await loadProjections() : null;
      // A slower earlier run must not overwrite a newer answer.
      if (ticket === seq) set({ pass, projections, loading: false });
    } catch {
      if (ticket === seq) set({ pass: NO_PASS, projections: null, loading: false });
    }
  },

  clear: () => { seq += 1; set({ pass: NO_PASS, projections: null, loading: false }); },

  projectionFor: (id: string) => {
    const { pass, projections } = get();
    if (!pass.active || !projections) return null;
    return projections.byId[id] ?? null;
  },
}));
