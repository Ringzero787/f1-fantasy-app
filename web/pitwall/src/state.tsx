import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { applySwap, sameLineup } from './data/logic';
import type { Lineup, Payload } from './data/types';
import type { MarketPrices, RealTeam } from './data/team';
import { NO_PASS, type PassState } from './data/access';
import { coverage, type Coverage } from './data/coverage';
import type { PageName } from './lib/router';

export interface UIState {
  boardTab: 'PROJECTIONS' | 'PROBABILITIES' | 'MOVEMENT';
  preset: 'VALUE' | 'PACE' | 'OWNERSHIP' | 'RISK';
  sort: string;
  paceTab: 'LONG RUN' | 'QUALI VS RACE' | 'PIT STOPS';
  mktTab: 'PRICE MODEL' | 'VALUE' | 'OWNERSHIP';
  lowerTab: 'RIVALS' | 'MOVERS' | 'WEATHER';
  lineup: Lineup;
  saved: Lineup;
  slot: string | null;
  /** entity shown in the slide-over */
  over: string | null;
  overTab: 'PAST' | 'PRESENT' | 'OUTLOOK' | 'COMPARE';
  /** last entity the user clicked: highlighted on every page (cross-filter) */
  focus: string | null;
  thr: number;
  win: 'L5' | 'L10' | 'SEASON';
  wire: string;
  rec: number;
  /** recommendation opened in the slide-over on narrow screens */
  recOver: number | null;
  /** pinned compare tray, at most three */
  tray: string[];
  toast: string | null;
}

/** The signed-in user's real team and the live market (null in preview / when no team exists yet). */
export interface RealContext { team: RealTeam; /** every team this user owns, for the switcher */ teams: RealTeam[]; market: MarketPrices; completedRaces: number }

interface Store {
  payload: Payload;
  /** which parts of the payload carry real data, so a page can say "not published yet" instead of showing a zero */
  has: Coverage;
  real: RealContext | null;
  pass: PassState;
  /** null = idle, 'starting' = opening Stripe, any other string = the error to show */
  checkout: string | null;
  startCheckout: () => Promise<void>;
  ui: UIState;
  set: <K extends keyof UIState>(key: K, value: UIState[K]) => void;
  open: (id: string | null | undefined) => void;
  close: () => void;
  toggleSlot: (slot: string) => void;
  swapInSlot: (id: string) => void;
  applyAct: (act: string) => void;
  tryAct: (act: string) => void;
  setAce: (id: string) => void;
  /** Save the what-if to the real team through the server. Resolves true on success. */
  save: () => Promise<boolean>;
  saving: string | null;
  reset: () => void;
  togglePin: (id: string) => void;
  toast: (text: string) => void;
  /** switch to another of the user's teams */
  selectTeam: (id: string) => void;
  dirty: boolean;
  go: (p: PageName) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = (): Store => {
  const s = useContext(Ctx);
  if (!s) throw new Error('store missing');
  return s;
};

export function StoreProvider({ payload, lineup, real, pass = NO_PASS, checkoutFn, selectTeam, saver, go, children }: { payload: Payload; lineup: Lineup; real: RealContext | null; pass?: PassState; checkoutFn?: () => Promise<string>; selectTeam?: (id: string) => void; saver?: (lineup: Lineup, onStatus: (s: string | null) => void) => Promise<Lineup>; go: (p: PageName) => void; children: ReactNode }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<string | null>(null);
  const [ui, setUi] = useState<UIState>(() => ({
    boardTab: 'PROJECTIONS', preset: 'VALUE', sort: 'med', paceTab: 'LONG RUN', mktTab: 'PRICE MODEL', lowerTab: 'RIVALS',
    lineup, saved: lineup, slot: null, over: null, overTab: 'PRESENT', focus: null, thr: 25, win: 'L10', wire: 'ALL', rec: 0, recOver: null, tray: [], toast: null,
  }));
  const patch = useCallback((fn: (u: UIState) => Partial<UIState>) => setUi((u) => ({ ...u, ...fn(u) })), []);
  const toast = useCallback((text: string) => {
    patch(() => ({ toast: text }));
    window.setTimeout(() => patch((u) => (u.toast === text ? { toast: null } : {})), 2400);
  }, [patch]);

  const has = useMemo(() => coverage(payload), [payload]);
  const store = useMemo<Store>(() => ({
    payload, has, ui, go, real, saving, pass, checkout,
    startCheckout: async () => {
      if (!checkoutFn) { toast('Checkout is not available in this preview.'); return; }
      setCheckout('starting');
      try {
        // Stripe hosts the payment page; we never see a card number.
        window.location.assign(await checkoutFn());
      } catch (e) {
        setCheckout((e as Error).message || 'Checkout could not be opened. Try again.');
      }
    },
    dirty: !sameLineup(ui.lineup, ui.saved),
    set: (key, value) => patch(() => ({ [key]: value } as Partial<UIState>)),
    open: (id) => { if (id) patch(() => ({ over: id, overTab: 'PRESENT', focus: id, recOver: null })); },
    close: () => patch(() => ({ over: null, recOver: null })),
    toggleSlot: (slot) => patch((u) => ({ slot: u.slot === slot ? null : slot })),
    swapInSlot: (id) => patch((u) => (u.slot ? { lineup: applySwap(u.lineup, `${u.slot}:${id}`), slot: null } : {})),
    applyAct: (act) => patch((u) => ({ lineup: applySwap(u.lineup, act) })),
    tryAct: (act) => { patch((u) => ({ lineup: applySwap(u.lineup, act), rec: 0, slot: null, over: null, recOver: null })); go('LINEUP LAB'); toast('Swap applied as a what-if. Save it in the lineup lab.'); },
    setAce: (id) => patch((u) => (u.lineup.drivers.includes(id) ? { lineup: { ...u.lineup, ace: id } } : {})),
    save: async () => {
      if (!saver) { patch((u) => ({ saved: u.lineup })); toast('Example data: nothing to save.'); return true; }
      try {
        const saved = await saver(ui.lineup, setSaving);
        patch(() => ({ lineup: saved, saved, slot: null }));
        toast('Lineup saved to your team.');
        return true;
      } catch (e) {
        toast((e as Error).message);
        return false;
      } finally { setSaving(null); }
    },
    reset: () => patch((u) => ({ lineup: u.saved, slot: null })),
    togglePin: (id) => patch((u) => {
      if (u.tray.includes(id)) return { tray: u.tray.filter((x) => x !== id) };
      if (u.tray.length >= 3) return { toast: 'The compare tray holds three. Remove one first.' };
      return { tray: [...u.tray, id] };
    }),
    toast,
    selectTeam: (id: string) => { selectTeam?.(id); patch(() => ({ slot: null })); },
  }), [payload, has, ui, go, patch, toast, real, saver, saving, pass, checkout, checkoutFn, selectTeam]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
