/**
 * The worker's own watchdog (F-132). On 2026-10-11 the loop in serve.ts stopped inside a tick —
 * the Firestore client had lost name resolution two days earlier and a later call never settled —
 * and systemd saw a healthy process for eighteen days while the portal showed round 19. Nothing
 * here touches Firestore: a tick gets a deadline, and a run of failed ticks ends the process so
 * systemd (Restart=always) brings it back with a fresh client.
 */

/** Reject `p` if it has not settled after `ms`; the timer never keeps the process alive. */
export function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not finish within ${Math.round(ms / 1000)} s`)), ms);
    if (typeof timer === 'object' && timer && 'unref' in timer) (timer as { unref: () => void }).unref();
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

/** The tick deadline: well inside the job lease (10 min) and the tick period, so a stuck call is noticed within one period. */
export const TICK_DEADLINE_MS = 4 * 60 * 1000;
/** Three failed ticks in a row — at the default five-minute period, about fifteen minutes of silence. */
export const MAX_TICK_FAILURES = 3;
