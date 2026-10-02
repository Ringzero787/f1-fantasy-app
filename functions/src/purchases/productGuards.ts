/**
 * What a caller is allowed to say about a purchase.
 *
 * Both values here end up as path segments of the URL this server asks Google Play about, and the
 * product name also decides which entitlement gets granted. They were previously interpolated raw:
 * a `purchaseToken` of `../../avatar.pack/tokens/<a real cheap token>` collapses before the request
 * leaves, so Play answers about the $1.99 product and says yes, while the grant branch reads the
 * caller's own `productId` and hands out the $14.99 season pass. The duplicate check keyed on the
 * token string, so padding the traversal differently made every attempt a fresh transaction: one
 * cheap purchase, unlimited passes, unlimited accounts.
 *
 * No firebase-admin here on purpose, so these can be tested without a Firebase app.
 */
export const PASS_PRODUCT_ID = 'pitwall.pass.season';

/**
 * Every product this server will verify. A name that is not on this list never reaches a URL and
 * never reaches a grant.
 */
export const KNOWN_PRODUCTS: ReadonlySet<string> = new Set([
  PASS_PRODUCT_ID,
  'league.expansion',
  'avatar.pack',
  'league.slot',
]);

export const isKnownProduct = (v: unknown): v is string => typeof v === 'string' && KNOWN_PRODUCTS.has(v);

/**
 * A Play purchase token is an opaque base64url-ish string. The characters excluded here are the
 * ones that make it something other than a token: a slash or a dot-segment makes it a path.
 */
export const isPlayToken = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 1000 && /^[A-Za-z0-9._~-]+$/.test(v);

/**
 * An Amazon receipt id is base64, so it carries `+`, `/` and `=` that a Play token never does.
 * Applying the Play shape to it would have refused every Amazon purchase outright the moment that
 * store went live — the guard was written for Play's URL and quietly inherited by the other branch.
 *
 * It needs a looser check rather than the same one: the Amazon verifier already encodes all three
 * of its URL segments and compares the product in the response, so this is a sanity bound on an
 * opaque identifier, not the thing standing between a caller and someone else's entitlement.
 */
export const isAmazonReceiptId = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= 2000 &&
  /^[A-Za-z0-9+/=._~:-]+$/.test(v) &&
  // base64 needs `/`, so a dot-segment is refused by name instead. The verifier encodes this into
  // the URL anyway, which is what actually stops it; this just means a path never gets that far.
  !v.includes('..');

/**
 * An Amazon user id is an opaque account identifier. It goes into the verification URL beside the
 * receipt, and it was the one of the three identifiers with no shape at all — the receipt id and the
 * product both got guards and this did not. What actually binds the pair is Amazon refusing a
 * receipt that does not belong to the user, so this is a bound rather than a gate.
 */
export const isAmazonUserId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && /^[A-Za-z0-9._~-]+$/.test(v);
