/**
 * Pit Wall state shared across the app (F-077): the pass on the user's token and the published
 * projections for the coming round. F-124: projections load for every signed-in user while
 * content is open; the pass is still refreshed so charging can resume without a store rewrite.
 *
 * Not persisted. The pass is an auth claim and the projections change every refresh, so a stale
 * copy restored from disk would mark the wrong picks. Both reload on sign-in and on a pull to
 * refresh; everything stays hidden until they arrive.
 */
import { create } from 'zustand';
import { loadPass, loadProjections } from '../pitwall/client';
import { PITWALL_CONTENT_OPEN } from '../pitwall/gates';
import { NO_PASS, type PassState } from '../pitwall/pass';
import type { Projection, ProjectionSet } from '../pitwall/projections';
import { SHOWCASE_ENABLED, showcaseProjections } from '../simple/grid/showcaseData';

interface PitWallState {
  pass: PassState;
  projections: ProjectionSet | null;
  loading: boolean;
  /** Read the pass, then the projections (F-124: for every signed-in user while content is open). */
  refresh: (force?: boolean) => Promise<void>;
  clear: () => void;
  /** The projection for one driver or constructor, or null when none is loaded. */
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
      // The showcase stands in for a pass so the paid screens can be seen and screenshotted without
      // one. Two environment variables the store build scripts refuse, so it reaches nobody who paid.
      if (SHOWCASE_ENABLED) {
        if (ticket === seq) set({ pass: { ...pass, active: true }, projections: showcaseProjections() as ProjectionSet, loading: false });
        return;
      }
      // F-124: while content is open the rules allow the read for any signed-in user.
      const projections = (pass.active || PITWALL_CONTENT_OPEN) ? await loadProjections() : null;
      // A slower earlier run must not overwrite a newer answer.
      if (ticket === seq) set({ pass, projections, loading: false });
    } catch {
      if (ticket === seq) set({ pass: NO_PASS, projections: null, loading: false });
    }
  },

  clear: () => { seq += 1; set({ pass: NO_PASS, projections: null, loading: false }); },

  projectionFor: (id: string) => {
    const { pass, projections } = get();
    if (!projections) return null;
    if (!PITWALL_CONTENT_OPEN && !pass.active) return null;
    return projections.byId[id] ?? null;
  },
}));
