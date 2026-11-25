// node --test scripts/*.test.js
// F-175 slice 5: the decisions behind the Charter support op and the sale flip (functions/scripts/charterSupport.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const OPS = require('../functions/scripts/lib/charterOps');

const SALE = () => '2027';
const purchase = (extra = {}) => ({ productId: 'pitwall.charter.season', status: 'validated', userId: 'owner', platform: 'android', leagueId: 'L1', charterApplied: false, charterRefused: 'disabled', ...extra });

test('references: a purchase id or stripe:pi_…, never a path', () => {
  for (const ok of ['a'.repeat(40), 'stripe:pi_3Abc123', 'Xy12_ab-cd']) assert.ok(OPS.validRef(ok), ok);
  for (const bad of ['', '../x', 'purchases/x', 'stripe:ch_1', 'a b', 'stripe:pi_', undefined]) assert.ok(!OPS.validRef(bad), String(bad));
  assert.ok(OPS.validLeague('L1') && !OPS.validLeague('a/b') && !OPS.validLeague(''));
});

test('apply: a paid store charter recorded as not applied is planned for its own league and buyer', () => {
  const r = OPS.supportApplyPlan({ ref: 'p'.repeat(40), leagueArg: '-', purchase: purchase(), grant: null, saleSeasonAt: SALE });
  assert.deepEqual(r, { ok: true, input: { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'play', ref: 'p'.repeat(40) }, purchaseExists: true });
  assert.equal(OPS.supportApplyPlan({ ref: 'p'.repeat(40), purchase: purchase({ platform: 'ios' }), grant: null, saleSeasonAt: SALE }).input.source, 'apple');
  // The grant record's season wins: the season on sale when it was bought.
  assert.equal(OPS.supportApplyPlan({ ref: 'p'.repeat(40), purchase: purchase(), grant: { season: '2026', refusedAt: 1 }, saleSeasonAt: SALE }).input.season, '2026');
});

test('apply: Stripe has no purchase document, only the grant record', () => {
  const r = OPS.supportApplyPlan({ ref: 'stripe:pi_123456', purchase: null, grant: { buyerId: 'owner', leagueId: 'L1', season: '2027', source: 'stripe', refused: 'already-chartered', refusedAt: 1 }, saleSeasonAt: SALE });
  assert.equal(r.ok, true);
  assert.equal(r.purchaseExists, false);
  assert.equal(r.input.source, 'stripe');
});

test('apply: refused after a refund, when already applied, for another product, or with no league', () => {
  const ref = 'p'.repeat(40);
  const why = (o) => OPS.supportApplyPlan({ ref, saleSeasonAt: SALE, purchase: null, grant: null, ...o }).why;
  assert.match(why({ purchase: purchase({ status: 'refunded' }) }), /refunded/);
  assert.match(why({ purchase: purchase(), grant: { clearedAt: 5 } }), /refunded/);
  assert.match(why({ purchase: purchase({ charterApplied: true, charterLeagueId: 'L1' }) }), /already applied/);
  assert.match(why({ purchase: purchase(), grant: { grantedAt: 5, leagueId: 'L1' } }), /already applied/);
  assert.match(why({ purchase: purchase({ productId: 'pitwall.pass.season' }) }), /not a charter/);
  assert.match(why({ purchase: purchase({ leagueId: undefined }) }), /no league/);
  assert.match(why({}), /no purchase/);
  assert.match(OPS.supportApplyPlan({ ref: 'x/y', saleSeasonAt: SALE }).why, /not a purchase id/);
});

test('the sale flip clears every live charter but support applies, and nothing once the sale is on', () => {
  const live = [{ leagueId: 'A', ref: 'p1', test: true }, { leagueId: 'B', ref: 'stripe:pi_1' }, { leagueId: 'C', ref: 'p3', support: true }];
  const on = OPS.salePlan({ state: 'on', flagOn: false, live });
  assert.deepEqual(on.clear.map((c) => c.leagueId), ['A', 'B'], 'a Stripe test charter carries no test mark, and is cleared too');
  assert.deepEqual(on.keep.map((c) => c.leagueId), ['C']);
  assert.equal(on.set, true);
  const again = OPS.salePlan({ state: 'on', flagOn: true, live });
  assert.deepEqual(again.clear, [], 'with the sale on, live charters are real');
  assert.equal(again.already, true);
  assert.deepEqual(OPS.salePlan({ state: 'off', flagOn: true, live }).clear, []);
  assert.equal(OPS.salePlan({ state: 'maybe', flagOn: false, live }).ok, false);
});

test('backup paths cover the league, the grant, the purchase and every touched user, and an apply checks them', () => {
  const paths = OPS.charterPaths({ leagueId: 'L1', ref: 'stripe:pi_9', purchaseExists: false, uids: ['b', 'a', 'a'] });
  assert.deepEqual(paths, ['charter_grants/stripe:pi_9', 'leagues/L1', 'users/a', 'users/b']);
  assert.ok(OPS.charterPaths({ leagueId: 'L1', ref: 'p1', purchaseExists: true, uids: [] }).includes('purchases/p1'));
  assert.deepEqual(OPS.uncovered(['users/a', 'users/new'], paths), ['users/new'], 'a member who joined after the dry run');
});
