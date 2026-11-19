// F-163. buildUndercutStats turns raw rows into the shared admin stats document.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUndercutStats, signupsByDay, activeWindows, toMillis, DAY_MS } = require('../lib/admin/statsCore.js');

const NOW = Date.parse('2026-11-19T12:00:00Z');
const ts = (ms) => ({ toMillis: () => ms });
const PASS = { tier: 'pitwall', expiresAt: NOW + 30 * DAY_MS, ref: 'pi_123' };

function base(overrides = {}) {
  return {
    now: NOW,
    users: [],
    lastSeen: new Map(),
    content: { teams: 0, leagues: 0, racesCompleted: 0, moonshots: 0 },
    usage: {
      teamsCreated: { today: 0, all: 0 }, leaguesCreated: { today: 0, all: 0 },
      moonshots: { today: 0, all: 0 }, purchases: { today: 0, all: 0 },
    },
    errors24h: 0,
    ...overrides,
  };
}

test('toMillis reads Timestamps, numbers, ISO strings and Dates; junk is 0', () => {
  assert.equal(toMillis(ts(5)), 5);
  assert.equal(toMillis(7), 7);
  assert.equal(toMillis('2026-11-19T12:00:00Z'), NOW);
  assert.equal(toMillis(new Date(NOW)), NOW);
  assert.equal(toMillis(null), 0);
  assert.equal(toMillis('not a date'), 0);
  assert.equal(toMillis(NaN), 0);
});

test('signupsByDay is 30 zero-filled UTC days, oldest first, ignoring older or missing times', () => {
  const s = signupsByDay([NOW, NOW - 1000, NOW - 2 * DAY_MS, NOW - 40 * DAY_MS, 0], NOW);
  const keys = Object.keys(s);
  assert.equal(keys.length, 30);
  assert.equal(keys[29], '2026-11-19');
  assert.equal(keys[0], '2026-10-21');
  assert.equal(s['2026-11-19'], 2);
  assert.equal(s['2026-11-17'], 1);
  assert.equal(Object.values(s).reduce((a, b) => a + b, 0), 3);
});

test('activeWindows nests day within week within month and skips unseen uids', () => {
  const seen = new Map([['a', NOW - 1000], ['b', NOW - 3 * DAY_MS], ['c', NOW - 20 * DAY_MS], ['d', NOW - 60 * DAY_MS]]);
  assert.deepEqual(activeWindows(['a', 'b', 'c', 'd', 'e'], seen, NOW),
    { activeUsersDay: 1, activeUsersWeek: 2, activeUsersMonth: 3 });
});

test('only users in the Undercut users collection count, even if Auth knows more uids', () => {
  const s = buildUndercutStats(base({
    users: [{ uid: 'a', createdAt: ts(NOW - 1000) }],
    lastSeen: new Map([['a', NOW - 1000], ['tl-only', NOW - 1000]]),
  }));
  assert.equal(s.totalUsers, 1);
  assert.equal(s.activeUsersDay, 1);
});

test('a live pass is paid, a live league trial is trial, an expired pass is free', () => {
  const s = buildUndercutStats(base({
    users: [
      { uid: 'paid', createdAt: ts(NOW - 10 * DAY_MS), pass: PASS },
      { uid: 'trial', createdAt: ts(NOW - 10 * DAY_MS), pass: { ...PASS, ref: 'league_trial' } },
      { uid: 'lapsed', createdAt: ts(NOW - 10 * DAY_MS), pass: { ...PASS, expiresAt: NOW - 1 } },
      { uid: 'free', createdAt: ts(NOW - 10 * DAY_MS) },
    ],
  }));
  assert.equal(s.paidSubscribers, 1);
  assert.equal(s.trialUsers, 1);
  assert.equal(s.freeUsers, 2);
  assert.equal(s.estimatedMRR, null);
});

test('new-user windows are rolling 24h and 7d', () => {
  const s = buildUndercutStats(base({
    users: [
      { uid: 'a', createdAt: ts(NOW - 1000) },
      { uid: 'b', createdAt: ts(NOW - 2 * DAY_MS) },
      { uid: 'c', createdAt: ts(NOW - 8 * DAY_MS) },
      { uid: 'd', createdAt: null },
    ],
  }));
  assert.equal(s.newUsersToday, 1);
  assert.equal(s.newUsersWeek, 2);
});

test('the document carries the shared contract fields', () => {
  const s = buildUndercutStats(base({ errors24h: 3 }));
  assert.equal(s.schema, 1);
  assert.equal(s.app, 'undercut');
  assert.equal(s.updatedAt, NOW);
  assert.equal(s.activeSource, 'auth-refresh');
  assert.deepEqual(s.health, { errors24h: 3 });
  assert.ok(s.content && s.usage && s.signupsByDay);
});

test('F-164: marked test accounts are counted apart and in no other number', () => {
  const s = buildUndercutStats(base({
    users: [
      { uid: 'player', createdAt: ts(NOW - 1000) },
      { uid: 'tester', createdAt: ts(NOW - 1000), testAccount: { reason: 'tester-farm' }, pass: PASS },
      { uid: 'trialTester', createdAt: ts(NOW - 1000), testAccount: { reason: 'store-reviewer' }, pass: { ...PASS, ref: 'league_trial' } },
    ],
    lastSeen: new Map([['player', NOW - 1000], ['tester', NOW - 1000]]),
  }));
  assert.equal(s.totalUsers, 1);
  assert.equal(s.testAccounts, 2);
  assert.equal(s.newUsersWeek, 1);
  assert.equal(s.trialUsers, 0);
  assert.equal(s.newUsersToday, 1);
  assert.equal(s.activeUsersDay, 1);
  assert.equal(s.paidSubscribers, 0);
  assert.equal(s.freeUsers, 1);
  assert.equal(s.signupsByDay['2026-11-19'], 1);
});
