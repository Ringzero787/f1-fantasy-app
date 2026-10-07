/**
 * Moonshot (F-108): the client asks, the server prices and records. Four callables from F-106
 * and one read of the team's own calls. Nothing here writes Firestore directly — the rules
 * refuse it — and nothing the client sends about chance, multiplier or reward is read.
 */
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db, functions, httpsCallable } from '../config/firebase';
import type { Availability, MenuPrediction, MoonshotCall, MoonshotQuote, PredictionType, StakeCurrency } from '../simple/grid/moonshot';

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

const callMenu = httpsCallable<{ teamId: string; raceId: string; driverId: string }, MoonshotMenu>(functions, 'moonshotMenu');
const callQuote = httpsCallable<QuoteRequest, MoonshotQuote>(functions, 'moonshotQuote');
const callConfirm = httpsCallable<{ quoteId: string }, { moonshotId: string; tokensLeft: number }>(functions, 'moonshotConfirm');
const callCancel = httpsCallable<{ moonshotId: string }, { cancelled: boolean }>(functions, 'moonshotCancel');

/** The server's refusals are written as sentences for the player; anything else gets a plain fallback. */
export function callableMessage(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  const err = e as { code?: string; message?: string } | undefined;
  const code = (err?.code ?? '').replace(/^functions\//, '');
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'internal') return 'The server is not answering right now. Try again in a moment.';
  if (code === 'unauthenticated') return 'Sign in again to make a Moonshot.';
  return err?.message && err.message !== 'INTERNAL' ? err.message : fallback;
}

const toMs = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as Timestamp).toMillis() : null);

/** A `moonshots` document as the UI reads it. */
export function toCall(id: string, d: Record<string, unknown>): MoonshotCall {
  return {
    id,
    raceId: String(d.raceId ?? ''),
    roundNumber: typeof d.roundNumber === 'number' ? d.roundNumber : null,
    driverId: String(d.driverId ?? ''),
    predictionType: d.predictionType as PredictionType,
    predictionTarget: typeof d.predictionTarget === 'number' ? d.predictionTarget : null,
    stakeCurrency: d.stakeCurrency as StakeCurrency,
    stakeAmount: typeof d.stakeAmount === 'number' ? d.stakeAmount : 0,
    modelProbability: typeof d.modelProbability === 'number' ? d.modelProbability : 0,
    rewardBand: String(d.rewardBand ?? ''),
    multiplier: typeof d.multiplier === 'number' ? d.multiplier : 0,
    potentialReward: typeof d.potentialReward === 'number' ? d.potentialReward : 0,
    ownsDriver: d.ownsDriver === true,
    status: d.status as MoonshotCall['status'],
    lockAtMs: toMs(d.lockAtMs ?? d.lockAt),
    result: (d.result as MoonshotCall['result']) ?? null,
    officialDriverFinish: typeof d.officialDriverFinish === 'number' ? d.officialDriverFinish : null,
    adjustmentAmount: typeof d.adjustmentAmount === 'number' ? d.adjustmentAmount : null,
  };
}

export const moonshotService = {
  async menu(teamId: string, raceId: string, driverId: string): Promise<MoonshotMenu> {
    const res = await callMenu({ teamId, raceId, driverId });
    const m = res.data;
    return { ...m, current: m.current ? toCall((m.current as unknown as { id: string }).id, m.current as unknown as Record<string, unknown>) : null };
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
  /** The signed-in player's calls this season (the rules let an owner list their own). */
  async myCalls(uid: string, seasonId: string): Promise<MoonshotCall[]> {
    const snap = await getDocs(query(collection(db, 'moonshots'), where('userId', '==', uid), where('seasonId', '==', seasonId)));
    return snap.docs.map((d) => toCall(d.id, d.data() as Record<string, unknown>)).sort((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0));
  },
};
