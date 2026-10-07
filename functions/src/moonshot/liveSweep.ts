/**
 * One live-timing ingest for race day (F-111). Every minute, while a race is in its window, this
 * sweep pulls the field's positions once from the timing feed and writes them to
 * `races/{raceId}/live/positions`; the app and the portal listen to that document instead of
 * asking the provider themselves. One request a minute whatever the audience, which is the
 * arrangement ADR-001 covers. With no race live it does one small query and exits.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { fetchSessions, type OpenF1Session } from '../ingestion/openf1Client';
import { DRIVER_NUMBER_TO_ID, SEASON_YEAR } from '../ingestion/config';
import { loadMoonshotConfig } from './config';

const BASE_URL = 'https://api.openf1.org/v1';
const LIVE_MS = 3 * 60 * 60 * 1000, LIVE_MAX_MS = 6 * 60 * 60 * 1000, EARLY_MS = 30 * 60 * 1000;

export interface PositionRow { driver_number: number; position: number; date: string }
interface RaceLike { id: string; status?: unknown; schedule?: { race?: { toMillis?: () => number } | Date | string | number | null } }

const startMs = (race: RaceLike): number => {
  const v = race.schedule?.race;
  if (!v) return NaN;
  if (typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  return new Date(v as string | number | Date).getTime();
};

/**
 * Pure: is this race in its live window? From half an hour before the start to three hours after;
 * six when it is still marked in progress. `in_progress` alone is not enough — the lock sweep sets it
 * on Friday, and a weekend of polling for a Sunday race is not the budget.
 */
export function isLive(race: RaceLike, nowMs: number): boolean {
  if (race.status === 'completed' || race.status === 'cancelled') return false;
  const start = startMs(race);
  const inProgress = race.status === 'in_progress';
  if (!Number.isFinite(start)) return inProgress;
  if (nowMs < start - EARLY_MS) return false;
  if (nowMs < start) return true;
  const since = nowMs - start;
  return since <= LIVE_MS || (inProgress && since <= LIVE_MAX_MS);
}

/** Pure: the race session on the race's UTC day (never a sprint). */
export function sessionForRace(sessions: OpenF1Session[], raceStartMs: number): OpenF1Session | null {
  if (!Number.isFinite(raceStartMs)) return null;
  const day = new Date(raceStartMs).toISOString().slice(0, 10);
  const utcDay = (iso: string) => { const t = new Date(iso).getTime(); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : iso.slice(0, 10); };
  return sessions.find((s) => s.session_name === 'Race' && utcDay(s.date_start) === day) ?? null;
}

/** Pure: the latest position per car from the feed's time series, mapped to driver ids; rows without a usable time or an unknown car are skipped. */
export function latestByDriver(rows: PositionRow[], numberToId: Record<number, string> = DRIVER_NUMBER_TO_ID): Record<string, number> {
  const latest = new Map<number, { at: number; position: number }>();
  for (const r of rows) {
    // the feed is third-party JSON: only whole car numbers and plausible positions become keys and values
    if (!Number.isInteger(r.driver_number) || !Number.isInteger(r.position) || r.position < 1 || r.position > 30) continue;
    const at = new Date(r.date).getTime();
    if (!Number.isFinite(at)) continue;
    const prev = latest.get(r.driver_number);
    if (!prev || at >= prev.at) latest.set(r.driver_number, { at, position: r.position });
  }
  const out: Record<string, number> = {};
  for (const [n, v] of latest) { const id = Object.prototype.hasOwnProperty.call(numberToId, n) ? numberToId[n] : undefined; if (id) out[id] = v.position; }
  return out;
}

async function fetchPositions(sessionKey: number): Promise<PositionRow[]> {
  const res = await fetch(`${BASE_URL}/position?session_key=${sessionKey}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OpenF1 /position ${res.status}`);
  return (await res.json()) as PositionRow[];
}

/** The feed calls, injectable so the sweep can be driven by a test without the network. */
export interface Feed { sessions: (year: number) => Promise<OpenF1Session[]>; positions: (sessionKey: number) => Promise<PositionRow[]> }
const LIVE_FEED: Feed = { sessions: fetchSessions, positions: fetchPositions };

/** The sweep body, separated so it can be driven from a test or a manual call. */
export async function sweepLivePositions(db: admin.firestore.Firestore, nowMs = Date.now(), feed: Feed = LIVE_FEED): Promise<{ raceId: string | null; written: boolean; drivers: number; off?: boolean }> {
  // the owner's switch stops the pull itself, not only the rendering: no deploy needed to turn it off
  const cfg = await loadMoonshotConfig(db);
  if (!cfg.liveTiming) return { raceId: null, written: false, drivers: 0, off: true };
  // the same query the account header runs (seasonId + status + round has its index); the season filter keeps a stray old `upcoming` out
  const snap = await db.collection('races').where('seasonId', '==', String(SEASON_YEAR)).where('status', 'in', ['in_progress', 'upcoming']).orderBy('round').limit(2).get();
  const race = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RaceLike, 'id'>) })).find((r) => isLive(r, nowMs));
  if (!race) return { raceId: null, written: false, drivers: 0 };
  const ref = db.doc(`races/${race.id}/live/positions`);
  // the session is looked up once: the last document carries its key for the rest of the race
  const prior = (await ref.get()).data();
  let sessionKey: number | null = prior && prior.raceId === race.id && typeof prior.sessionKey === 'number' ? prior.sessionKey : null;
  if (sessionKey === null) {
    const session = sessionForRace(await feed.sessions(new Date(startMs(race) || nowMs).getUTCFullYear()), startMs(race));
    if (!session || !Number.isInteger(session.session_key)) { console.warn(`[live] ${race.id}: no race session on its day yet`); return { raceId: race.id, written: false, drivers: 0 }; }
    sessionKey = session.session_key;
  }
  const byDriver = latestByDriver(await feed.positions(sessionKey));
  if (Object.keys(byDriver).length === 0) { console.log(`[live] ${race.id}: feed has no positions yet`); return { raceId: race.id, written: false, drivers: 0 }; }
  await ref.set({ raceId: race.id, sessionKey, byDriver, source: 'openf1', at: admin.firestore.FieldValue.serverTimestamp() });
  return { raceId: race.id, written: true, drivers: Object.keys(byDriver).length };
}

export const moonshotLiveSweep = onSchedule({ schedule: 'every 1 minutes', timeoutSeconds: 60, memory: '256MiB' }, async () => {
  try {
    const r = await sweepLivePositions(admin.firestore());
    if (r.written) console.log(`[live] ${r.raceId}: ${r.drivers} positions written`);
  } catch (e) {
    // a feed hiccup leaves the last document in place; the next minute tries again
    console.error('[live] sweep failed:', e);
  }
});
