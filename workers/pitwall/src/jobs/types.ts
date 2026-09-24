/**
 * Job and run-record shapes shared by the forge worker and the GCP backup
 * runner (ADR-002). Documents live in `pw_jobs` and `pw_runs`; only the Admin
 * SDK touches them.
 */
export type JobKind = 'daily' | 'session' | 'projections' | 'backtest' | 'news' | 'briefing';
export type JobStatus = 'queued' | 'leased' | 'done' | 'failed';

export interface Job {
  id: string;
  kind: JobKind;
  season: string;
  round: number | null;
  sessionKey: string | null;
  status: JobStatus;
  /** which runner holds the lease, e.g. "forge" or "gcp-backup" */
  leaseOwner: string | null;
  /** epoch ms; a lease past this time can be reclaimed */
  leaseUntil: number | null;
  attempts: number;
  /** epoch ms; a job is not due before this */
  notBefore: number;
  lastError: string | null;
}

export interface RunRecord {
  jobId: string;
  kind: JobKind;
  runner: string;
  startedAt: number;
  finishedAt: number;
  ok: boolean;
  error: string | null;
  /** free-form counters a handler reports: docs read, payloads written, gaps found */
  counts: Record<string, number>;
  /** the commit the worker was built from, so a run can be tied to code */
  commit: string | null;
}

/** Storage the runner needs. Firestore in production, memory in tests. */
export interface JobStore {
  /** Atomically claim the first claimable job (see lease.canClaim); null if none. */
  claim(owner: string, now: number, leaseMs: number, kinds?: JobKind[]): Promise<Job | null>;
  /** Extend a lease this owner still holds; false if it was lost. */
  renew(jobId: string, owner: string, now: number, leaseMs: number): Promise<boolean>;
  /** Finish a job this owner still holds; false if the lease was lost (the result is then discarded). */
  complete(jobId: string, owner: string, ok: boolean, error: string | null, now: number): Promise<boolean>;
  /** Idempotent on the job id. */
  enqueue(job: Job): Promise<'created' | 'exists'>;
  writeRun(run: RunRecord): Promise<void>;
}
