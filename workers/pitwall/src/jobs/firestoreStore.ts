/**
 * Firestore JobStore (`pw_jobs`, `pw_runs`). The lease rules are the pure ones
 * in lease.ts, applied inside a transaction so forge and the GCP backup can
 * never both claim a job.
 *
 * NOT YET EXERCISED against Firestore or the emulator: nothing in this
 * repository constructs it until the owner has set up the worker's service
 * account (ADR-002). The types below are the small slice of the Admin SDK it
 * uses, so the package needs no firebase-admin dependency to build and test.
 */
import type { Job, JobKind, JobStore, RunRecord } from './types';
import { backoffMs, canClaim, claimed, completed, holds } from './lease';

interface DocSnap { exists: boolean; id: string; data(): Record<string, unknown> | undefined }
interface DocRef { id: string; set(data: Record<string, unknown>, opts?: { merge: boolean }): Promise<unknown> }
interface Query { where(f: string, op: string, v: unknown): Query; orderBy(f: string): Query; limit(n: number): Query; get(): Promise<{ docs: Array<DocSnap & { ref: DocRef }> }> }
interface Tx { get(ref: DocRef): Promise<DocSnap>; set(ref: DocRef, data: Record<string, unknown>, opts?: { merge: boolean }): void; create(ref: DocRef, data: Record<string, unknown>): void }
export interface FirestoreLike {
  collection(name: string): Query & { doc(id?: string): DocRef };
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

const toJob = (s: DocSnap): Job => ({ id: s.id, ...(s.data() as Omit<Job, 'id'>) });

export class FirestoreJobStore implements JobStore {
  constructor(private readonly db: FirestoreLike) {}

  async enqueue(job: Job): Promise<'created' | 'exists'> {
    const ref = this.db.collection('pw_jobs').doc(job.id);
    return this.db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return 'exists' as const;
      const { id: _id, ...data } = job;
      tx.create(ref, data);
      return 'created' as const;
    });
  }

  async claim(owner: string, now: number, leaseMs: number, kinds?: JobKind[]): Promise<Job | null> {
    // Candidates are read outside the transaction; the transaction re-reads the one it takes.
    const due = await this.db.collection('pw_jobs').where('notBefore', '<=', now).orderBy('notBefore').limit(25).get();
    for (const cand of due.docs) {
      const seen = toJob(cand);
      if ((kinds && !kinds.includes(seen.kind)) || !canClaim(seen, now)) continue;
      const got = await this.db.runTransaction(async (tx) => {
        const fresh = await tx.get(cand.ref);
        if (!fresh.exists) return null;
        const job = toJob(fresh);
        if (!canClaim(job, now)) return null; // someone else got there first
        const next = claimed(job, owner, now, leaseMs);
        const { id: _id, ...data } = next;
        tx.set(cand.ref, data, { merge: true });
        return next;
      });
      if (got) return got;
    }
    return null;
  }

  async renew(jobId: string, owner: string, now: number, leaseMs: number): Promise<boolean> {
    const ref = this.db.collection('pw_jobs').doc(jobId);
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists || !holds(toJob(s), owner, now)) return false;
      tx.set(ref, { leaseUntil: now + leaseMs }, { merge: true });
      return true;
    });
  }

  async complete(jobId: string, owner: string, ok: boolean, error: string | null, now: number): Promise<boolean> {
    const ref = this.db.collection('pw_jobs').doc(jobId);
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return false;
      const job = toJob(s);
      if (!holds(job, owner, now)) return false;
      const { id: _id, ...data } = completed(job, ok, error);
      tx.set(ref, ok ? data : { ...data, notBefore: now + backoffMs(job.attempts) }, { merge: true });
      return true;
    });
  }

  async writeRun(run: RunRecord): Promise<void> {
    await this.db.collection('pw_runs').doc().set({ ...run });
  }
}
