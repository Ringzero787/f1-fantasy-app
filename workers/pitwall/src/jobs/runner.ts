/**
 * Claim one job, run its handler while renewing the lease, record the run.
 * The same loop runs on forge (systemd) and in the GCP backup (Cloud Run Job).
 */
import type { Job, JobKind, JobStore, RunRecord } from './types';

export type Handler = (job: Job, report: (key: string, n: number) => void) => Promise<void>;

export interface RunnerOptions {
  owner: string;
  leaseMs: number;
  /** renew when this much of the lease has passed */
  renewEveryMs: number;
  commit: string | null;
  now?: () => number;
  kinds?: JobKind[];
}

/** @returns the run record, or null when no job was due. */
export async function runOnce(store: JobStore, handlers: Partial<Record<JobKind, Handler>>, opts: RunnerOptions): Promise<RunRecord | null> {
  const now = opts.now ?? Date.now;
  const job = await store.claim(opts.owner, now(), opts.leaseMs, opts.kinds ?? (Object.keys(handlers) as JobKind[]));
  if (!job) return null;

  const counts: Record<string, number> = {};
  const report = (key: string, n: number) => { counts[key] = (counts[key] ?? 0) + n; };
  const startedAt = now();
  let lost = false;
  const timer = setInterval(() => {
    store.renew(job.id, opts.owner, now(), opts.leaseMs).then((ok) => { if (!ok) lost = true; }).catch(() => { lost = true; });
  }, opts.renewEveryMs);

  let ok = true;
  let error: string | null = null;
  try {
    const handler = handlers[job.kind];
    if (!handler) throw new Error(`no handler for job kind ${job.kind}`);
    await handler(job, report);
  } catch (e) {
    ok = false;
    error = e instanceof Error ? e.message : String(e);
  } finally {
    clearInterval(timer);
  }

  // If the lease was lost, another runner owns the job now: its result stands, ours is dropped.
  const recorded = !lost && (await store.complete(job.id, opts.owner, ok, error, now()));
  const run: RunRecord = {
    jobId: job.id, kind: job.kind, runner: opts.owner, startedAt, finishedAt: now(),
    ok: ok && recorded, error: recorded ? error : (error ?? 'lease lost before completion'), counts, commit: opts.commit,
  };
  await store.writeRun(run);
  return run;
}
