/**
 * Lease rules — pure, so forge and the GCP backup obey exactly the same logic
 * and it can be tested without a database. Every store applies these inside a
 * transaction; that is what stops two runners processing one job.
 */
import type { Job, JobKind } from './types';

export const MAX_ATTEMPTS = 5;

/** Deterministic id: enqueueing the same work twice is a no-op. */
export function jobId(kind: JobKind, season: string, round: number | null, sessionKey: string | null): string {
  return [kind, season, round ?? 'x', sessionKey ?? 'x'].join('__');
}

export function canClaim(job: Job, now: number): boolean {
  if (job.notBefore > now) return false;
  if (job.attempts >= MAX_ATTEMPTS) return false;
  if (job.status === 'queued') return true;
  // a crashed or partitioned runner: its lease ran out
  if (job.status === 'leased') return job.leaseUntil !== null && job.leaseUntil <= now;
  // failed jobs are retried until MAX_ATTEMPTS; done jobs never
  return job.status === 'failed';
}

export function claimed(job: Job, owner: string, now: number, leaseMs: number): Job {
  return { ...job, status: 'leased', leaseOwner: owner, leaseUntil: now + leaseMs, attempts: job.attempts + 1 };
}

/** A runner may only renew or complete a lease it still holds and that has not expired. */
export function holds(job: Job, owner: string, now: number): boolean {
  return job.status === 'leased' && job.leaseOwner === owner && job.leaseUntil !== null && job.leaseUntil > now;
}

export function completed(job: Job, ok: boolean, error: string | null): Job {
  return { ...job, status: ok ? 'done' : 'failed', leaseOwner: null, leaseUntil: null, lastError: ok ? null : error };
}

/** Retry delay after a failure: 1, 2, 4, 8 minutes. */
export function backoffMs(attempts: number): number {
  return 60_000 * 2 ** Math.max(0, Math.min(attempts, 4) - 1);
}
