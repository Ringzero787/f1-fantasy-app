/**
 * Input shapes for the Apple web sign-in handoff (F-091). Pure and dependency-free so the rules can
 * be tested without a Firebase runtime, in the same spirit as `purchases/productGuards.ts`.
 *
 * Everything here is reached by an unauthenticated caller — Apple's own POST on one side, a device
 * mid-sign-in on the other — so each value is checked for shape before it is used as a document id,
 * put in a redirect, or handed back to the app.
 */

/** A `state` or a `verifier`: 32 random bytes, hex. Also the shape of a Firestore document id. */
export const isSha256Hex = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

/**
 * A JWT *shape* only. The signature, issuer, audience and nonce are Firebase Auth's to verify when
 * the app presents this as an `apple.com` credential; checking them here as well would be a second,
 * weaker copy of that logic. The length cap keeps a hostile POST from filling a document.
 */
export const looksLikeJwt = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length < 8192 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);

/**
 * Apple sends the chosen name once — on the very first consent, as a JSON string beside the token —
 * and never again, so a new account's display name depends on reading it here. A malformed blob
 * costs the account its name, not the sign-in.
 */
export function appleDisplayName(rawUser: unknown): string | null {
  if (typeof rawUser !== 'string' || !rawUser || rawUser.length > 2048) return null;
  try {
    const parsed = JSON.parse(rawUser) as { name?: { firstName?: unknown; lastName?: unknown } };
    const parts = [parsed?.name?.firstName, parsed?.name?.lastName]
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      .map((p) => p.trim());
    const name = parts.join(' ');
    return name ? name.slice(0, 120) : null;
  } catch {
    return null;
  }
}

/**
 * Where the browser is sent once the token is filed. The token never rides this redirect: on
 * Android any installed app may claim a custom scheme, and an Apple identity token is enough to
 * sign in as its owner. Only the state goes, and the app trades its verifier for the token over
 * HTTPS. `user_cancelled_authorize` is a person changing their mind, not a failure.
 */
export function appleDeepLink(state: string, error?: unknown): string {
  const base = `theundercut://auth/apple?state=${state}`;
  if (typeof error !== 'string' || !error) return base;
  return `${base}&error=${error === 'user_cancelled_authorize' ? 'cancelled' : 'failed'}`;
}

/**
 * Amazon's authorization code. Opaque to us, so this only bounds it and keeps out anything that
 * could steer a URL or a document path — it is carried in a redirect and spent in a token request.
 */
export const looksLikeAuthCode = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 512 && /^[A-Za-z0-9._~-]+$/.test(v);

/**
 * Google's authorization code. Unlike Amazon's it contains slashes (`4/0Ab...`), so it gets its own
 * shape rather than widening the Amazon one — a slash is illegal in a Firestore document id, and
 * these two values are checked for different jobs. This one is only ever a field and a POST body
 * parameter, never a path segment.
 */
export const looksLikeGoogleAuthCode = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 512 && /^[A-Za-z0-9._~/-]+$/.test(v);
