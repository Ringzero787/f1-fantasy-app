/**
 * The worker's own watchdog (F-132). On 2026-10-11 the loop in serve.ts stopped inside a tick —
 * the Firestore client had lost name resolution two days earlier and a later call never settled —
 * and systemd saw a healthy process for eighteen days while the portal showed round 19. Nothing
 * here touches Firestore: a tick gets a deadline, and a run of failed ticks ends the process so
 * systemd (Restart=always) brings it back with a fresh client.
 */

/**
 * Reject `p` if it has not settled after `ms`. The timer is cleared as soon as `p` settles, and it
 * is deliberately NOT unref'd: a hung call may leave nothing else keeping the event loop alive,
 * and then an unref'd timer never fires and the process just ends without a word.
 */
export function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not finish within ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([p, deadline]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}

/**
 * What the loop does after a tick: `failures` is the number of consecutive failed ticks, counting
 * this one. A single failure is logged and the loop carries on, as before; `maxFailures` in a row
 * means the client is not coming back on its own and the process should exit non-zero.
 */
export function afterTick(ok: boolean, failures: number, maxFailures: number): { failures: number; action: 'continue' | 'exit' } {
  if (ok) return { failures: 0, action: 'continue' };
  const n = failures + 1;
  return { failures: n, action: n >= maxFailures ? 'exit' : 'continue' };
}

/**
 * The tick deadline. A tick awaits the job it runs, and the longest legitimate job is a briefing
 * with outlooks on: a 20-minute run deadline of its own (outlooks.ts) plus one in-flight CLI call
 * of up to three minutes. The job lease is no bound — it is renewed every minute while the job
 * runs. The deadline races the tick, it does not cancel it: the loop treats an overrunning tick as
 * failed and does not start another while it is still pending (so two ticks never run at once);
 * the exit after repeated failures may cut a handler mid-flight, whose job the lease then hands
 * back within ten minutes (attempts +1). A hung client is noticed in 25 + 2 × 5 minutes.
 */
export const TICK_DEADLINE_MS = 25 * 60 * 1000;
/** Three failed ticks in a row. */
export const MAX_TICK_FAILURES = 3;
