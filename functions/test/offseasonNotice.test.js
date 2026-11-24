// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// F-155: the season-reset notice — its wording, who gets it, and the rollover's gate on it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const N = require('../lib/season/offseasonNotice.js');
const R = require('../lib/season/rollover.js');

const tok = 'ExponentPushToken[abc]';
const users = [
  { id: 'real', data: { email: 'a@x', pushToken: tok, settings: { notifications: true } } },
  { id: 'tester', data: { email: 't@x', pushToken: tok, testAccount: true } },
  { id: 'quiet', data: { email: 'q@x', pushToken: tok, settings: { notifications: false } } },
  { id: 'notoken', data: { email: 'n@x', pushToken: null } },
  { id: 'fcm', data: { pushToken: 'fcm-raw-token' } },
];

test('test accounts get nothing; everyone else an inbox entry; push only with an Expo token and notifications on', () => {
  const r = N.noticeRecipients(users);
  assert.deepEqual(r.inbox, ['real', 'quiet', 'notoken', 'fcm']);
  assert.deepEqual(r.push, [{ uid: 'real', token: tok }]);
  assert.equal(r.tests, 1);
});

test('a re-run skips everyone already in the ledger', () => {
  const r = N.noticeRecipients(users, new Set(['real', 'quiet']));
  assert.deepEqual([r.inbox, r.push, r.skipped], [['notoken', 'fcm'], [], 2]);
});

test('the admin broadcast leaves test accounts out of push, inbox and email', () => {
  assert.deepEqual(N.broadcastRecipients(users), { userIds: ['real', 'quiet', 'notoken', 'fcm'], emails: ['a@x', 'q@x', 'n@x'] });
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'notifications', 'sendBroadcast.ts'), 'utf8');
  assert.match(src, /broadcastRecipients\(usersSnapshot\.docs/);
  assert.match(src, /select\('email', 'testAccount'\)/);
});

test('the wording names the reset day, what is kept, the open market, the refund and the opener; no trademark term', () => {
  const b = N.noticeBody('Monday 14 December');
  for (const s of ['Monday 14 December', '$1,000', 'keeps its name', 'final table and champion', 'market stays open', 'give you back his price', '14 March 2027']) assert.ok(b.includes(s), s);
  for (const w of [/\bF1\b/, /Formula/i, /\bFIA\b/, /Grand Prix/i]) { assert.doesNotMatch(b, w); assert.doesNotMatch(N.NOTICE_TITLE, w); }
  assert.ok(N.NOTICE_TITLE.length <= 100 && b.length <= 2000, 'fits the admin broadcast limits');
});

test('the marker is read from a Timestamp, a number or an ISO string; absent is null', () => {
  assert.equal(N.noticeSentMs({ resetNotice: { sentAt: { toMillis: () => 5 } } }), 5);
  assert.equal(N.noticeSentMs({ resetNotice: { sentAt: 7 } }), 7);
  assert.equal(N.noticeSentMs({ resetNotice: { sentAt: '2026-12-10T00:00:00Z' } }), Date.parse('2026-12-10T00:00:00Z'));
  assert.equal(N.noticeSentMs({}), null);
  assert.equal(N.noticeSentMs({ resetNotice: { sentAt: 'soon' } }), null);
  assert.equal(N.noticeEmailMs({ resetNotice: { sentAt: 5, emailAt: { toMillis: () => 9 } } }), 9);
  assert.equal(N.noticeEmailMs({ resetNotice: { sentAt: 5 } }), null);
});

const H = 3600e3;
const NOW = Date.parse('2026-12-10T12:00:00Z');
const ready = (noticeSentMs, noticeEmailMs = NOW - 25 * H) => ({
  from: '2026', to: '2027', now: NOW, settleHours: 24, fromSeason: {}, currentSeason: '2026',
  fromRaces: [{ id: 'abu_dhabi_2026', status: 'completed', raceTimeMs: NOW - 96 * H }],
  pendingResultIds: [], scoredRaceIds: ['abu_dhabi_2026'], moonshots: [], calendarSize: 24, noticeSentMs, noticeEmailMs,
});

test('F-155 gate: the rollover refuses until the notice has been out NOTICE_LEAD_HOURS', () => {
  assert.deepEqual(R.rolloverBlockers(ready(NOW - 25 * H)), []);
  assert.match(R.rolloverBlockers(ready(null)).join(), /not been told about the reset/);
  assert.match(R.rolloverBlockers(ready(NOW - 2 * H)).join(), /went out 2\.0 h ago; wait 24 h/);
  assert.match(R.rolloverBlockers(ready(NOW - 25 * H, null)).join(), /reset email has not been stamped/, 'push + inbox alone do not open the gate');
  assert.equal(R.rolloverBlockers(ready(null, null)).length, 2);
  assert.equal(N.NOTICE_LEAD_HOURS, 24);
  const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'seasonRollover.js'), 'utf8');
  assert.match(script, /noticeSentMs: lib\('offseasonNotice\.js'\)\.noticeSentMs\(fromSeason\)/, 'the script feeds the gate from seasons/2026');
  assert.match(script, /noticeEmailMs: lib\('offseasonNotice\.js'\)\.noticeEmailMs\(fromSeason\)/);
});

test('the send script refuses while the reset day is the placeholder', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'sendSeasonNotice.js'), 'utf8');
  assert.match(src, new RegExp(`const RESET_DAY = '${N.DAY_PLACEHOLDER.replace(/[<>]/g, '\\$&')}'`));
  assert.match(src, /resetDay === N\.DAY_PLACEHOLDER/);
});
