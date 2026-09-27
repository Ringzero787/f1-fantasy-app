/**
 * What the worker should run, and when (F-069). Pure: the loop in cli/serve.ts asks this every
 * few minutes with the current round and enqueues whatever is due; the job id makes a repeat
 * enqueue a no-op, so asking often is harmless.
 *
 * Projections refresh after each session (F-070: "after each practice and qualifying session")
 * — ninety minutes after a session starts, when it has run and been reported — and once a day at
 * 06:00 UTC so a quiet week still moves with prices, news and the forecast. When a round is
 * scored the round itself changes, and the next daily job is for the new one.
 */
import { jobId } from './lease';
import type { Job } from './types';

export interface RoundSchedule { season: string; round: number; sessions: Array<{ key: string; at: Date }> }

export const SESSION_LAG_MS = 90 * 60 * 1000;
export const DAILY_AT_UTC_HOUR = 6;
const LOOK_BACK_MS = 36 * 3600 * 1000;
const LOOK_AHEAD_MS = 8 * 86400 * 1000;

const fresh = (kind: Job['kind'], r: RoundSchedule, sessionKey: string, notBefore: number): Job => ({
  id: jobId(kind, r.season, r.round, sessionKey), kind, season: r.season, round: r.round, sessionKey,
  status: 'queued', leaseOwner: null, leaseUntil: null, attempts: 0, notBefore, lastError: null,
});

export const dayKey = (now: Date): string => `daily-${now.toISOString().slice(0, 10).replace(/-/g, '')}`;

/** The jobs that should exist right now for this round. Ids repeat across calls on purpose. */
export function dueJobs(now: Date, r: RoundSchedule): Job[] {
  const t = now.getTime();
  const out: Job[] = [];
  for (const s of r.sessions) {
    const at = s.at.getTime();
    if (at < t - LOOK_BACK_MS || at > t + LOOK_AHEAD_MS) continue;
    out.push(fresh('projections', r, s.key, at + SESSION_LAG_MS));
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DAILY_AT_UTC_HOUR));
  out.push(fresh('projections', r, dayKey(now), today.getTime()));
  return out;
}
