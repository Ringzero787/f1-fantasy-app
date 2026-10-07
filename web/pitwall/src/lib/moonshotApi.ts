/**
 * Moonshot reads and calls for the portal (F-109). Pricing and placing go through the same
 * F-106 callables the app uses; the portal never writes `moonshots`. The distribution behind a
 * multiplier is read from `moonshotModels/{raceId}`, which the rules open to any signed-in user.
 */
import { callable, firestore } from './firebase';
import { SEASON } from './env';
import { toCall, toLiveDoc, type BoardCall, type LivePositionsDoc, type MoonshotCall, type MoonshotMenu, type MoonshotModelDoc, type MoonshotQuote, type PredictionType, type StakeCurrency } from '../data/moonshot';

export interface CurrentRace { raceId: string; round: number; name: string; status: string }

/** The round being run, else the next one — the same choice loadAccount makes; the id is what the callables need. */
export async function loadCurrentRace(): Promise<CurrentRace | null> {
  const { m, db } = await firestore();
  const snap = await m.getDocs(m.query(m.collection(db, 'races'), m.where('seasonId', '==', SEASON), m.where('status', 'in', ['in_progress', 'upcoming']), m.orderBy('round'), m.limit(3))).catch(() => null);
  const docs: Array<Record<string, unknown> & { id: string }> = (snap?.docs ?? []).map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }));
  const race = docs.find((r) => r.status === 'in_progress') ?? docs[0];
  if (!race || typeof race.round !== 'number') return null;
  return { raceId: race.id, round: race.round, name: String(race.name ?? race.city ?? race.country ?? ''), status: String(race.status ?? 'upcoming') };
}

export interface QuoteRequest { teamId: string; raceId: string; driverId: string; predictionType: PredictionType; predictionTarget?: number; stakeCurrency: StakeCurrency; stakeAmount: number }

type MenuWire = Omit<MoonshotMenu, 'current'> & { current: (Record<string, unknown> & { id: string }) | null };

export async function fetchMenu(teamId: string, raceId: string, driverId: string): Promise<MoonshotMenu> {
  const fn = await callable<{ teamId: string; raceId: string; driverId: string }, MenuWire>('moonshotMenu');
  const m = (await fn({ teamId, raceId, driverId })).data;
  return { ...m, current: m.current ? toCall(m.current.id, m.current) : null };
}

export async function fetchQuote(req: QuoteRequest): Promise<MoonshotQuote> {
  const fn = await callable<QuoteRequest, MoonshotQuote>('moonshotQuote');
  return (await fn(req)).data;
}

export async function confirmQuote(quoteId: string): Promise<{ moonshotId: string; tokensLeft: number }> {
  const fn = await callable<{ quoteId: string }, { moonshotId: string; tokensLeft: number }>('moonshotConfirm');
  return (await fn({ quoteId })).data;
}

export async function cancelCall(moonshotId: string): Promise<void> {
  const fn = await callable<{ moonshotId: string }, { cancelled: boolean }>('moonshotCancel');
  await fn({ moonshotId });
}

/** The league's locked and settled calls on a race, decided on the server clock (never an open call). */
export async function fetchBoard(leagueId: string, raceId: string): Promise<BoardCall[]> {
  const fn = await callable<{ leagueId: string; raceId: string }, { calls: Array<Record<string, unknown> & { id: string }> }>('moonshotLeagueBoard');
  const res = (await fn({ leagueId, raceId })).data;
  return res.calls.map((c) => ({ ...toCall(c.id, c), userId: String(c.userId ?? ''), displayName: (c.displayName as string | null) ?? null, teamName: (c.teamName as string | null) ?? null }));
}

/** One team's calls this season — the rules let an owner list their own. */
export async function loadTeamCalls(uid: string, teamId: string): Promise<MoonshotCall[]> {
  const { m, db } = await firestore();
  const snap = await m.getDocs(m.query(m.collection(db, 'moonshots'), m.where('userId', '==', uid), m.where('teamId', '==', teamId), m.where('seasonId', '==', SEASON)));
  return snap.docs.map((d) => toCall(d.id, d.data() as Record<string, unknown>)).sort((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0));
}

/** The published model for a race: the distribution the multipliers are read from. Null when none is published. */
export async function loadModel(raceId: string): Promise<MoonshotModelDoc | null> {
  const { m, db } = await firestore();
  const snap = await m.getDoc(m.doc(db, 'moonshotModels', raceId)).catch(() => null);
  if (!snap || !snap.exists()) return null;
  const d = snap.data() as Record<string, unknown>;
  return { raceId, round: Number(d.round ?? 0), source: String(d.source ?? ''), modelVersion: String(d.modelVersion ?? ''), positionsCount: Number(d.positionsCount ?? 0), drivers: (d.drivers ?? {}) as MoonshotModelDoc['drivers'] };
}

/** Listen to the race's live positions (F-111): one server sweep writes them each minute during the race; nothing exists outside it. */
export async function subscribeLive(raceId: string, cb: (d: LivePositionsDoc | null) => void): Promise<() => void> {
  const { m, db } = await firestore();
  return m.onSnapshot(m.doc(db, 'races', raceId, 'live', 'positions'), (snap) => cb(snap.exists() ? toLiveDoc(snap.data() as Record<string, unknown>) : null), () => cb(null));
}
