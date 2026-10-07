/**
 * Moonshot state for the app (F-108). Not persisted: everything here is the server's answer
 * to a question asked moments ago (menu, quote, the team's calls, the league's board), and a
 * stale copy of a quote or a token count is exactly what must not be shown.
 *
 * Demo mode (the sign-in long-press used for store screenshots and web verification) never
 * reaches the callables; it answers from the fixtures at the foot of this file instead.
 */
import { create } from 'zustand';
import { useAuthStore } from './auth.store';
import { useTeamStore } from './team.store';
import { moonshotService, callableMessage, type MoonshotMenu, type QuoteRequest } from '../services/moonshot.service';
import type { ActivityEntry, BoardCall, MoonshotCall, MoonshotQuote } from '../simple/grid/moonshot';

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
  board: BoardCall[];
  boardFor: string | null;          // `${leagueId}:${raceId}`
  activity: ActivityEntry[];
  activityFor: string | null;       // leagueId
  tutorialSeen: boolean | null;     // null = not asked yet
  tutorialOpen: boolean;

  loadCalls: (uid: string, teamId: string, seasonId: string, force?: boolean) => Promise<void>;
  openMenu: (teamId: string, raceId: string, driverId: string) => Promise<MoonshotMenu | null>;
  closeMenu: () => void;
  requestQuote: (req: QuoteRequest) => Promise<MoonshotQuote | null>;
  clearQuote: () => void;
  confirm: (quoteId: string) => Promise<boolean>;
  cancel: (moonshotId: string) => Promise<boolean>;
  clearError: () => void;
  loadBoard: (leagueId: string, raceId: string, force?: boolean) => Promise<void>;
  loadActivity: (leagueId: string, force?: boolean) => Promise<void>;
  checkTutorial: (uid: string) => Promise<void>;
  openTutorial: () => void;
  finishTutorial: (uid: string) => Promise<void>;
}

const quoteKey = (r: QuoteRequest) => `${r.teamId}:${r.raceId}:${r.driverId}:${r.predictionType}:${r.predictionTarget ?? ''}:${r.stakeCurrency}:${r.stakeAmount}`;
const demo = () => useAuthStore.getState().isDemoMode;

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
  board: [],
  boardFor: null,
  activity: [],
  activityFor: null,
  tutorialSeen: null,
  tutorialOpen: false,

  loadCalls: async (uid, teamId, seasonId, force) => {
    const key = `${uid}:${teamId}:${seasonId}`;
    if (!force && get().callsFor === key) return;
    if (demo()) { set({ calls: DEMO.calls(teamId), callsFor: key }); return; }
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
    if (demo()) { const menu = DEMO.menu(teamId, raceId, driverId, get().calls); set({ menu, loadingMenu: false }); return menu; }
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
    if (demo()) { DEMO.lastRequest = req; const quote = DEMO.quote(req, get().menu); set({ quote, loadingQuote: false }); return quote; }
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
    if (demo()) { DEMO.confirm(get()); set({ busy: null, quote: null, quoteFor: null, callsFor: null }); return true; }
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
    if (demo()) { DEMO.cancel(moonshotId); set((s) => ({ busy: null, callsFor: null, calls: s.calls.map((c) => (c.id === moonshotId ? { ...c, status: 'CANCELLED' as const } : c)) })); return true; }
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

  loadBoard: async (leagueId, raceId, force) => {
    const key = `${leagueId}:${raceId}`;
    if (!force && get().boardFor === key) return;
    if (demo()) { set({ board: DEMO.board(raceId), boardFor: key }); return; }
    try {
      const board = await moonshotService.leagueBoard(leagueId, raceId);
      set({ board, boardFor: key });
    } catch (e) { console.warn('[moonshot] board failed:', e); }
  },

  loadActivity: async (leagueId, force) => {
    if (!force && get().activityFor === leagueId) return;
    if (demo()) { set({ activity: DEMO.activity(), activityFor: leagueId }); return; }
    try {
      const activity = await moonshotService.leagueActivity(leagueId);
      set({ activity, activityFor: leagueId });
    } catch (e) { console.warn('[moonshot] activity failed:', e); }
  },

  checkTutorial: async (uid) => {
    if (get().tutorialSeen !== null) return;
    if (demo()) { set({ tutorialSeen: false }); return; }
    set({ tutorialSeen: await moonshotService.tutorialSeen(uid) });
  },
  openTutorial: () => set({ tutorialOpen: true }),
  finishTutorial: async (uid) => {
    set({ tutorialOpen: false, tutorialSeen: true });
    if (!demo()) await moonshotService.markTutorialSeen(uid);
  },
}));

// ── demo fixtures ───────────────────────────────────────────────────────────
// Plausible numbers in the server's shapes, so screenshots and web verification can walk the
// whole flow without a model, a config document or a signed-in account. Not the app's pricing.

const DEMO_PREDICTIONS = [
  { type: 'TOP_5' as const, probability: 0.76, band: 'SAFE', multiplier: 0.5 },
  { type: 'PODIUM' as const, probability: 0.43, band: 'BOLD', multiplier: 1.25 },
  { type: 'WIN' as const, probability: 0.16, band: 'MOONSHOT', multiplier: 5 },
];
const demoCalls = new Map<string, MoonshotCall>();
let demoSeq = 1;

const DEMO: { lastRequest: QuoteRequest | null; [k: string]: unknown } & Record<string, any> = {
  lastRequest: null,
  calls: (teamId: string): MoonshotCall[] => [...demoCalls.values()].filter((c) => c.teamId === teamId),
  menu: (teamId: string, raceId: string, driverId: string, calls: MoonshotCall[]): MoonshotMenu => ({
    availability: 'open', unlockRound: 13, tokensPerTeam: 3, tokensLeft: Math.max(0, 3 - calls.filter((c) => c.status !== 'CANCELLED' && c.status !== 'VOID').length),
    lockAtMs: Date.now() + 36 * 60 * 60 * 1000, round: 19,
    current: calls.find((c) => c.raceId === raceId && c.status !== 'CANCELLED') ?? null,
    ownsDriver: !!useTeamStore.getState().currentTeam?.drivers?.some((d) => d.driverId === driverId), modelAvailable: true, driverInModel: true, carriedFrom: null,
    predictions: DEMO_PREDICTIONS, exactFinishEnabled: false, positionsCount: 22,
    stakes: { POINTS: [50, 100, 200], CASH: [50, 100, 200] }, balances: { POINTS: 1284, CASH: 240 },
    model: { expectedFinish: 3.4, likelyLo: 1, likelyHi: 6, predicted: 3.1 }, copy: {}, tutorialEnabled: true,
  }),
  quote: (req: QuoteRequest, menu: MoonshotMenu | null): MoonshotQuote => {
    const p = (menu?.predictions ?? DEMO_PREDICTIONS).find((x) => x.type === req.predictionType) ?? DEMO_PREDICTIONS[1];
    return {
      quoteId: `demo-quote-${Date.now()}`, modelProbability: p.probability, rewardBand: p.band, multiplier: p.multiplier,
      stakeAmount: req.stakeAmount, potentialReward: Math.round(req.stakeAmount * p.multiplier), expiresAt: Date.now() + 10 * 60 * 1000, ownsDriver: menu?.ownsDriver ?? false, carriedFrom: null,
      tokensLeft: menu?.tokensLeft ?? 3, model: { expectedFinish: 3.4, likelyLo: 1, likelyHi: 6, predicted: 3.1 },
    };
  },
  confirm: (s: MoonshotState) => {
    const q = s.quote; const r = DEMO.lastRequest;
    if (!q || !r) return;
    const id = `demo-call-${demoSeq++}`;
    demoCalls.set(id, {
      id, teamId: r.teamId, raceId: r.raceId, roundNumber: 19, driverId: r.driverId, predictionType: r.predictionType, predictionTarget: r.predictionTarget ?? null, stakeCurrency: r.stakeCurrency, stakeAmount: r.stakeAmount,
      modelProbability: q.modelProbability, rewardBand: q.rewardBand, multiplier: q.multiplier, potentialReward: q.potentialReward, ownsDriver: q.ownsDriver, status: 'CONFIRMED',
      lockAtMs: Date.now() + 36 * 60 * 60 * 1000, result: null, officialDriverFinish: null, adjustmentAmount: null,
    });
  },
  cancel: (id: string) => { const c = demoCalls.get(id); if (c) demoCalls.set(id, { ...c, status: 'CANCELLED' }); },
  board: (raceId: string): BoardCall[] => [
    { id: 'demo-b1', teamId: 'demo-t2', userId: 'demo-u2', displayName: 'Mike', teamName: 'LATE BRAKERS', raceId, roundNumber: 19, driverId: 'hadjar', predictionType: 'PODIUM', predictionTarget: null, stakeCurrency: 'POINTS', stakeAmount: 200, modelProbability: 0.11, rewardBand: 'MOONSHOT', multiplier: 5, potentialReward: 1000, ownsDriver: false, status: 'LOCKED', lockAtMs: Date.now() - 60 * 60 * 1000, result: null, officialDriverFinish: null, adjustmentAmount: null },
    { id: 'demo-b2', teamId: 'demo-t3', userId: 'demo-u3', displayName: 'Sam', teamName: 'DIRTY AIR', raceId, roundNumber: 19, driverId: 'norris', predictionType: 'WIN', predictionTarget: null, stakeCurrency: 'CASH', stakeAmount: 100, modelProbability: 0.22, rewardBand: 'LONGSHOT', multiplier: 2.5, potentialReward: 250, ownsDriver: true, status: 'LOCKED', lockAtMs: Date.now() - 60 * 60 * 1000, result: null, officialDriverFinish: null, adjustmentAmount: null },
  ],
  activity: (): ActivityEntry[] => [
    { id: 'demo-a1', type: 'MOONSHOT_HIT', userId: 'demo-u2', driverId: 'hadjar', predictionType: 'PODIUM', predictionTarget: null, officialDriverFinish: 3, stakeCurrency: 'POINTS', stakeAmount: 200, multiplier: 5, modelProbability: 0.11, adjustmentAmount: 1000, raceId: 'demo-r18', roundNumber: 18, createdAtMs: Date.now() - 6 * 24 * 60 * 60 * 1000 },
    { id: 'demo-a2', type: 'MOONSHOT_MISSED', userId: 'demo-u3', driverId: 'norris', predictionType: 'WIN', predictionTarget: null, officialDriverFinish: 2, stakeCurrency: 'POINTS', stakeAmount: 100, multiplier: 2.5, modelProbability: 0.22, adjustmentAmount: -100, raceId: 'demo-r18', roundNumber: 18, createdAtMs: Date.now() - 6 * 24 * 60 * 60 * 1000 },
  ],
};
