// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../lib/pitwall/handoffCore.js');

test('codes are 43 url-safe characters, unique, and only their hash is stored', () => {
  const a = h.newHandoffCode(), b = h.newHandoffCode();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.match(h.hashHandoffCode(a), /^[0-9a-f]{64}$/);
  assert.notEqual(h.hashHandoffCode(a), a);
  assert.equal(h.hashHandoffCode(a), h.hashHandoffCode(a));
  for (const bad of [undefined, 42, '', 'short', a + 'x', a.slice(0, 42) + '!', '../' + a.slice(3)]) assert.equal(h.isWellFormedCode(bad), false);
  assert.equal(h.isWellFormedCode(a), true);
});

test('a code works for 60 seconds, once', () => {
  const doc = h.newHandoffDoc('u1', 'profile', 1_000_000);
  assert.deepEqual(doc, { uid: 'u1', expiresAt: 1_060_000, used: false, src: 'profile', createdAt: 1_000_000 });
  assert.equal(h.checkRedeem(doc, 1_000_001), 'ok');
  assert.equal(h.checkRedeem(doc, 1_059_999), 'ok');
  assert.equal(h.checkRedeem(doc, 1_060_000), 'expired');
  assert.equal(h.checkRedeem({ ...doc, used: true }, 1_000_001), 'used');
  assert.equal(h.checkRedeem(undefined, 1), 'missing');
  assert.equal(h.checkRedeem({ expiresAt: 5 }, 1), 'missing');
});

test('the source tag is an allow-list, never free text', () => {
  assert.equal(h.cleanSource('profile'), 'profile');
  for (const bad of ['<script>', 'PROFILE', '', null, 7, 'profile '.repeat(9)]) assert.equal(h.cleanSource(bad), null);
});

test('rate limit: a fixed window that resets, and refuses when full', () => {
  const lim = { windowMs: 60_000, max: 3 };
  let w = h.nextRateWindow(undefined, 1000, lim.windowMs, lim.max);
  assert.deepEqual(w, { windowStart: 1000, count: 1 });
  w = h.nextRateWindow(w, 2000, lim.windowMs, lim.max);
  w = h.nextRateWindow(w, 3000, lim.windowMs, lim.max);
  assert.deepEqual(w, { windowStart: 1000, count: 3 });
  assert.equal(h.nextRateWindow(w, 4000, lim.windowMs, lim.max), null);
  assert.deepEqual(h.nextRateWindow(w, 61_000, lim.windowMs, lim.max), { windowStart: 61_000, count: 1 });
  assert.deepEqual(h.nextRateWindow({ garbage: true }, 5, lim.windowMs, lim.max), { windowStart: 5, count: 1 });
  // rate-limit keys never contain the address itself
  assert.match(h.ipKey('203.0.113.9'), /^ip_[0-9a-f]{32}$/);
  assert.ok(!h.ipKey('203.0.113.9').includes('203'));
  assert.equal(h.ipKey(undefined), h.ipKey(''));
});
