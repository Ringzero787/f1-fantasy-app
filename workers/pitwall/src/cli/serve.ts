/**
 * The worker loop on forge (F-069): every few minutes, enqueue what the schedule says is due for
 * the current round, run one due job, write a heartbeat. systemd keeps it alive; the lease in
 * pw_jobs keeps a job from running twice even if a second copy is ever started.
 *
 *   SA_KEY=… node dist/workers/pitwall/src/cli/serve.js [--once] [--plan]   (--plan prints the due jobs and writes nothing)
 *
 * Alerts: a failed run writes pw_alerts/{jobId}_{ts} and, when RESEND_API_KEY and ALERT_TO are
 * set, sends one email written for a person (alertText.ts, F-153; ALERT_TZ adds local time). The outlooks read their settings from the environment through
 * `outlookSettings`, which is pure and tested — the flags are the only brake on model spend. The heartbeat is pw_status/worker; the portal's "data as of" is the
 * reader-facing check.
 */
import { runProjections, loadRound } from '../jobs/projections';
import { runOnce } from '../jobs/runner';
import { FirestoreJobStore } from '../jobs/firestoreStore';
import { dueJobs } from '../jobs/schedule';
import { runOutlooks } from '../jobs/outlooks';
import { outlookSettings } from '../jobs/outlookSettings';
import { withDeadline, afterTick, TICK_DEADLINE_MS, MAX_TICK_FAILURES } from '../jobs/watchdog';
import { STALE_AFTER_MS } from '../jobs/lease';
import { tickFailedEmail, jobFailedEmail, staleEmail, backEmail, allClearSince, onTickFailure, type Email } from '../jobs/alertText';
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

const TZ = process.env.ALERT_TZ;
/** The longest ordinary distance between two heartbeats: a tick that used its whole deadline, plus the pause. */
const GAP_LIMIT_MS = TICK_DEADLINE_MS + TICK_MS;
/** A process's first tick has no long tick of its own behind it: two missed ticks is already an outage (a deploy restart is seconds). */
const FIRST_GAP_LIMIT_MS = 2 * TICK_MS;
/** F-153 all-clear state: when this process first sent a failure email with no good tick since, and whether it has had a good tick at all. */
let failedSince: number | null = null;
let firstTick = true;

/**
 * `subject` and `body` are the record in pw_alerts (the ops check prints the subject; `record: false`
 * skips it, for good news that is not an alert). `email` is what the owner reads; without it the
 * record's own words are sent. `send: false` writes the record only (F-166).
 */
async function alert(subject: string, body: string, email?: Email, record = true, send = true): Promise<void> {
  const id = `${Date.now()}_${subject.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}`;
  if (record) await db.collection('pw_alerts').doc(id).set({ at: Date.now(), subject, body, runner: OWNER }).catch(() => undefined);
  if (!send) return;
  const apiKey = process.env.RESEND_API_KEY, to = process.env.ALERT_TO;
  if (!apiKey || !to) return;
  try {
    const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.ALERT_FROM ?? 'Pit Wall worker <noreply@humannpc.com>', to: [to], subject: email?.subject ?? `[pit wall] ${subject}`, text: email?.text ?? body }), signal: AbortSignal.timeout(10000) });
    if (!res.ok) log(`alert email refused: ${res.status}`);
  } catch (e) { log(`alert email failed: ${e instanceof Error ? e.message : e}`); }
}

const handlers = {
  briefing: async (job: Job, report: (k: string, n: number) => void) => {
    if (job.round === null) throw new Error('outlooks need a round');
    const run = await runOutlooks(db, { season: job.season, round: job.round, apply: true, ...outlookSettings(process.env) });
    report('written', run.written); report('refused', run.refused); report('skipped', run.skipped); report('failed', run.failed);
    report('inputTokens', run.inputTokens); report('outputTokens', run.outputTokens);
    log(`outlooks round ${job.round}: ${run.written} written, ${run.refused} refused, ${run.failed} failed, ${run.skipped} skipped, ${run.inputTokens + run.outputTokens} tokens${run.refusals.length ? ` — ${run.refusals.slice(0, 5).join('; ')}` : ''}`);
    // A run that wrote nothing at all and hit trouble is worth saying out loud.
    if (run.failed > 0 && run.written === 0) throw new Error(`no outlook written: ${run.refusals.slice(0, 3).join('; ')}`);
  },
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
    for (const job of dueJobs(now, round)) {
      // F-133: the schedule looks back 36 h; a job that would be skipped the moment it is claimed is not worth a row
      if (job.notBefore < now.getTime() - STALE_AFTER_MS) continue;
      if ((await store.enqueue(job)) === 'created') { enqueued += 1; log(`queued ${job.id} not before ${new Date(job.notBefore).toISOString()}`); }
    }
  }
  // One real job per tick, but a stale job is one transaction, not model spend: after an outage the
  // backlog is set aside in this tick so today's work is not behind it for the next two hours.
  // `skipped` is terminal (canClaim refuses it), so the loop ends; the cap is belt and braces.
  let run: Awaited<ReturnType<typeof runOnce>> = null;
  for (let i = 0; i < 50; i += 1) {
    run = await runOnce(store, handlers, { owner: OWNER, leaseMs: 10 * 60 * 1000, renewEveryMs: 60 * 1000, commit, staleAfterMs: STALE_AFTER_MS });
    if (!run || !run.counts.stale) break;
    log(`skipped ${run.jobId}: due ${run.counts.lateHours} h ago (F-133 stale limit)`);
  }
  if (run && !run.ok) await alert(`job ${run.jobId} failed`, `${run.error ?? 'unknown error'}\nrunner ${OWNER}, commit ${commit ?? '?'}, ${new Date(run.finishedAt).toISOString()}`,
    jobFailedEmail({ jobId: run.jobId, error: run.error ?? 'unknown error', finishedAt: run.finishedAt, runner: OWNER, commit, tz: TZ }));
  // Read before the stale check, by itself: a failed stale check must not cost the all-clear below.
  const prevTickAt: unknown = await db.collection('pw_status').doc('worker').get().then((d: { data(): { lastTickAt?: unknown } | undefined }) => d.data()?.lastTickAt, () => undefined);
  // Self-check: if the newest published payload is more than 30 hours old, say so once a day, whatever the queue thinks.
  try {
    const newest = await db.collection('pw_public').orderBy('asOf', 'desc').limit(1).get();
    const asOf = newest.docs[0]?.data()?.asOf as string | undefined;
    const age = asOf ? now.getTime() - Date.parse(asOf) : Number.POSITIVE_INFINITY;
    const day = now.toISOString().slice(0, 10);
    const status = (await db.collection('pw_status').doc('worker').get()).data() ?? {};
    if (age > 30 * 3600 * 1000 && status.lastStaleAlertDay !== day) {
      await alert('published data is stale', `newest pw_public asOf ${asOf ?? 'none'} (${Math.round(age / 3600000)} h old); round ${round?.round ?? '?'}; runner ${OWNER}`,
        staleEmail({ asOf: asOf ?? null, ageMs: age, round: round?.round ?? null, at: now.getTime(), runner: OWNER, commit, tz: TZ }));
      await db.collection('pw_status').doc('worker').set({ lastStaleAlertDay: day }, { merge: true });
    }
  } catch (e) { log(`stale check failed: ${e instanceof Error ? e.message : e}`); }
  const beat: boolean = await db.collection('pw_status').doc('worker').set({ runner: OWNER, commit, lastTickAt: now.getTime(), round: round?.round ?? null, enqueued, lastRun: run ? { jobId: run.jobId, ok: run.ok, error: run.error, finishedAt: run.finishedAt, counts: run.counts } : null }, { merge: true }).then(() => true, (e: Error) => { log(`heartbeat failed: ${e.message}`); return false; });
  // F-153: a good tick after a failure email, or after a long silence, says so — a stall email is
  // not the last word. Only once the new heartbeat is written: if that write failed the gap would
  // still be there on the next tick and the all-clear would go out every five minutes. A --once run
  // is a person at a terminal, not the service coming back. The time is the clock's, not this
  // tick's start: a tick that hung and then finished came back now, not when it began.
  if (!beat || once) return;
  const back = Date.now();
  const since = allClearSince(prevTickAt, back, firstTick ? FIRST_GAP_LIMIT_MS : GAP_LIMIT_MS, failedSince);
  failedSince = null; firstTick = false;
  if (since !== null) {
    log(`back after ${Math.round((back - since) / 60000)} min without a good tick`);
    await withDeadline(alert('worker is back', '', backEmail({ prevTickAt: since, at: back, runner: OWNER, commit, tz: TZ }), false), 30 * 1000, 'alert').catch((err: Error) => log(`alert failed: ${err.message}`));
  }
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
  // F-132: a tick has a deadline (watchdog.ts says why 25 min), and three failed ticks in a row
  // end the process so systemd restarts it with a fresh Firestore client. The loop ran eighteen
  // days inside one stuck call before this; the alert is best-effort and gets its own deadline so
  // it cannot hang the exit.
  let failures = 0;
  let inFlight: Promise<void> | null = null;
  let startedAt = Date.now();
  for (;;) {
    let ok = true;
    try {
      // a tick that outlived its deadline is still running: do not start a second one beside it
      if (inFlight) throw new Error('previous tick still running');
      startedAt = Date.now();
      const current = tick();
      inFlight = current;
      current.finally(() => { if (inFlight === current) inFlight = null; }).catch(() => undefined);
      await withDeadline(current, TICK_DEADLINE_MS, 'tick');
    } catch (e) {
      ok = false;
      const message = e instanceof Error ? e.message : String(e);
      log(`tick failed: ${message}`);
      const detail = e instanceof Error ? e.stack ?? e.message : String(e);
      // F-166: one network blip that the next tick recovers from is recorded (pw_alerts, so the
      // ops check still lists it) but not mailed, and does not arm the "is back" that would follow.
      const decision = onTickFailure({ message, failures: failures + 1, failedSince, startedAt, once });
      failedSince = decision.failedSince;
      if (!decision.send) log('first network failure in a row: recorded, not mailed (F-166)');
      const email = decision.send ? tickFailedEmail({ message, detail, failures: failures + 1, maxFailures: MAX_TICK_FAILURES, tickMs: TICK_MS, startedAt, at: Date.now(), runner: OWNER, commit, tz: TZ }) : undefined;
      await withDeadline(alert('worker tick failed', detail, email, true, decision.send), 30 * 1000, 'alert').catch((err: Error) => log(`alert failed: ${err.message}`));
    }
    const next = afterTick(ok, failures, MAX_TICK_FAILURES);
    failures = next.failures;
    if (next.action === 'exit') { log(`${failures} ticks failed in a row — exiting for systemd to restart the worker`); process.exit(1); }
    if (once) break;
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
})();
