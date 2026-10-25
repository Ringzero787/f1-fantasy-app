/**
 * OpenF1 authentication (F-128).
 *
 * OpenF1 closes its free tier to everyone while a session is live ("Global API access (including
 * past sessions) is restricted to authenticated users until the session ends"), which is why every
 * round's results landed two to four hours after the flag and why a live sweep would see nothing.
 * Their paid feed, granted to the owner in writing on 2026-09-28 (ADR-001), is used through an
 * OAuth2 password grant: POST username + password to /token, get a bearer token good for an hour,
 * send it as `Authorization: Bearer …` on every call (https://openf1.org/auth.html).
 *
 * The credentials are Firebase secrets; every function that calls OpenF1 lists `openf1Secrets`.
 * Without them (a test, the emulator, a deploy before the secrets exist) the calls go out as before,
 * unauthenticated, so a missing or failed token can never make the ingest worse than it was.
 */

import { defineSecret } from 'firebase-functions/params';

export const OPENF1_USERNAME = defineSecret('OPENF1_USERNAME');
export const OPENF1_PASSWORD = defineSecret('OPENF1_PASSWORD');
/** Bind these on every function that reaches api.openf1.org. */
export const openf1Secrets = [OPENF1_USERNAME, OPENF1_PASSWORD];

export const OPENF1_TOKEN_URL = 'https://api.openf1.org/token';
/** A token is renewed this long before OpenF1 says it expires, so a request never carries a stale one. */
const RENEW_EARLY_MS = 5 * 60_000;
const DEFAULT_TTL_MS = 60 * 60_000;

export interface Openf1Credentials { username: string; password: string }
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let cached: { token: string; expiresAt: number } | null = null;
let warnedNoCredentials = false;

/** The secrets' values, or null when they are not bound (tests, emulator, a function that does not list them). */
export function openf1Credentials(): Openf1Credentials | null {
  try {
    const username = OPENF1_USERNAME.value();
    const password = OPENF1_PASSWORD.value();
    return username && password ? { username, password } : null;
  } catch {
    return null;
  }
}

/**
 * A bearer token for OpenF1, from the cache while it has at least five minutes left, otherwise freshly
 * exchanged. Null when there are no credentials or the exchange fails: the caller then goes
 * unauthenticated, which is exactly what it did before F-128.
 */
export async function openf1Token(
  creds: Openf1Credentials | null = openf1Credentials(),
  fetchImpl: FetchLike = fetch,
  nowMs: number = Date.now(),
): Promise<string | null> {
  if (!creds) {
    if (!warnedNoCredentials) { console.warn('[OpenF1] no credentials bound; calling unauthenticated'); warnedNoCredentials = true; }
    return null;
  }
  if (cached && cached.expiresAt - RENEW_EARLY_MS > nowMs) return cached.token;
  try {
    const res = await fetchImpl(OPENF1_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ username: creds.username, password: creds.password }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // never log the body: a provider error page could echo the form back
      console.warn(`[OpenF1] token request failed: ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
      console.warn('[OpenF1] token response carried no access_token');
      return null;
    }
    const ttlSec = Number(body.expires_in);
    const ttlMs = Number.isFinite(ttlSec) && ttlSec > 0 ? ttlSec * 1000 : DEFAULT_TTL_MS;
    cached = { token: body.access_token, expiresAt: nowMs + ttlMs };
    return cached.token;
  } catch (e) {
    console.warn('[OpenF1] token request errored:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Request headers for an OpenF1 call: the bearer token when there is one, plain JSON accept otherwise. */
export async function openf1Headers(): Promise<Record<string, string>> {
  const token = await openf1Token();
  return token ? { accept: 'application/json', authorization: `Bearer ${token}` } : { accept: 'application/json' };
}

/** Drop the cached token, after a 401 that says it is no longer honoured. */
export function forgetOpenf1Token(): void {
  cached = null;
}

/** Test seam: the cache state, so a test can assert reuse and renewal without a clock in the module. */
export function openf1TokenCacheForTests(): { token: string; expiresAt: number } | null {
  return cached ? { ...cached } : null;
}
