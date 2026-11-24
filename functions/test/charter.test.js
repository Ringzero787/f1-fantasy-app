// F-175 Charter, slice 1: the pure week / climb / search-order rules and the `pw` claim.
// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../lib/charter/rankUp.js');
const c = require('../lib/charter/charter.js');
const p = require('../lib/pitwall/pass.js');
const store = require('../lib/pitwall/passStore.js');

const at = (iso) => Date.parse(iso);

// ── weekId ─────────────────────────────────────────────────────────────────────
test('weekId: the week turns at Monday 00:00 UTC, not a millisecond before', () => {
  assert.equal(r.weekId(at('2026-11-29T23:59:59.999Z')), '2026-W48'); // Sunday
  assert.equal(r.weekId(at('2026-11-30T00:00:00.000Z')), '2026-W49'); // Monday
  assert.equal(r.weekId(at('2026-11-23T00:00:00.000Z')), '2026-W48'); // the Monday that opened W48
  // UTC, not local: 19:00 on Sunday in New York is already Monday in UTC
  assert.equal(r.weekId(at('2026-11-29T18:59:59.999-05:00')), '2026-W48');
  assert.equal(r.weekId(at('2026-11-29T19:00:00-05:00')), '2026-W49');
});

test('weekId: ISO week-numbering year at the 2026/2027 boundary (2026 has 53 weeks)', () => {
  assert.equal(r.weekId(at('2026-12-31T12:00:00Z')), '2026-W53'); // Thursday
  assert.equal(r.weekId(at('2027-01-01T00:00:00Z')), '2026-W53'); // Friday, still last year's week
  assert.equal(r.weekId(at('2027-01-03T23:59:59.999Z')), '2026-W53'); // Sunday
  assert.equal(r.weekId(at('2027-01-04T00:00:00Z')), '2027-W01'); // Monday
  // and the other direction: a December Monday that belongs to next year's week 1
  assert.equal(r.weekId(at('2025-12-29T00:00:00Z')), '2026-W01');
  assert.equal(r.weekId(at('2025-12-28T23:59:59.999Z')), '2025-W52');
  assert.throws(() => r.weekId(NaN), /bad instant/);
});

// ── climb ──────────────────────────────────────────────────────────────────────
test('climb is the count, capped at three, and never negative', () => {
  assert.equal(r.climb(0), 0);
  assert.equal(r.climb(-2), 0);
  assert.equal(r.climb(1), 1);
  assert.equal(r.climb(3), 3);
  assert.equal(r.climb(22), 3);
  assert.equal(r.climb(NaN), 0);
});

// ── orderChartered ─────────────────────────────────────────────────────────────
const NOW = at('2026-11-25T12:00:00Z'); // Wednesday of 2026-W48
const EXP = p.seasonExpiry('2026');
const chartered = (id, searchPoints, rankUpsWeek, extra = {}) => ({
  id, isPublic: true, memberCount: 10, chartered: true, searchPoints,
  charter: { season: '2026', expiresAt: EXP, buyerId: 'u', source: 'stripe', ref: 'r', purchasedAt: 0 },
  ...(rankUpsWeek ? { rankUpsWeek } : {}), ...extra,
});
const ids = (list) => list.map((l) => l.id);

test('orderChartered: points order with a tie on id, two climbers, a stale week ignored, then the rest by size', () => {
  const leagues = [
    { id: 'x', isPublic: true, memberCount: 20 },
    chartered('d', 600, { weekId: '2026-W47', count: 9 }), // last week's count: does not carry
    chartered('c', 700, { weekId: '2026-W48', count: 1 }), // ties b on points, sorts after it by id
    { id: 'z', isPublic: false, memberCount: 99 },          // private and unchartered: not listed
    chartered('a', 900),
    chartered('e', 400, { weekId: '2026-W48', count: 5 }), // climbs 3, not 5
    chartered('b', 700),
    { id: 'y', isPublic: true, memberCount: 15 },
    // an expired charter with its flag still set, and a charter whose flag was cleared: both are plain public leagues
    chartered('w', 5000, { weekId: '2026-W48', count: 3 }, { memberCount: 3, charter: { expiresAt: NOW - 1 } }),
    chartered('v', 5000, null, { memberCount: 2, chartered: false }),
  ];
  // by points: a 900, b 700, c 700, d 600, e 400
  // top-down: c climbs 1 → a c b d e; d none (stale); e climbs 3 → a e c b d
  assert.deepEqual(ids(r.orderChartered(leagues, NOW)), ['a', 'e', 'c', 'b', 'd', 'x', 'y', 'w', 'v']);
  // the input is not reordered in place
  assert.equal(leagues[0].id, 'x');
});

test('orderChartered: applied top-down, so two adjacent climbers move once each and do not swap back', () => {
  const leagues = [
    chartered('p', 100, { weekId: '2026-W48', count: 1 }),
    chartered('q', 90, { weekId: '2026-W48', count: 1 }),
    chartered('s', 80, { weekId: '2026-W48', count: 1 }),
  ];
  // p is already first and cannot climb; q passes p; s passes p. Applied bottom-up, q would pass p
  // and then p would climb straight back over q.
  assert.deepEqual(ids(r.orderChartered(leagues, NOW)), ['q', 's', 'p']);
  // a week later every count is stale, and the points order is back
  assert.deepEqual(ids(r.orderChartered(leagues, at('2026-11-30T00:00:00Z'))), ['p', 'q', 's']);
});

test('rankUpsThisWeek reads the count only for the current week', () => {
  assert.equal(r.rankUpsThisWeek({ rankUpsWeek: { weekId: '2026-W48', count: 4 } }, NOW), 4);
  assert.equal(r.rankUpsThisWeek({ rankUpsWeek: { weekId: '2026-W47', count: 4 } }, NOW), 0);
  assert.equal(r.rankUpsThisWeek({}, NOW), 0);
  assert.equal(r.rankUpsThisWeek({ rankUpsWeek: { weekId: '2026-W48', count: 'lots' } }, NOW), 0);
});

// ── charter state ──────────────────────────────────────────────────────────────
test('charterActive needs the flag and an unexpired charter', () => {
  assert.equal(c.charterActive(chartered('a', 0), NOW), true);
  assert.equal(c.charterActive(chartered('a', 0), EXP), false);
  assert.equal(c.charterActive({ ...chartered('a', 0), chartered: false }, NOW), false);
  assert.equal(c.charterActive({ chartered: true, charter: null }, NOW), false);
  assert.equal(c.charterActive({ chartered: true, charter: { expiresAt: '2099' } }, NOW), false);
  assert.equal(c.charterActive(null, NOW), false);
});

test('charterAccessExpiry is the latest unexpired league, ignoring junk', () => {
  const user = { charterAccess: { leagues: { L1: NOW + 1000, L2: NOW + 5000, L3: NOW - 1, L4: 'soon', L5: null } } };
  assert.equal(c.charterAccessExpiry(user, NOW), NOW + 5000);
  assert.equal(c.charterAccessExpiry({ charterAccess: { leagues: { L3: NOW - 1 } } }, NOW), null);
  assert.equal(c.charterAccessExpiry({ charterAccess: { leagues: {} } }, NOW), null);
  assert.equal(c.charterAccessExpiry({}, NOW), null);
  assert.equal(c.charterAccessExpiry(null, NOW), null);
});

test('claimExpiry is the later of an active pass and charter access', () => {
  const pass = p.newPass('2026', 'stripe', 0); // to 2027-01-31
  const longer = { leagues: { L1: p.seasonExpiry('2027') } };
  const shorter = { leagues: { L1: NOW + 1000 } };
  assert.equal(c.claimExpiry(pass, null, NOW), pass.expiresAt);
  assert.equal(c.claimExpiry(pass, shorter, NOW), pass.expiresAt);
  assert.equal(c.claimExpiry(pass, longer, NOW), p.seasonExpiry('2027'));
  assert.equal(c.claimExpiry(null, longer, NOW), p.seasonExpiry('2027'));
  // an expired pass does not count; charter access alone carries the claim
  assert.equal(c.claimExpiry({ ...pass, expiresAt: NOW - 1 }, shorter, NOW), NOW + 1000);
  assert.equal(c.claimExpiry({ ...pass, expiresAt: NOW - 1 }, { leagues: { L1: NOW - 1 } }, NOW), null);
  assert.equal(c.claimExpiry(null, null, NOW), null);
  assert.equal(c.claimExpiry(undefined, { leagues: {} }, NOW), null);
});

test('charterEnabled is true only for config/app.charter.enabled === true', () => {
  assert.equal(c.charterEnabled({ charter: { enabled: true } }), true);
  assert.equal(c.charterEnabled({ charter: { enabled: false } }), false);
  assert.equal(c.charterEnabled({ charter: { enabled: 'true' } }), false);
  assert.equal(c.charterEnabled({ charter: true }), false);
  assert.equal(c.charterEnabled({}), false);
  assert.equal(c.charterEnabled(undefined), false);
  assert.equal(c.charterEnabled(null), false);
});

// ── stampClaim ─────────────────────────────────────────────────────────────────
function fakeAuth(claims) {
  const state = { claims };
  return {
    state,
    getUser: async () => ({ customClaims: state.claims }),
    setCustomUserClaims: async (_uid, next) => { state.claims = next; },
  };
}

test('stampClaim keeps pw when the pass is removed and charter access remains', async () => {
  const pass = p.newPass('2026', 'stripe', 0);
  const access = { leagues: { L1: p.seasonExpiry('2027') } };
  const auth = fakeAuth({ admin: true });
  await store.stampClaim('u1', c.claimExpiry(pass, access, NOW), auth);
  assert.deepEqual(auth.state.claims, { admin: true, pw: Math.floor(p.seasonExpiry('2027') / 1000) });
  // the personal pass is revoked; the league keeps them in
  await store.stampClaim('u1', c.claimExpiry(null, access, NOW), auth);
  assert.equal(auth.state.claims.pw, Math.floor(p.seasonExpiry('2027') / 1000));
  assert.equal(auth.state.claims.admin, true);
});

test('stampClaim drops pw when both the pass and charter access are gone or expired', async () => {
  const auth = fakeAuth({ pw: 123, admin: true });
  await store.stampClaim('u1', c.claimExpiry(null, { leagues: {} }, NOW), auth);
  assert.deepEqual(auth.state.claims, { admin: true });
  const auth2 = fakeAuth({ pw: 123 });
  await store.stampClaim('u2', c.claimExpiry({ tier: 'pitwall', expiresAt: NOW - 1 }, { leagues: { L1: NOW - 1 } }, NOW), auth2);
  assert.deepEqual(auth2.state.claims, {});
});

test('the claim shape is unchanged: one number, epoch seconds, the same value passClaim gives a pass', () => {
  const pass = p.newPass('2026', 'grant', 0);
  assert.deepEqual(store.nextClaims({}, c.claimExpiry(pass, null, NOW)), { pw: p.passClaim(pass) });
  assert.deepEqual(store.nextClaims(null, null), {});
  assert.deepEqual(store.nextClaims({ pw: 5, other: 'x' }, NaN), { other: 'x' });
});

// ── review fixes ──────────────────────────────────────────────────────────────
test('orderChartered: a climb is clamped at the top of the list', () => {
  const now = at('2026-11-25T12:00:00Z');
  const wk = r.weekId(now);
  const live = (id, pts, count) => ({ id, isPublic: true, chartered: true, searchPoints: pts,
    charter: { expiresAt: now + 1e9 }, rankUpsWeek: { weekId: wk, count } });
  const out = r.orderChartered([live('a', 300, 0), live('b', 200, 3), live('c', 100, 0)], now).map((l) => l.id);
  assert.deepEqual(out, ['b', 'a', 'c']); // b climbs 3 but there is only one place above it
});

test('orderChartered: only public leagues are listed, chartered or not', () => {
  const now = at('2026-11-25T12:00:00Z');
  const out = r.orderChartered([
    { id: 'hidden', isPublic: false, chartered: true, searchPoints: 999, charter: { expiresAt: now + 1e9 } },
    { id: 'shown', isPublic: true, chartered: true, searchPoints: 1, charter: { expiresAt: now + 1e9 } },
    { id: 'private', isPublic: false, memberCount: 20 },
  ], now).map((l) => l.id);
  assert.deepEqual(out, ['shown']);
});

test('claimInputsChanged: the trigger restamps only when pass or charterAccess changes', () => {
  const pass = { active: true, expiresAt: 1 };
  const access = { leagues: { L1: 5 } };
  assert.equal(c.claimInputsChanged({ pass, name: 'a' }, { pass, name: 'b' }), false); // unrelated field
  assert.equal(c.claimInputsChanged({ pass }, { pass: { ...pass, expiresAt: 2 } }), true);
  assert.equal(c.claimInputsChanged({ pass }, { pass, charterAccess: access }), true); // only charter access
  assert.equal(c.claimInputsChanged({ charterAccess: access }, { charterAccess: { leagues: {} } }), true); // a leave
  assert.equal(c.claimInputsChanged(undefined, { pass }), true); // created
  assert.equal(c.claimInputsChanged({ charterAccess: access }, undefined), true); // deleted
  assert.equal(c.claimInputsChanged(undefined, { name: 'x' }), false);
  assert.equal(c.claimInputsChanged({ pass: null }, {}), false); // null and absent are the same
});

test('onUserPassWritten stamps from a fresh read of the user, not the event snapshot', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'pitwall', 'index.ts'), 'utf8');
  const body = src.slice(src.indexOf('export const onUserPassWritten'), src.indexOf('export { sweepRefundedPasses }'));
  assert.match(body, /claimInputsChanged\(before, after\)/);
  assert.match(body, /await db\.doc\(`users\/\$\{event\.params\.uid\}`\)\.get\(\)/);
  assert.match(body, /claimExpiry\(pass, charterAccess, Date\.now\(\)\)/);
  assert.doesNotMatch(body, /after\?\.pass/);
});
