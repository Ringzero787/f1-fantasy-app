import type { Job, JobKind, JobStore, RunRecord } from './types';
import { backoffMs, canClaim, claimed, completed, holds } from './lease';

/** In-memory JobStore for tests and dry runs. Single-threaded JS makes each method atomic. */
export class MemoryJobStore implements JobStore {
  readonly jobs = new Map<string, Job>();
  readonly runs: RunRecord[] = [];

  async enqueue(job: Job): Promise<'created' | 'exists'> {
    if (this.jobs.has(job.id)) return 'exists';
    this.jobs.set(job.id, { ...job });
    return 'created';
  }

  async claim(owner: string, now: number, leaseMs: number, kinds?: JobKind[]): Promise<Job | null> {
    const due = [...this.jobs.values()]
      .filter((j) => (!kinds || kinds.includes(j.kind)) && canClaim(j, now))
      .sort((a, b) => a.notBefore - b.notBefore || (a.id < b.id ? -1 : 1));
    if (due.length === 0) return null;
    const next = claimed(due[0], owner, now, leaseMs);
    this.jobs.set(next.id, next);
    return { ...next };
  }

  async renew(jobId: string, owner: string, now: number, leaseMs: number): Promise<boolean> {
    const j = this.jobs.get(jobId);
    if (!j || !holds(j, owner, now)) return false;
    this.jobs.set(jobId, { ...j, leaseUntil: now + leaseMs });
    return true;
  }

  async complete(jobId: string, owner: string, ok: boolean, error: string | null, now: number): Promise<boolean> {
    const j = this.jobs.get(jobId);
    if (!j || !holds(j, owner, now)) return false;
    const done = completed(j, ok, error);
    this.jobs.set(jobId, ok ? done : { ...done, notBefore: now + backoffMs(j.attempts) });
    return true;
  }

  async writeRun(run: RunRecord): Promise<void> { this.runs.push(run); }
}
