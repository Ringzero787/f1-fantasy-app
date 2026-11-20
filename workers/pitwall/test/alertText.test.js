// node --test test/*.test.js — what the worker's alert emails say (F-153).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyTickError, clock, span, tickFailedEmail, jobLabel, jobFailedEmail, staleEmail, outageGap, allClearSince, backEmail, emailTickFailure, onTickFailure } = require('../dist/workers/pitwall/src/jobs/alertText.js');

const AT = Date.parse('2026-11-17T10:49:42Z');
const base = { failures: 2, maxFailures: 3, tickMs: 300000, startedAt: Date.parse('2026-11-17T10:19:12Z'), at: AT, runner: 'forge', commit: '0bf6972' };
const SECTIONS = ['WHAT HAPPENED', 'WHAT THE WORKER DOES ABOUT IT', 'WHAT YOU NEED TO DO', 'WHAT PLAYERS SEE', 'TECHNICAL DETAIL'];
/** every section present, in the spec's order */
const inOrder = (text, sections = SECTIONS) => {
  let at = -1;
  for (const s of sections) { const i = text.indexOf(s); assert.ok(i > at, `${s} missing or out of order`); at = i; }
};

test('classifyTickError names the four families', () => {
  assert.equal(classifyTickError('previous tick still running'), 'overlap');
  assert.equal(classifyTickError('tick did not finish within 1500 s'), 'deadline');
  assert.equal(classifyTickError('14 UNAVAILABLE: No connection established'), 'network');
  assert.equal(classifyTickError('getaddrinfo EAI_AGAIN firestore.googleapis.com'), 'network');
  assert.equal(classifyTickError("Cannot read properties of undefined (reading 'round')"), 'other');
});

test('clock prints UTC, adds local time for a zone, and survives a bad zone', () => {
  assert.equal(clock(AT), '10:49 UTC');
  assert.equal(clock(AT, 'America/Chicago'), '04:49 CST (10:49 UTC)');
  assert.equal(clock(AT, 'Not/AZone'), '10:49 UTC');
});

test('span reads as words', () => {
  assert.equal(span(30 * 1000), '1 minute');
  assert.equal(span(42 * 60000), '42 minutes');
  assert.equal(span(60 * 60000), '1 hour');
  assert.equal(span(185 * 60000), '3 hours 5 minutes');
  assert.equal(span(52 * 3600000), '2 days 4 hours');
});

test('the 2026-11-17 email: the stack is the last thing in it, not the whole of it', () => {
  const stack = 'Error: previous tick still running\n    at /data/pitwall-worker/releases/0bf6972/dist/workers/pitwall/src/cli/serve.js:155:23';
  const e = tickFailedEmail({ ...base, message: 'previous tick still running', detail: stack });
  assert.equal(e.subject, '[pit wall] Worker still stalled (2 of 3)');
  inOrder(e.text);
  assert.ok(e.text.indexOf(stack) > e.text.indexOf('TECHNICAL DETAIL'));
  assert.match(e.text, /started at 10:19 UTC is still stuck \(31 minutes so far\)/);
  assert.match(e.text, /same stall as the earlier email/);
  assert.match(e.text, /tries again in 5 minutes\. This is failure 2 of 3/);
  assert.match(e.text, /Nothing right now/);
});

test('a tick past its deadline says how long it ran and blames the network', () => {
  const e = tickFailedEmail({ ...base, failures: 1, at: Date.parse('2026-11-17T10:44:12Z'), message: 'tick did not finish within 1500 s', detail: 'x' });
  assert.equal(e.subject, '[pit wall] Worker stalled, probably a network drop (1 of 3)');
  assert.match(e.text, /had still not finished 25 minutes later/);
});

test('the last failure says the worker is restarting, not that it will try again', () => {
  const e = tickFailedEmail({ ...base, failures: 3, message: 'previous tick still running', detail: 'x' });
  assert.match(e.text, /3 of 3 failures in a row, so the worker is restarting itself now/);
  assert.doesNotMatch(e.text, /tries again in/);
});

test('an unexpected error asks for a look and does not promise an "is back" email', () => {
  const e = tickFailedEmail({ ...base, failures: 1, message: 'boom', detail: 'Error: boom\n    at x' });
  assert.equal(e.subject, '[pit wall] Worker hit an error (1 of 3)');
  assert.match(e.text, /not the usual network drop/);
  assert.doesNotMatch(e.text, /"is back" email/);
});

test('a database error that fails fast is named as such, sections in order', () => {
  const e = tickFailedEmail({ ...base, failures: 1, message: '14 UNAVAILABLE: No connection established', detail: 'x' });
  assert.equal(e.subject, '[pit wall] Worker could not reach the database (1 of 3)');
  inOrder(e.text);
  assert.match(e.text, /"is back" email follows/);
});

test('jobLabel turns an id into words', () => {
  assert.equal(jobLabel('projections__2026__x__x'), 'the numbers refresh');
  assert.equal(jobLabel('projections__2026__23__daily-20261117'), 'the daily numbers refresh for round 23');
  assert.equal(jobLabel('briefing__2026__23__quali'), 'the post-quali written briefing for round 23');
  assert.equal(jobLabel('mystery'), 'the "mystery" job');
});

test('a failed job names the job in words and keeps the id and error at the bottom', () => {
  const e = jobFailedEmail({ jobId: 'projections__2026__23__daily-20261117', error: '14 UNAVAILABLE', finishedAt: AT, runner: 'forge', commit: null, tz: 'America/Chicago' });
  assert.equal(e.subject, '[pit wall] A scheduled job failed: the daily numbers refresh for round 23');
  assert.match(e.text, /at 04:49 CST \(10:49 UTC\)/);
  assert.match(e.text, /TECHNICAL DETAIL\njob projections__2026__23__daily-20261117\n14 UNAVAILABLE/);
  assert.match(e.text, /up to five times in all/);
  assert.match(e.text, /release unknown/);
  inOrder(e.text);
});

test('stale data gives the age in words, and copes with nothing published', () => {
  const e = staleEmail({ asOf: '2026-11-15T06:02:00Z', ageMs: 52 * 3600000, round: 23, at: AT, runner: 'forge', commit: 'abc' });
  assert.equal(e.subject, '[pit wall] Portal data is out of date (2 days 4 hours old)');
  assert.match(e.text, /published 2 days 4 hours ago; the current round is 23/);
  const none = staleEmail({ asOf: null, ageMs: Number.POSITIVE_INFINITY, round: null, at: AT, runner: 'forge', commit: 'abc' });
  assert.equal(none.subject, '[pit wall] Portal data is out of date');
  assert.match(none.text, /Nothing has been published/);
  inOrder(e.text); inOrder(none.text);
});

test('outageGap ignores an ordinary gap, a missing heartbeat and a non-number', () => {
  const limit = 30 * 60000;
  assert.equal(outageGap(AT - 5 * 60000, AT, limit), null);
  assert.equal(outageGap(AT - limit, AT, limit), null);
  assert.equal(outageGap(AT - 42 * 60000, AT, limit), 42 * 60000);
  assert.equal(outageGap(undefined, AT, limit), null);
  assert.equal(outageGap('1763376582000', AT, limit), null);
});

test('allClearSince: owed after a failure email however short, else only past the gap limit', () => {
  const long = 30 * 60000, first = 10 * 60000;
  // a failure email went out and the next tick is fine: owed, counted from the last good heartbeat
  assert.equal(allClearSince(AT - 10 * 60000, AT, long, AT - 5 * 60000), AT - 10 * 60000);
  // ...or from the first failure when there is no usable heartbeat
  assert.equal(allClearSince(undefined, AT, long, AT - 5 * 60000), AT - 5 * 60000);
  assert.equal(allClearSince(AT + 1000, AT, long, AT - 5 * 60000), AT - 5 * 60000);
  // no failure email from this process: the gap decides
  assert.equal(allClearSince(AT - 5 * 60000, AT, long, null), null);
  assert.equal(allClearSince(AT - 42 * 60000, AT, long, null), AT - 42 * 60000);
  // three fast failures then a restart leave about 15 minutes: quiet under the long limit, owed on a first tick
  assert.equal(allClearSince(AT - 15.5 * 60000, AT, long, null), null);
  assert.equal(allClearSince(AT - 15.5 * 60000, AT, first, null), AT - 15.5 * 60000);
  // a deploy restart is not an outage
  assert.equal(allClearSince(AT - 5.5 * 60000, AT, first, null), null);
  assert.equal(allClearSince(undefined, AT, first, null), null);
});

test('the all-clear says how long the worker was away', () => {
  const e = backEmail({ prevTickAt: AT - 42 * 60000, at: AT, runner: 'forge', commit: 'abc' });
  assert.equal(e.subject, '[pit wall] Worker is back (was away 42 minutes)');
  assert.match(e.text, /before this began at 10:07 UTC; it was away for 42 minutes and came back at 10:49 UTC/);
  inOrder(e.text, SECTIONS.slice(0, 4));
});

test('F-166: one network blip is not mailed, the second in a row is; a stall or unknown error is mailed at once', () => {
  // the 2026-11-20 21:39 UTC blip: recorded, not mailed, so no "is back" follows either
  assert.equal(emailTickFailure('14 UNAVAILABLE: The service is temporarily unavailable.', 1), false);
  assert.equal(emailTickFailure('getaddrinfo EAI_AGAIN firestore.googleapis.com', 1), false);
  assert.equal(emailTickFailure('14 UNAVAILABLE: The service is temporarily unavailable.', 2), true);
  assert.equal(emailTickFailure('fetch failed', 3), true);
  assert.equal(emailTickFailure('tick did not finish within 1500 s', 1), true);
  assert.equal(emailTickFailure('previous tick still running', 2), true);
  assert.equal(emailTickFailure("Cannot read properties of undefined (reading 'round')", 1), true);
});

test('F-166: a silent blip does not arm the all-clear; a mailed failure does, and keeps the first start', () => {
  const blip = '14 UNAVAILABLE: The service is temporarily unavailable.';
  const T1 = Date.parse('2026-11-20T21:39:00Z'), T2 = T1 + 330000;
  const first = onTickFailure({ message: blip, failures: 1, failedSince: null, startedAt: T1, once: false });
  assert.deepEqual(first, { send: false, failedSince: null });
  // ...so the good tick at 21:45 owes nothing: a 14-minute heartbeat gap is under the 30-minute limit
  assert.equal(allClearSince(Date.parse('2026-11-20T21:31:00Z'), Date.parse('2026-11-20T21:45:08Z'), 30 * 60000, first.failedSince), null);
  const second = onTickFailure({ message: blip, failures: 2, failedSince: first.failedSince, startedAt: T2, once: false });
  assert.deepEqual(second, { send: true, failedSince: T2 });
  assert.deepEqual(onTickFailure({ message: blip, failures: 3, failedSince: T2, startedAt: T2 + 330000, once: false }), { send: true, failedSince: T2 });
  // a --once run has no next tick to recover on
  assert.deepEqual(onTickFailure({ message: blip, failures: 1, failedSince: null, startedAt: T1, once: true }), { send: true, failedSince: T1 });
});
