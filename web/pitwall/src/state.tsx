import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { applySwap, sameLineup } from './data/logic';
import type { Lineup, Payload } from './data/types';
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

interface Store {
  payload: Payload;
  ui: UIState;
  set: <K extends keyof UIState>(key: K, value: UIState[K]) => void;
  open: (id: string | null | undefined) => void;
  close: () => void;
  toggleSlot: (slot: string) => void;
  swapInSlot: (id: string) => void;
  applyAct: (act: string) => void;
  tryAct: (act: string) => void;
  setAce: (id: string) => void;
  save: () => void;
  reset: () => void;
  togglePin: (id: string) => void;
  toast: (text: string) => void;
  dirty: boolean;
  go: (p: PageName) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = (): Store => {
  const s = useContext(Ctx);
  if (!s) throw new Error('store missing');
  return s;
};

export function StoreProvider({ payload, lineup, go, children }: { payload: Payload; lineup: Lineup; go: (p: PageName) => void; children: ReactNode }) {
  const [ui, setUi] = useState<UIState>(() => ({
    boardTab: 'PROJECTIONS', preset: 'VALUE', sort: 'med', paceTab: 'LONG RUN', mktTab: 'PRICE MODEL', lowerTab: 'RIVALS',
    lineup, saved: lineup, slot: null, over: null, overTab: 'PRESENT', focus: null, thr: 25, win: 'L10', wire: 'ALL', rec: 0, recOver: null, tray: [], toast: null,
  }));
  const patch = useCallback((fn: (u: UIState) => Partial<UIState>) => setUi((u) => ({ ...u, ...fn(u) })), []);
  const toast = useCallback((text: string) => {
    patch(() => ({ toast: text }));
    window.setTimeout(() => patch((u) => (u.toast === text ? { toast: null } : {})), 2400);
  }, [patch]);

  const store = useMemo<Store>(() => ({
    payload, ui, go,
    dirty: !sameLineup(ui.lineup, ui.saved),
    set: (key, value) => patch(() => ({ [key]: value } as Partial<UIState>)),
    open: (id) => { if (id) patch(() => ({ over: id, overTab: 'PRESENT', focus: id, recOver: null })); },
    close: () => patch(() => ({ over: null, recOver: null })),
    toggleSlot: (slot) => patch((u) => ({ slot: u.slot === slot ? null : slot })),
    swapInSlot: (id) => patch((u) => (u.slot ? { lineup: applySwap(u.lineup, `${u.slot}:${id}`), slot: null } : {})),
    applyAct: (act) => patch((u) => ({ lineup: applySwap(u.lineup, act) })),
    tryAct: (act) => { patch((u) => ({ lineup: applySwap(u.lineup, act), rec: 0, slot: null, over: null, recOver: null })); go('LINEUP LAB'); toast('Swap applied as a what-if. Save it in the lineup lab.'); },
    setAce: (id) => patch((u) => (u.lineup.drivers.includes(id) ? { lineup: { ...u.lineup, ace: id } } : {})),
    // F-073 replaces this with the server callables (addDriverSecure and friends). Until then nothing is written.
    save: () => { patch((u) => ({ saved: u.lineup })); toast('What-if kept on this page. Saving to your team arrives with the lineup lab release.'); },
    reset: () => patch((u) => ({ lineup: u.saved, slot: null })),
    togglePin: (id) => patch((u) => {
      if (u.tray.includes(id)) return { tray: u.tray.filter((x) => x !== id) };
      if (u.tray.length >= 3) return { toast: 'The compare tray holds three. Remove one first.' };
      return { tray: [...u.tray, id] };
    }),
    toast,
  }), [payload, ui, go, patch, toast]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
