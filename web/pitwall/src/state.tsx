import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applySwap, sameLineup, entity, purseOf, type Purse } from './data/logic';
import type { Lineup, Payload } from './data/types';
import type { MarketPrices, RealTeam } from './data/team';
import { NO_PASS, type PassState } from './data/access';
import { coverage, type Coverage } from './data/coverage';
import { ACE_MAX_PRICE, CONTRACT_LENGTH, planSave, type Plan } from './data/team';
import { EMPTY_PREFS, markRead as markReadPrefs, rate as ratePrefs, type Rating, type WirePrefs } from './data/wire';
import type { PageName } from './lib/router';

export interface UIState {
  boardTab: 'PROJECTIONS' | 'PROBABILITIES' | 'MOVEMENT';
  preset: 'VALUE' | 'PACE' | 'OWNERSHIP' | 'RISK';
  sort: string;
  paceTab: 'QUALI VS RACE' | 'STARTS' | 'LONG RUN';
  mktTab: 'PRICE MODEL' | 'VALUE' | 'OWNERSHIP';
  lowerTab: 'TOP 5' | 'RIVALS' | 'MOVERS' | 'WEATHER';
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
  /** locked call on the Briefing strip; -1 for none */
  rec: number;
  /** the locked call's full comparison shown in flow */
  recExpanded: boolean;
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
  /** what this reader has read and rated on the wire */
  wire: WirePrefs;
  /** what can actually be spent, and who the game will not sell right now */
  purse: Purse;
  /** the save this lineup would make against the real team, or null without one */
  plan: Plan | null;
  /** a headline marked read leaves the Briefing; the next one takes its place */
  markRead: (key: string) => void;
  /** thumbs up or down; the same thumb again clears it */
  rateNews: (key: string, rating: Rating) => void;
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

export function StoreProvider({ payload, lineup, real, pass = NO_PASS, checkoutFn, selectTeam, saver, wire: wireIn, onWire, go, children }: { payload: Payload; lineup: Lineup; real: RealContext | null; pass?: PassState; checkoutFn?: () => Promise<string>; selectTeam?: (id: string) => void; saver?: (lineup: Lineup, onStatus: (s: string | null) => void) => Promise<Lineup>; wire?: WirePrefs; onWire?: (prefs: WirePrefs) => void; go: (p: PageName) => void; children: ReactNode }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<string | null>(null);
  const [ui, setUi] = useState<UIState>(() => ({
    boardTab: 'PROJECTIONS', preset: 'VALUE', sort: 'med', paceTab: 'QUALI VS RACE', mktTab: 'PRICE MODEL', lowerTab: 'RIVALS',
    lineup, saved: lineup, slot: null, over: null, overTab: 'PRESENT', focus: null, thr: 25, win: 'L10', wire: 'ALL', rec: -1, recExpanded: false, recOver: null, tray: [], toast: null,
  }));
  const patch = useCallback((fn: (u: UIState) => Partial<UIState>) => setUi((u) => ({ ...u, ...fn(u) })), []);
  const toast = useCallback((text: string) => {
    patch(() => ({ toast: text }));
    window.setTimeout(() => patch((u) => (u.toast === text ? { toast: null } : {})), 2400);
  }, [patch]);

  const has = useMemo(() => coverage(payload), [payload]);
  /**
   * The bank and the lockouts, from the team the game actually holds. With unsaved changes on the
   * board it is the bank the pending plan would leave, so what is offered next is what could
   * really be bought next; without a real team it is the example budget.
   */
  const plan = useMemo(() => (real ? planSave(real.team, ui.lineup, real.market, CONTRACT_LENGTH, real.completedRaces) : null), [real, ui.lineup]);
  const purse: Purse = useMemo(() => {
    if (!real || !plan) return purseOf(payload, ui.lineup);
    const unavailable = new Set<string>();
    for (const [id, until] of Object.entries(real.team.driverLockouts ?? {})) if (typeof until === 'number' && until > real.completedRaces) unavailable.add(id);
    // A blocked plan stopped partway through its steps, so its running total is not a bank anyone
    // has: fall back to the last one the game agreed with.
    return { room: plan.blocked ? real.team.budget : plan.bankAfter, unavailable };
  }, [real, payload, ui.lineup, plan]);

  // The reader's wire history: seeded from the server, changed here, and handed back to be saved.
  // Seeded from the server (and emptied on sign-out, so the next reader never inherits a history).
  const [wire, setWire] = useState<WirePrefs>(wireIn ?? EMPTY_PREFS);
  useEffect(() => { setWire(wireIn ?? EMPTY_PREFS); }, [wireIn]);
  // Functional updates: two marks in one tick both land, rather than the second overwriting the
  // first from a stale closure. The save is a whole-document write, so running it twice is harmless.
  const changeWire = useCallback((fn: (w: WirePrefs) => WirePrefs) => setWire((w) => { const next = fn(w); onWire?.(next); return next; }), [onWire]);
  const markRead = useCallback((key: string) => changeWire((w) => markReadPrefs(w, key, Date.now())), [changeWire]);
  const rateNews = useCallback((key: string, rating: Rating) => changeWire((w) => ratePrefs(w, key, rating)), [changeWire]);
  const store = useMemo<Store>(() => ({
    payload, has, wire, purse, plan, markRead, rateNews, ui, go, real, saving, pass, checkout,
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
    tryAct: (act) => { patch((u) => ({ lineup: applySwap(u.lineup, act), rec: -1, recExpanded: false, slot: null, over: null, recOver: null })); go('LINEUP LAB'); toast('Swap applied as a what-if. Save it in the lineup lab.'); },
    // The ace can be moved from anywhere it is shown. With a real team and nothing else
    // pending it is written at once (the app's own direct ace write); with other edits pending
    // it rides along with the save. The cap is the app's rule, said here rather than at save time.
    setAce: (id) => {
      if (!ui.lineup.drivers.includes(id) || saving) return;   // one write at a time
      // Locked is the server's answer too (planSave refuses), so saying it here turns a failed save
      // into a sentence. The Briefing was offering "Set ace on …" through a locked weekend and only
      // reporting the refusal after the click.
      if (real?.team.isLocked) { toast('Your team is locked for this weekend.'); return; }
      const e = entity(payload, id);
      if (e && e.price > ACE_MAX_PRICE) { toast(`Only a pick at $${ACE_MAX_PRICE} or under can be the ace; ${e.name} is $${e.price}.`); return; }
      // tapping the ace again clears it, as in the app
      const clearing = ui.lineup.ace === id;
      const next = { ...ui.lineup, ace: clearing ? '' : id };
      patch(() => ({ lineup: next }));
      if (!saver || !sameLineup({ ...next, ace: ui.saved.ace }, ui.saved)) return;
      void saver(next, setSaving).then((saved) => { patch(() => ({ lineup: saved, saved })); toast(clearing ? 'Ace cleared and saved.' : `Ace moved to ${e?.name ?? id} and saved.`); }).catch((err: Error) => { patch((u) => ({ lineup: u.saved })); toast(err.message); }).finally(() => setSaving(null));
    },
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
  }), [payload, has, wire, purse, plan, markRead, rateNews, ui, go, patch, toast, real, saver, saving, pass, checkout, checkoutFn, selectTeam]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
