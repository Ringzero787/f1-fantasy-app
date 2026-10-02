/**
 * Deciding whether a purchase was refunded.
 *
 * The dangerous mistake is not missing a refund. It is taking a pass away from someone who still
 * owns it, because a store timed out or answered in a shape we did not expect. Most of these tests
 * are about that: anything short of a definite cancellation must come back `unknown`, and `unknown`
 * revokes nothing.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { playVerdict, amazonVerdict, appleLegacyVerdict, checkable, isJws } = require('../lib/pitwall/refundCheck.js');

test('Play: only a cancelled state is a refund', () => {
  assert.equal(playVerdict({ purchaseState: 1 }), 'refunded');
  assert.equal(playVerdict({ purchaseState: 0 }), 'active');
  // Pending is money not yet taken, which is neither a sale nor a refund.
  assert.equal(playVerdict({ purchaseState: 2 }), 'active');
});

test('Play: anything we do not recognise is unknown, never a refund', () => {
  for (const bad of [null, undefined, {}, { purchaseState: '1' }, { purchaseState: 9 }, 'nope', 42]) {
    assert.equal(playVerdict(bad), 'unknown', `${JSON.stringify(bad)} must not revoke`);
  }
});

test('Amazon: a cancel date is a refund, its absence is not', () => {
  assert.equal(amazonVerdict({ cancelDate: 1790000000000 }), 'refunded');
  assert.equal(amazonVerdict({ cancelDate: '1790000000000' }), 'refunded');
  assert.equal(amazonVerdict({ cancelDate: null }), 'active');
  // Amazon sends milliseconds, so zero means not cancelled rather than cancelled at the epoch.
  assert.equal(amazonVerdict({ cancelDate: 0 }), 'active');
});

test('Amazon: a response without the field at all tells us nothing', () => {
  assert.equal(amazonVerdict({ productId: 'pitwall.pass.season' }), 'unknown');
  assert.equal(amazonVerdict(null), 'unknown');
  assert.equal(amazonVerdict({ cancelDate: { when: 1 } }), 'unknown');
});

test('Apple legacy: a cancellation on this product is a refund', () => {
  const ok = { status: 0, receipt: { in_app: [{ product_id: 'pitwall.pass.season' }] } };
  const gone = { status: 0, receipt: { in_app: [{ product_id: 'pitwall.pass.season', cancellation_date_ms: '1790000000000' }] } };
  assert.equal(appleLegacyVerdict(ok, 'pitwall.pass.season'), 'active');
  assert.equal(appleLegacyVerdict(gone, 'pitwall.pass.season'), 'refunded');
});

test('Apple legacy: a refund of someone else\'s product is not a refund of this one', () => {
  const other = { status: 0, receipt: { in_app: [
    { product_id: 'avatar.pack', cancellation_date_ms: '1790000000000' },
    { product_id: 'pitwall.pass.season' },
  ] } };
  assert.equal(appleLegacyVerdict(other, 'pitwall.pass.season'), 'active');
});

test('Apple legacy: a bad status or a missing product is unknown', () => {
  assert.equal(appleLegacyVerdict({ status: 21007 }, 'pitwall.pass.season'), 'unknown');
  assert.equal(appleLegacyVerdict({ status: 0, receipt: {} }, 'pitwall.pass.season'), 'unknown');
  assert.equal(appleLegacyVerdict({ status: 0, receipt: { in_app: [] } }, 'pitwall.pass.season'), 'unknown');
  assert.equal(appleLegacyVerdict(null, 'pitwall.pass.season'), 'unknown');
});

test('a StoreKit 2 purchase is not checkable this way, and says so rather than looking active', () => {
  // Re-verifying a stored signed transaction returns what it returned the first time, refund or
  // not. Treating that as "still active" would be a silent, permanent blind spot.
  assert.equal(checkable('ios', true), false);
  assert.equal(checkable('ios', false), true);
  assert.equal(checkable('android', false), true);
  assert.equal(checkable('amazon', false), true);
  assert.equal(checkable('stripe', false), false);
});

test('a signed transaction is told apart from a legacy receipt by its shape', () => {
  assert.equal(isJws('aaa.bbb.ccc'), true);
  assert.equal(isJws('bm90aGluZyBoZXJl'), false);
  assert.equal(isJws(''), false);
  assert.equal(isJws(null), false);
});
