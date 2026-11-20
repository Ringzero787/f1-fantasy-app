/**
 * What the worker's alert emails say (F-153). On 2026-11-17 the box lost its internet connection
 * for half an hour and the owner got one email whose whole body was
 * "Error: previous tick still running / at …/serve.js:155:23" — true, and no use to anyone reading
 * it on a phone. Every email now answers, in this order: what happened, what the worker does about
 * it by itself, what the reader has to do (usually nothing), what players see, and only then the
 * technical detail. Nothing here touches Firestore or the network, so it is pinned by tests.
 *
 * The record in `pw_alerts` keeps its short subject and raw body: the ops check prints the
 * subject, and the raw error is what a session debugging it wants.
 */

export interface Email { subject: string; text: string }

export type TickErrorKind = 'deadline' | 'overlap' | 'network' | 'other';

/** Which family a failed tick's error belongs to. `message` is the Error's message, not its stack. */
export function classifyTickError(message: string): TickErrorKind {
  if (/previous tick still running/i.test(message)) return 'overlap';
  if (/did not finish within/i.test(message)) return 'deadline';
  if (/UNAVAILABLE|DEADLINE_EXCEEDED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|fetch failed|socket hang up|Name resolution|network/i.test(message)) return 'network';
  return 'other';
}

/**
 * Whether a failed tick is worth an email (F-166). On 2026-11-20 one `14 UNAVAILABLE` from
 * Firestore at 21:39 UTC cost the owner two emails (failed, then "is back" at 21:45) for a blip
 * that fixed itself in one tick. A network failure is mailed from the second in a row, about ten
 * minutes of real trouble. A deadline (the tick already hung for 25 minutes) and an error of an
 * unknown kind are mailed at once; an overlap only follows a deadline, so it is never the first.
 */
export function emailTickFailure(message: string, failures: number): boolean {
  const kind = classifyTickError(message);
  return kind === 'deadline' || kind === 'other' || failures >= 2;
}

/**
 * The loop's bookkeeping for a failed tick (F-166): whether to mail it, and the new `failedSince`
 * that arms the "is back" email. Only a failure that was mailed arms it, so a silent blip is
 * followed by silence. A `--once` run is a person at a terminal: it has no next tick, so it mails.
 */
export function onTickFailure(t: { message: string; failures: number; failedSince: number | null; startedAt: number; once: boolean }): { send: boolean; failedSince: number | null } {
  const send = t.once || emailTickFailure(t.message, t.failures);
  return { send, failedSince: send ? t.failedSince ?? t.startedAt : t.failedSince };
}

/** "10:50 UTC", or "04:50 CST (10:50 UTC)" when a time zone is given. An unknown zone falls back to UTC alone. */
export function clock(ms: number, tz?: string): string {
  const utc = `${new Date(ms).toISOString().slice(11, 16)} UTC`;
  if (!tz || tz === 'UTC') return utc;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' }).formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('hour')}:${get('minute')} ${get('timeZoneName')} (${utc})`;
  } catch { return utc; }
}

/** "42 minutes", "1 hour", "3 hours 5 minutes", "2 days 4 hours". */
export function span(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000));
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (mins < 60) return unit(mins, 'minute');
  const hours = Math.floor(mins / 60);
  if (hours < 48) return mins % 60 ? `${unit(hours, 'hour')} ${unit(mins % 60, 'minute')}` : unit(hours, 'hour');
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${unit(days, 'day')} ${unit(hours % 24, 'hour')}` : unit(days, 'day');
}

const CHECK = [
  'To look for yourself, on the box:',
  '  systemctl status pitwall-worker',
  '  journalctl -u pitwall-worker -n 50',
].join('\n');

const footer = (runner: string, commit: string | null, at: number) => `Sent by the Pit Wall worker on ${runner} (release ${commit ?? 'unknown'}) at ${new Date(at).toISOString()}.`;

export interface TickFailure {
  /** the Error's message */
  message: string;
  /** stack or message, shown last */
  detail: string;
  /** consecutive failed ticks, counting this one */
  failures: number;
  maxFailures: number;
  /** pause between ticks */
  tickMs: number;
  /** when the tick that is stuck (or that failed) began */
  startedAt: number;
  at: number;
  runner: string;
  commit: string | null;
  tz?: string;
}

/** The email for a failed tick. */
export function tickFailedEmail(f: TickFailure): Email {
  const kind = classifyTickError(f.message);
  const last = f.failures >= f.maxFailures;
  const nth = `${f.failures} of ${f.maxFailures}`;
  const started = clock(f.startedAt, f.tz);
  const what: Record<TickErrorKind, { subject: string; happened: string }> = {
    deadline: {
      subject: 'Worker stalled, probably a network drop',
      happened: `The worker started a round of work at ${started} and it had still not finished ${span(f.at - f.startedAt)} later, so it was given up on. A round normally takes a few seconds. This is nearly always the box losing its internet connection, or Google's database not answering.`,
    },
    overlap: {
      subject: 'Worker still stalled',
      happened: `The round of work that started at ${started} is still stuck (${span(f.at - f.startedAt)} so far), so the worker did not start a new one beside it. This is the same stall as the earlier email, not a second problem. The usual cause is the box losing its internet connection, or Google's database not answering.`,
    },
    network: {
      subject: 'Worker could not reach the database',
      happened: `The worker tried to do its round of work at ${started} and could not reach Google's database. That points at the box's internet connection or at an outage on Google's side, not at the app.`,
    },
    other: {
      subject: 'Worker hit an error',
      happened: `The worker's round of work at ${started} ended with an error it did not expect. This one is not the usual network drop, so the technical detail at the bottom is worth a look.`,
    },
  };
  const next = last
    ? `That is ${nth} failures in a row, so the worker is restarting itself now. It is back about 15 seconds later with a fresh connection and carries on where it left off.`
    : `It tries again in ${span(f.tickMs)}. This is failure ${nth} in a row; at ${f.maxFailures} the worker restarts itself and carries on.`;
  const todo = kind === 'other'
    ? `Nothing urgent. If this keeps arriving, send the technical detail below to a Claude session in the Undercut repo.`
    : `Nothing right now. An "is back" email follows once the worker has done a normal round again. If none has arrived within an hour, check the box's internet connection first.`;
  return {
    subject: `[pit wall] ${what[kind].subject} (${nth})`,
    text: [
      `WHAT HAPPENED\n${what[kind].happened}`,
      `WHAT THE WORKER DOES ABOUT IT\n${next}`,
      `WHAT YOU NEED TO DO\n${todo}`,
      `WHAT PLAYERS SEE\nNo change. The portal and the app's Pit Wall block keep showing the last published numbers. A daily refresh that was due during the stall runs late, as soon as the worker is back.`,
      CHECK,
      `TECHNICAL DETAIL\n${f.detail}`,
      footer(f.runner, f.commit, f.at),
    ].join('\n\n'),
  };
}

export interface JobFailure { jobId: string; error: string; finishedAt: number; runner: string; commit: string | null; tz?: string }

/** What a job id means to a reader: "projections__2026__23__daily-20261117" → "the daily numbers refresh for round 23". */
export function jobLabel(jobId: string): string {
  // lease.ts writes 'x' for a job with no round or no session
  const [type, , round, session] = jobId.split('__').map((p) => (p === 'x' ? '' : p));
  const what = type === 'projections' ? 'numbers refresh' : type === 'briefing' ? 'written briefing' : `"${type}" job`;
  const when = !session ? '' : session.startsWith('daily') ? 'daily ' : `post-${session} `;
  return `the ${when}${what}${round ? ` for round ${round}` : ''}`;
}

/** The email for a job that ran and failed. */
export function jobFailedEmail(j: JobFailure): Email {
  const label = jobLabel(j.jobId);
  return {
    subject: `[pit wall] A scheduled job failed: ${label}`,
    text: [
      `WHAT HAPPENED\nThe worker ran ${label} at ${clock(j.finishedAt, j.tz)} and it failed. The worker itself is fine and still running.`,
      `WHAT THE WORKER DOES ABOUT IT\nIt tries a failed job again by itself, up to five times in all, and emails each time one fails. After the fifth it leaves the job alone and the next scheduled run takes over. If a later try works there is no further email.`,
      `WHAT YOU NEED TO DO\nNothing if this is a one-off. If the same job fails again, or the portal's "data as of" time stops moving, send the technical detail below to a Claude session in the Undercut repo.`,
      `WHAT PLAYERS SEE\nThe portal keeps the previous numbers until a run succeeds.`,
      `TECHNICAL DETAIL\njob ${j.jobId}\n${j.error}`,
      footer(j.runner, j.commit, j.finishedAt),
    ].join('\n\n'),
  };
}

export interface Stale { asOf: string | null; ageMs: number; round: number | null; at: number; runner: string; commit: string | null; tz?: string }

/** The once-a-day email for published data older than 30 hours. */
export function staleEmail(s: Stale): Email {
  const age = Number.isFinite(s.ageMs) ? span(s.ageMs) : null;
  return {
    subject: `[pit wall] Portal data is out of date${age ? ` (${age} old)` : ''}`,
    text: [
      `WHAT HAPPENED\n${age ? `The newest numbers on the Pit Wall portal were published ${age} ago` : 'Nothing has been published to the Pit Wall portal'}${s.round === null ? '' : `; the current round is ${s.round}`}. They should never be more than about a day old. The worker is running (it sent this), so the daily refresh is failing or not being picked up.`,
      `WHAT THE WORKER DOES ABOUT IT\nIt keeps trying the daily refresh and sends this reminder once a day until fresh numbers are out. Right after an outage one of these is normal: it clears by itself at the next refresh (06:00 UTC).`,
      `WHAT YOU NEED TO DO\nIf the worker was down recently, wait for the next refresh. Otherwise ask a Claude session in the Undercut repo to look into the Pit Wall queue — this is the case that needs a person.`,
      `WHAT PLAYERS SEE\nOld numbers on the portal and in the app's Pit Wall block, with an old "data as of" time.`,
      CHECK,
      `TECHNICAL DETAIL\nnewest pw_public asOf ${s.asOf ?? 'none'}; round ${s.round ?? '?'}`,
      footer(s.runner, s.commit, s.at),
    ].join('\n\n'),
  };
}

/**
 * How long the worker was away, or null when the gap is ordinary. `prevTickAt` is the heartbeat
 * the last good tick left; `limitMs` should be longer than the longest legitimate tick plus one
 * pause, so a long job or a deploy restart does not count as an outage.
 */
export function outageGap(prevTickAt: unknown, now: number, limitMs: number): number | null {
  if (typeof prevTickAt !== 'number' || !Number.isFinite(prevTickAt)) return null;
  const gap = now - prevTickAt;
  return gap > limitMs ? gap : null;
}

/**
 * Whether this good tick owes the owner an all-clear, and since when the worker was away (null:
 * nothing owed). Two ways to owe one. `failedSince` is set when this process sent a failure email
 * and has not had a good tick since: the reader was told to expect an "is back", however short the
 * trouble was. Otherwise the heartbeat gap decides, which is what survives a restart — `limitMs`
 * is short for a process's first tick (nothing of its own can have been running) and long after
 * that (a tick may legitimately use its whole deadline).
 */
export function allClearSince(prevTickAt: unknown, now: number, limitMs: number, failedSince: number | null): number | null {
  const prev = typeof prevTickAt === 'number' && Number.isFinite(prevTickAt) && prevTickAt < now ? prevTickAt : null;
  if (failedSince !== null) return prev ?? Math.min(failedSince, now);
  return outageGap(prev, now, limitMs) === null ? null : prev;
}

export interface Back { prevTickAt: number; at: number; runner: string; commit: string | null; tz?: string }

/** The all-clear after a gap: the first normal tick says the worker is back and how long it was away. */
export function backEmail(b: Back): Email {
  const gap = span(b.at - b.prevTickAt);
  return {
    subject: `[pit wall] Worker is back (was away ${gap})`,
    text: [
      `WHAT HAPPENED\nThe worker is running normally again. The last round of work it finished normally before this began at ${clock(b.prevTickAt, b.tz)}; it was away for ${gap} and came back at ${clock(b.at, b.tz)}.`,
      `WHAT THE WORKER DOES ABOUT IT\nIt picks up anything that came due while it was away. Work that is more than a day late is set aside, and the next scheduled run covers it.`,
      `WHAT YOU NEED TO DO\nNothing. If the stall emails keep coming back, the box's internet connection is the thing to look at.`,
      `WHAT PLAYERS SEE\nNo change while it was away: the portal kept the last published numbers. If the daily refresh was missed, the numbers update within a few minutes.`,
      footer(b.runner, b.commit, b.at),
    ].join('\n\n'),
  };
}
