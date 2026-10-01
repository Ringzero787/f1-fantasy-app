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
