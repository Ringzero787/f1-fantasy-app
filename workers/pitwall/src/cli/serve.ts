/**
 * The worker loop on forge (F-069): every few minutes, enqueue what the schedule says is due for
 * the current round, run one due job, write a heartbeat. systemd keeps it alive; the lease in
 * pw_jobs keeps a job from running twice even if a second copy is ever started.
 *
 *   SA_KEY=… node dist/workers/pitwall/src/cli/serve.js [--once] [--plan]   (--plan prints the due jobs and writes nothing)
 *
 * Alerts: a failed run writes pw_alerts/{jobId}_{ts} and, when RESEND_API_KEY and ALERT_TO are
 * set, sends one email. The heartbeat is pw_status/worker; the portal's "data as of" is the
 * reader-facing check.
 */
import { runProjections, loadRound } from '../jobs/projections';
import { runOnce } from '../jobs/runner';
import { FirestoreJobStore } from '../jobs/firestoreStore';
import { dueJobs } from '../jobs/schedule';
import type { Job } from '../jobs/types';

const args = process.argv.slice(2);
const once = args.includes('--once');
const plan = args.includes('--plan');
const EXPECTED_PROJECT = 'f1-app-18077';
const OWNER = process.env.PW_RUNNER ?? 'forge';
const TICK_MS = Number(process.env.PW_TICK_MS ?? 5 * 60 * 1000);
const SEASON = process.env.PW_SEASON ?? '2026';
const key = process.env.SA_KEY;
if (!key) { console.error('SA_KEY must point at the service-account key.'); process.exit(2); }
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cred = require(key) as { project_id: string };
if (cred.project_id !== EXPECTED_PROJECT) { console.error(`Refusing to run: key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}.`); process.exit(2); }
// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin = require(require.resolve('firebase-admin', { paths: [process.env.PW_ADMIN_MODULES ?? '/data/f1-app/functions/node_modules'] }));
admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });
const db = admin.firestore();
const store = new FirestoreJobStore(db);
const commit = process.env.PW_COMMIT ?? null;

const log = (msg: string) => console.log(`${new Date().toISOString()} [pw] ${msg}`);

async function alert(subject: string, body: string): Promise<void> {
  const id = `${Date.now()}_${subject.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}`;
  await db.collection('pw_alerts').doc(id).set({ at: Date.now(), subject, body, runner: OWNER }).catch(() => undefined);
  const apiKey = process.env.RESEND_API_KEY, to = process.env.ALERT_TO;
  if (!apiKey || !to) return;
  try {
    const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.ALERT_FROM ?? 'Pit Wall worker <noreply@humannpc.com>', to: [to], subject: `[pit wall] ${subject}`, text: body }), signal: AbortSignal.timeout(10000) });
    if (!res.ok) log(`alert email refused: ${res.status}`);
  } catch (e) { log(`alert email failed: ${e instanceof Error ? e.message : e}`); }
}

const handlers = {
  projections: async (job: Job, report: (k: string, n: number) => void) => {
    const run = await runProjections(db, { season: job.season, sessionKey: job.sessionKey ?? 'daily', apply: true });
    report('wrote', run.wrote.length); report('drivers', run.counts.drivers); report('news', run.news.length);
    log(`published round ${run.round} (${run.raceId}) session ${run.sessionKey}: ${run.wrote.join(', ')}`);
  },
};

async function tick(): Promise<void> {
  const now = new Date();
  const round = await loadRound(db, SEASON);
  let enqueued = 0;
  if (round) {
    for (const job of dueJobs(now, round)) if ((await store.enqueue(job)) === 'created') { enqueued += 1; log(`queued ${job.id} not before ${new Date(job.notBefore).toISOString()}`); }
  }
  const run = await runOnce(store, handlers, { owner: OWNER, leaseMs: 10 * 60 * 1000, renewEveryMs: 60 * 1000, commit });
  if (run && !run.ok) await alert(`job ${run.jobId} failed`, `${run.error ?? 'unknown error'}\nrunner ${OWNER}, commit ${commit ?? '?'}, ${new Date(run.finishedAt).toISOString()}`);
  await db.collection('pw_status').doc('worker').set({ runner: OWNER, commit, lastTickAt: now.getTime(), round: round?.round ?? null, enqueued, lastRun: run ? { jobId: run.jobId, ok: run.ok, error: run.error, finishedAt: run.finishedAt, counts: run.counts } : null }, { merge: true }).catch((e: Error) => log(`heartbeat failed: ${e.message}`));
}

(async () => {
  if (plan) {
    const round = await loadRound(db, SEASON);
    if (!round) { console.log('no current round'); return; }
    console.log(`round ${round.round}: ${round.sessions.map((s) => `${s.key} ${s.at.toISOString()}`).join(' · ')}`);
    for (const j of dueJobs(new Date(), round)) console.log(`  would queue ${j.id.padEnd(40)} not before ${new Date(j.notBefore).toISOString()}`);
    return;
  }
  log(`worker ${OWNER} starting (season ${SEASON}, tick ${TICK_MS} ms, commit ${commit ?? '?'})`);
  for (;;) {
    try { await tick(); } catch (e) { log(`tick failed: ${e instanceof Error ? e.message : e}`); await alert('worker tick failed', e instanceof Error ? e.stack ?? e.message : String(e)); }
    if (once) break;
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
})();
