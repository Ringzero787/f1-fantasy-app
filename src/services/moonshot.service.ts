/**
 * Moonshot (F-108): the client asks, the server prices and records. Four callables from F-106
 * and one read of the team's own calls. Nothing here writes Firestore directly — the rules
 * refuse it — and nothing the client sends about chance, multiplier or reward is read.
 */
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import { db, functions, httpsCallable } from '../config/firebase';
import { toCall, type ActivityEntry, type Availability, type BoardCall, type MenuPrediction, type MoonshotCall, type MoonshotQuote, type PredictionType, type StakeCurrency } from '../simple/grid/moonshot';

export { callableMessage, toCall } from '../simple/grid/moonshot';

export interface MoonshotMenu {
  availability: Availability;
  unlockRound: number;
  tokensPerTeam: number;
  tokensLeft: number;
  lockAtMs: number | null;
  round: number | null;
  current: MoonshotCall | null;
  ownsDriver: boolean;
  modelAvailable: boolean;
  driverInModel: boolean;
  carriedFrom: string | null;
  predictions: MenuPrediction[];
  exactFinishEnabled: boolean;
  positionsCount: number | null;
  /** the pricing cap, for the EXACT FINISH caption */
  maxMultiplier: number;
  stakes: Record<StakeCurrency, number[]>;
  balances: Record<StakeCurrency, number>;
  model: { expectedFinish: number; likelyLo: number; likelyHi: number; predicted: number } | null;
  copy: Record<string, string>;
  tutorialEnabled: boolean;
}

export interface QuoteRequest {
  teamId: string;
  raceId: string;
  driverId: string;
  predictionType: PredictionType;
  predictionTarget?: number;
  stakeCurrency: StakeCurrency;
  stakeAmount: number;
}

type MenuWire = Omit<MoonshotMenu, 'current'> & { current: (Record<string, unknown> & { id: string }) | null };

const callMenu = httpsCallable<{ teamId: string; raceId: string; driverId: string }, MenuWire>(functions, 'moonshotMenu');
const callQuote = httpsCallable<QuoteRequest, MoonshotQuote>(functions, 'moonshotQuote');
const callConfirm = httpsCallable<{ quoteId: string }, { moonshotId: string; tokensLeft: number }>(functions, 'moonshotConfirm');
const callCancel = httpsCallable<{ moonshotId: string }, { cancelled: boolean }>(functions, 'moonshotCancel');
const callBoard = httpsCallable<{ leagueId: string; raceId: string }, { raceId: string; calls: Array<Record<string, unknown> & { id: string }>; lockedCount: number }>(functions, 'moonshotLeagueBoard');

const toActivity = (id: string, d: Record<string, unknown>): ActivityEntry => ({
  id,
  type: String(d.type ?? ''),
  userId: String(d.userId ?? ''),
  driverId: String(d.driverId ?? ''),
  predictionType: d.predictionType as PredictionType,
  predictionTarget: typeof d.predictionTarget === 'number' ? d.predictionTarget : null,
  officialDriverFinish: typeof d.officialDriverFinish === 'number' ? d.officialDriverFinish : null,
  stakeCurrency: d.stakeCurrency === 'CASH' ? 'CASH' : 'POINTS',
  stakeAmount: typeof d.stakeAmount === 'number' ? d.stakeAmount : 0,
  multiplier: typeof d.multiplier === 'number' ? d.multiplier : null,
  modelProbability: typeof d.modelProbability === 'number' ? d.modelProbability : null,
  adjustmentAmount: typeof d.adjustmentAmount === 'number' ? d.adjustmentAmount : 0,
  raceId: String(d.raceId ?? ''),
  roundNumber: typeof d.roundNumber === 'number' ? d.roundNumber : null,
  createdAtMs: d.createdAt && typeof (d.createdAt as { toMillis?: unknown }).toMillis === 'function' ? (d.createdAt as { toMillis: () => number }).toMillis() : null,
});

export const moonshotService = {
  async menu(teamId: string, raceId: string, driverId: string): Promise<MoonshotMenu> {
    const m = (await callMenu({ teamId, raceId, driverId })).data;
    return { ...m, current: m.current ? toCall(m.current.id, m.current) : null };
  },
  async quote(req: QuoteRequest): Promise<MoonshotQuote> {
    return (await callQuote(req)).data;
  },
  async confirm(quoteId: string): Promise<{ moonshotId: string; tokensLeft: number }> {
    return (await callConfirm({ quoteId })).data;
  },
  async cancel(moonshotId: string): Promise<void> {
    await callCancel({ moonshotId });
  },
  /** The league's locked and settled calls on a race, decided on the server clock (SPEC §16/§17). */
  async leagueBoard(leagueId: string, raceId: string): Promise<BoardCall[]> {
    const res = (await callBoard({ leagueId, raceId })).data;
    return res.calls.map((c) => ({ ...toCall(c.id, c), userId: String(c.userId ?? ''), displayName: (c.displayName as string | null) ?? null, teamName: (c.teamName as string | null) ?? null }));
  },
  /** The league's Moonshot history (F-107 writes it; members read it). */
  async leagueActivity(leagueId: string, max = 30): Promise<ActivityEntry[]> {
    const snap = await getDocs(query(collection(db, 'leagues', leagueId, 'activity'), orderBy('createdAt', 'desc'), limit(max)));
    return snap.docs.map((d) => toActivity(d.id, d.data() as Record<string, unknown>));
  },
  /** Has this account seen the coach marks? Stored on the user document so it follows the account, not the device. */
  async tutorialSeen(uid: string): Promise<boolean> {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() && snap.data()?.moonshotTutorialSeen === true;
    } catch { return false; }
  },
  async markTutorialSeen(uid: string): Promise<void> {
    try { await setDoc(doc(db, 'users', uid), { moonshotTutorialSeen: true }, { merge: true }); } catch (e) { console.warn('[moonshot] tutorial flag not saved:', e); }
  },
  /** One team's calls this season (the rules let an owner list their own; tokens are per team, so the team is part of the question). */
  async teamCalls(uid: string, teamId: string, seasonId: string): Promise<MoonshotCall[]> {
    const snap = await getDocs(query(collection(db, 'moonshots'), where('userId', '==', uid), where('teamId', '==', teamId), where('seasonId', '==', seasonId)));
    return snap.docs.map((d) => toCall(d.id, d.data() as Record<string, unknown>)).sort((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0));
  },
};
