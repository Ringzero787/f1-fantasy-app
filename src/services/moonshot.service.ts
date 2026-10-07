/**
 * Moonshot (F-108): the client asks, the server prices and records. Four callables from F-106
 * and one read of the team's own calls. Nothing here writes Firestore directly — the rules
 * refuse it — and nothing the client sends about chance, multiplier or reward is read.
 */
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, functions, httpsCallable } from '../config/firebase';
import { toCall, type Availability, type MenuPrediction, type MoonshotCall, type MoonshotQuote, type PredictionType, type StakeCurrency } from '../simple/grid/moonshot';

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
  /** One team's calls this season (the rules let an owner list their own; tokens are per team, so the team is part of the question). */
  async teamCalls(uid: string, teamId: string, seasonId: string): Promise<MoonshotCall[]> {
    const snap = await getDocs(query(collection(db, 'moonshots'), where('userId', '==', uid), where('teamId', '==', teamId), where('seasonId', '==', seasonId)));
    return snap.docs.map((d) => toCall(d.id, d.data() as Record<string, unknown>)).sort((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0));
  },
};
