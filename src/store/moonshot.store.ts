/**
 * Moonshot state for the app (F-108). Not persisted: everything here is the server's answer
 * to a question asked moments ago (menu, quote, the team's calls), and a stale copy of a
 * quote or a token count is exactly what must not be shown.
 */
import { create } from 'zustand';
import { moonshotService, callableMessage, type MoonshotMenu, type QuoteRequest } from '../services/moonshot.service';
import type { MoonshotCall, MoonshotQuote } from '../simple/grid/moonshot';

interface MoonshotState {
  calls: MoonshotCall[];
  callsFor: string | null;          // `${uid}:${teamId}:${season}` the list belongs to
  loadingCalls: boolean;
  menu: MoonshotMenu | null;
  menuFor: string | null;           // `${teamId}:${raceId}:${driverId}`
  loadingMenu: boolean;
  quote: MoonshotQuote | null;
  quoteFor: string | null;          // the request the quote answers; a slower, older answer is dropped
  loadingQuote: boolean;
  busy: 'confirm' | 'cancel' | null;
  error: string | null;

  loadCalls: (uid: string, teamId: string, seasonId: string, force?: boolean) => Promise<void>;
  openMenu: (teamId: string, raceId: string, driverId: string) => Promise<MoonshotMenu | null>;
  closeMenu: () => void;
  requestQuote: (req: QuoteRequest) => Promise<MoonshotQuote | null>;
  clearQuote: () => void;
  confirm: (quoteId: string) => Promise<boolean>;
  cancel: (moonshotId: string) => Promise<boolean>;
  clearError: () => void;
}

const quoteKey = (r: QuoteRequest) => `${r.teamId}:${r.raceId}:${r.driverId}:${r.predictionType}:${r.predictionTarget ?? ''}:${r.stakeCurrency}:${r.stakeAmount}`;

export const useMoonshotStore = create<MoonshotState>((set, get) => ({
  calls: [],
  callsFor: null,
  loadingCalls: false,
  menu: null,
  menuFor: null,
  loadingMenu: false,
  quote: null,
  quoteFor: null,
  loadingQuote: false,
  busy: null,
  error: null,

  loadCalls: async (uid, teamId, seasonId, force) => {
    const key = `${uid}:${teamId}:${seasonId}`;
    if (!force && get().callsFor === key) return;
    set({ loadingCalls: true });
    try {
      const calls = await moonshotService.teamCalls(uid, teamId, seasonId);
      set({ calls, callsFor: key, loadingCalls: false });
    } catch (e) {
      // a failed read keeps whatever was shown; the rules allow this read, so this is transport
      console.warn('[moonshot] calls failed:', e);
      set({ loadingCalls: false });
    }
  },

  openMenu: async (teamId, raceId, driverId) => {
    const key = `${teamId}:${raceId}:${driverId}`;
    set({ loadingMenu: true, menuFor: key, menu: null, quote: null, quoteFor: null, error: null });
    try {
      const menu = await moonshotService.menu(teamId, raceId, driverId);
      if (get().menuFor !== key) return null;   // the player moved on
      set({ menu, loadingMenu: false });
      return menu;
    } catch (e) {
      if (get().menuFor === key) set({ loadingMenu: false, error: callableMessage(e) });
      return null;
    }
  },
  closeMenu: () => set({ menu: null, menuFor: null, quote: null, quoteFor: null, loadingMenu: false, loadingQuote: false, error: null }),

  requestQuote: async (req) => {
    const key = quoteKey(req);
    set({ loadingQuote: true, quote: null, quoteFor: key, error: null });
    try {
      const quote = await moonshotService.quote(req);
      if (get().quoteFor !== key) return null;   // a later request superseded this one
      set({ quote, loadingQuote: false });
      return quote;
    } catch (e) {
      if (get().quoteFor === key) set({ loadingQuote: false, error: callableMessage(e) });
      return null;
    }
  },
  clearQuote: () => set({ quote: null, quoteFor: null, loadingQuote: false }),

  confirm: async (quoteId) => {
    set({ busy: 'confirm', error: null });
    try {
      await moonshotService.confirm(quoteId);
      set({ busy: null, quote: null, quoteFor: null, callsFor: null });   // the list is stale now; the screen reloads it
      return true;
    } catch (e) {
      set({ busy: null, error: callableMessage(e) });
      return false;
    }
  },

  cancel: async (moonshotId) => {
    set({ busy: 'cancel', error: null });
    try {
      await moonshotService.cancel(moonshotId);
      set((s) => ({ busy: null, callsFor: null, calls: s.calls.map((c) => (c.id === moonshotId ? { ...c, status: 'CANCELLED' as const } : c)) }));
      return true;
    } catch (e) {
      set({ busy: null, error: callableMessage(e) });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
