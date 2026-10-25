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
 * Without them (a test, the emulator, a script, a function that does not list them) the calls go out
 * as before, unauthenticated, so a missing or failed token can never make the ingest worse than it
 * was. With them bound and refused, the log line is an error, because in production that can only
 * be a wrong password or a lapsed feed.
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
/** After a refused or failed exchange, no new attempt for this long: a results run makes several calls a tick. */
const FAIL_COOLDOWN_MS = 60_000;

export interface Openf1Credentials { username: string; password: string }
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let cached: { token: string; expiresAt: number; renewAt: number } | null = null;
let inflight: Promise<string | null> | null = null;
let failedUntil = 0;
let warnedNoCredentials = false;

/**
 * The secrets' values, or null when they are not bound. The environment is checked first because
 * `SecretParam.value()` logs its own warning on every read of an unbound secret.
 */
export function openf1Credentials(): Openf1Credentials | null {
  if (!process.env.OPENF1_USERNAME || !process.env.OPENF1_PASSWORD) return null;
  try {
    const username = OPENF1_USERNAME.value();
    const password = OPENF1_PASSWORD.value();
    return username && password ? { username, password } : null;
  } catch {
    return null;
  }
}

/**
 * A bearer token for OpenF1, from the cache while it has at least five minutes left (half its life
 * for a short one), otherwise freshly exchanged, one exchange at a time per instance. Null when there
 * are no credentials or the exchange fails: the caller then goes unauthenticated, which is exactly
 * what it did before F-128. A failed exchange is not retried for a minute.
 *
 * `fetchImpl` defaults per call on purpose: the client tests stub `global.fetch`, and a module-level
 * capture of `fetch` would stop the token exchange from seeing the stub.
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
  if (cached && cached.renewAt > nowMs) return cached.token;
  if (nowMs < failedUntil) return null;
  if (inflight) return inflight;
  inflight = exchange(creds, fetchImpl, nowMs).finally(() => { inflight = null; });
  return inflight;
}

async function exchange(creds: Openf1Credentials, fetchImpl: FetchLike, nowMs: number): Promise<string | null> {
  let res: Response;
  try {
    res = await fetchImpl(OPENF1_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ username: creds.username, password: creds.password }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    failedUntil = nowMs + FAIL_COOLDOWN_MS;
    console.warn('[OpenF1] token request errored, calling unauthenticated for a minute:', e instanceof Error ? e.message : String(e));
    return null;
  }
  if (!res.ok) {
    failedUntil = nowMs + FAIL_COOLDOWN_MS;
    // never log the body: a provider error page could echo the form back. A 4xx with bound credentials
    // is a wrong password or a lapsed feed, so it is an error, not a warning.
    const line = `[OpenF1] token exchange refused: ${res.status}; paid feed unavailable, calling unauthenticated for a minute`;
    if (res.status >= 400 && res.status < 500) console.error(line); else console.warn(line);
    return null;
  }
  let body: { access_token?: unknown; expires_in?: unknown };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // the parser's message quotes the start of the body, so it is not logged
    failedUntil = nowMs + FAIL_COOLDOWN_MS;
    console.warn('[OpenF1] token response was not JSON; calling unauthenticated for a minute');
    return null;
  }
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
    failedUntil = nowMs + FAIL_COOLDOWN_MS;
    console.warn('[OpenF1] token response carried no access_token; calling unauthenticated for a minute');
    return null;
  }
  const ttlSec = Number(body.expires_in);
  const ttlMs = Number.isFinite(ttlSec) && ttlSec > 0 ? ttlSec * 1000 : DEFAULT_TTL_MS;
  // renew five minutes early, or at half-life when the token is shorter than ten minutes
  const renewAt = nowMs + Math.max(ttlMs - RENEW_EARLY_MS, ttlMs / 2);
  cached = { token: body.access_token, expiresAt: nowMs + ttlMs, renewAt };
  failedUntil = 0;
  return cached.token;
}

/** Request headers for an OpenF1 call: the bearer token when there is one, plain JSON accept otherwise. */
export async function openf1Headers(): Promise<Record<string, string>> {
  const token = await openf1Token();
  return token ? { accept: 'application/json', authorization: `Bearer ${token}` } : { accept: 'application/json' };
}

/** Drop the cached token (and any cool-down), after a 401 that says it is no longer honoured. */
export function forgetOpenf1Token(): void {
  cached = null;
  failedUntil = 0;
}

/**
 * `fetch` for an OpenF1 URL: the bearer token goes on, and a 401 that arrives with a token renews it
 * and retries once. A second 401, or a 401 without a token (the free tier in a live window), comes
 * back to the caller as it always did. Both the ingestion client and the live sweep go through here.
 */
export async function openf1Fetch(url: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch): Promise<Response> {
  const withAuth = async (): Promise<[Response, boolean]> => {
    const headers = await openf1Headers();
    const res = await fetchImpl(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...headers } });
    return [res, 'authorization' in headers];
  };
  let [res, authed] = await withAuth();
  if (res.status === 401 && authed) {
    console.log('[OpenF1] 401 with a token, renewing and retrying once...');
    forgetOpenf1Token();
    [res, authed] = await withAuth();
  }
  return res;
}

/** Test seam: the cache state, so a test can assert reuse and renewal without a clock in the module. */
export function openf1TokenCacheForTests(): { token: string; expiresAt: number; renewAt: number } | null {
  return cached ? { ...cached } : null;
}
