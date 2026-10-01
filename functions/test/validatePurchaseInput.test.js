/**
 * The two values a caller controls on the money path.
 *
 * `productId` decides which entitlement is granted, and both it and `purchaseToken` were
 * interpolated raw into the URL this server asks Google Play about. A token of
 * `../../avatar.pack/tokens/<a real cheap token>` collapses before the request leaves, so Play
 * answers about the cheap product and says yes, while the grant branch reads the caller's own
 * `productId` and hands out the season pass. One $1.99 purchase, unlimited passes, unlimited
 * accounts — the duplicate check keys on the token string, and padding the traversal differently
 * makes every attempt look like a new transaction.
 *
 * These are the two guards that close it, tested on the values themselves because the function
 * around them cannot run without Google.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { KNOWN_PRODUCTS, isPlayToken, isKnownProduct } = require('../lib/purchases/productGuards');

test('a token carrying a path is refused', () => {
  assert.equal(isPlayToken('../../avatar.pack/tokens/abc123'), false);
  assert.equal(isPlayToken('abc/../def'), false);
  assert.equal(isPlayToken('./abc'), false);
  assert.equal(isPlayToken('abc%2f..%2fdef'), false);
  assert.equal(isPlayToken('a/b'), false);
});

test('a real-shaped Play token is accepted', () => {
  assert.equal(isPlayToken('mnbvcxzlkjhgfdsapoiuytrewq.AO-J1Ox_K-9vQ3z-abc-DEF~123'), true);
  assert.equal(isPlayToken('a'), true);
});

test('an empty, oversized or non-string token is refused', () => {
  assert.equal(isPlayToken(''), false);
  assert.equal(isPlayToken('a'.repeat(1001)), false);
  assert.equal(isPlayToken(null), false);
  assert.equal(isPlayToken(undefined), false);
  assert.equal(isPlayToken(123), false);
  assert.equal(isPlayToken({}), false);
});

test('only products this app sells are verifiable', () => {
  assert.ok(KNOWN_PRODUCTS.has('pitwall.pass.season'));
  assert.ok(KNOWN_PRODUCTS.has('league.expansion'));
  assert.ok(KNOWN_PRODUCTS.has('avatar.pack'));
  assert.ok(KNOWN_PRODUCTS.has('league.slot'));
});

test('a product name carrying a path is not in the list', () => {
  // The same traversal through the other segment of the same URL.
  assert.ok(!KNOWN_PRODUCTS.has('../../avatar.pack'));
  assert.ok(!KNOWN_PRODUCTS.has('pitwall.pass.season/../avatar.pack'));
  assert.ok(!KNOWN_PRODUCTS.has(''));
  assert.ok(!KNOWN_PRODUCTS.has('anything.else'));
});

test('encoding a token that somehow got through still cannot escape its segment', () => {
  // Belt and braces: the allowlist is the real guard, this is what the URL builder does on top.
  assert.equal(encodeURIComponent('../../avatar.pack/tokens/x'), '..%2F..%2Favatar.pack%2Ftokens%2Fx');
  assert.ok(!encodeURIComponent('../../avatar.pack/tokens/x').includes('/'));
});
