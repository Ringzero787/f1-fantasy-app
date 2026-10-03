/**
 * The sign-in handoff (F-091): how a credential that arrives in a browser reaches the app.
 *
 * All three web flows end with the identity provider redirecting a browser. On Android any
 * installed app may claim a custom scheme, and every one of these credentials — an Apple identity
 * token, an Amazon or Google authorization code — is enough to sign in as its owner, so the
 * credential must not ride that redirect. It is filed here instead, and the browser is sent back
 * with two opaque values that are useless apart.
 *
 * **It takes both halves to collect a credential, and no single party ever has both.**
 *
 *   - The `verifier` is 32 random bytes the app makes before it opens the browser. It never leaves
 *     the device until the claim. `state = sha256(verifier)` is what travels to the provider.
 *   - The `ticket` is 32 random bytes *this server* makes when the credential arrives. It goes out
 *     only on the redirect, so only the app that received that redirect has it. We keep its hash.
 *
 * The verifier alone is not enough, and that matters: `state` is chosen by whoever builds the
 * authorization URL. Someone could pick their own verifier, craft that URL, and lure a person
 * through it — once consent exists the provider redirects without prompting — and the victim's
 * credential would be filed under the attacker's state. PKCE does not help there, because the
 * attacker owns the challenge too. What stops it is the ticket: it goes to the victim's app, and the
 * attacker never sees it.
 *
 * The ticket alone is not enough either, which is the case the verifier was introduced for: an app
 * that claims the custom scheme and intercepts the redirect reads state and ticket, and cannot
 * invert the hash to get the verifier.
 *
 * Everything that touches this collection is unauthenticated by necessity — the caller is in the
 * middle of signing in — so the rules are: one-shot records, a short life, `create` and never `set`,
 * a rate limit per caller, and no client access at all (`firestore.rules`).
 */
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';
import { nextRateWindow } from '../pitwall/handoffCore';
import { hashTicket, ticketMatches } from './handoffGuards';

export const HANDOFF = 'auth_handoff';
const LIMITS = 'auth_handoff_limits';
/** Long enough for a consent screen on a slow phone, short enough that a leaked state is worthless. */
export const TTL_MS = 10 * 60 * 1000;
/** A person signing in does this once. Ten a minute is generous; a loop is not. */
export const FILE_LIMIT = { windowMs: 60_000, max: 10 };
export const CLAIM_LIMIT = { windowMs: 60_000, max: 20 };
/**
 * A ceiling across all callers, on top of the per-caller one.
 *
 * The per-caller key comes from `x-forwarded-for`, and how much of that header the caller wrote
 * depends on how many trusted hops appended to it — which the header cannot tell us. So that key is
 * best effort, and this is the brake that actually holds.
 *
 * Spread over `GLOBAL_SHARDS` documents. One document taking 300 writes a minute is five a second,
 * well past what Firestore sustains on a single document, so the cap meant to protect the endpoint
 * would have become the thing that broke it. Each shard carries its own slice of the budget.
 *
 * Set well above real load: Undercut's whole user base signing in at once does not approach it, and
 * a caller who does is not signing in.
 */
export const GLOBAL_SHARDS = 10;
export const GLOBAL_FILE_LIMIT = { windowMs: 60_000, max: 30 };   // × GLOBAL_SHARDS = 300/min
/** Not an address, so it cannot collide with a hashed per-caller key (`ipKey` prefixes `ip_`). */
export const globalKey = (now: number): string => `all_${Math.floor(now / 97) % GLOBAL_SHARDS}`;

/**
 * The global ceiling, which must never be the reason a real sign-in fails.
 *
 * `takeAuthRateSlot` can throw on transaction contention, and this one document is the most
 * contended thing in the flow — so a failure to *read* the ceiling is treated as under it. The
 * per-caller limit has already been taken by every caller who gets here, and an endpoint that 500s
 * under load is a worse outcome than one that briefly stops counting.
 */
export async function underGlobalCeiling(now: number): Promise<boolean> {
  try {
    return await takeAuthRateSlot(globalKey(now), now, GLOBAL_FILE_LIMIT);
  } catch (err) {
    console.warn('[auth] global rate ceiling unavailable; allowing', err instanceof Error ? err.message : String(err));
    return true;
  }
}

export type HandoffProvider = 'apple' | 'amazon' | 'google';

export interface HandoffRecord {
  provider: HandoffProvider;
  /** Apple's identity token, or Amazon's or Google's authorization code. */
  credential: string;
  /** Amazon and Google need the same redirect_uri back for the token exchange. */
  redirectUri?: string | null;
  /** The name the provider sends once, on first consent only. */
  displayName?: string | null;
}

/** 32 random bytes as hex — the same shape as the verifier, and compared the same way. */
export const newTicket = (): string => randomBytes(32).toString('hex');

const db = (): FirebaseFirestore.Firestore => admin.firestore();

/** @returns false when `key` is over its limit. */
export async function takeAuthRateSlot(key: string, now: number, limit: { windowMs: number; max: number }): Promise<boolean> {
  const ref = db().collection(LIMITS).doc(key);
  return db().runTransaction(async (tx) => {
    const next = nextRateWindow((await tx.get(ref)).data(), now, limit.windowMs, limit.max);
    if (!next) return false;
    tx.set(ref, { ...next, updatedAt: now });
    return true;
  });
}

/**
 * Files a credential under `state`. `create` and not `set`: the design assumes an app may intercept
 * the redirect and so learn the state, and with `set` such an app could overwrite the filed
 * credential with one of its own. A second arrival for the same state is a failed handoff.
 *
 * @returns the ticket to put on the redirect, or null when the state is already taken.
 */
export async function fileHandoff(state: string, record: HandoffRecord, now: number): Promise<string | null> {
  const ticket = newTicket();
  try {
    await db().collection(HANDOFF).doc(state).create({
      ...record,
      redirectUri: record.redirectUri ?? null,
      displayName: record.displayName ?? null,
      // The hash, not the ticket: this collection is closed to clients, but a record that cannot
      // be replayed by whoever reads it is cheaper than trusting that forever.
      ticketHash: hashTicket(ticket),
      createdAt: now,
      expiresAt: admin.firestore.Timestamp.fromMillis(now + TTL_MS),
    });
    return ticket;
  } catch (err) {
    if ((err as { code?: number | string }).code === 6 || (err as { code?: string }).code === 'already-exists') return null;
    throw err;
  }
}

/**
 * Hands the filed credential over, once. Read and delete happen in one transaction, so a replay of
 * the same verifier finds nothing — and an expired record is deleted on the attempt too, which is
 * how a sign-in that was abandoned at the consent screen gets collected.
 *
 * @returns the record, or a reason it cannot be had.
 */
export async function claimHandoff(state: string, ticket: string, now: number): Promise<{ ok: true; record: HandoffRecord } | { ok: false; reason: 'missing' | 'expired' | 'wrong-ticket' }> {
  const ref = db().collection(HANDOFF).doc(state);
  return db().runTransaction(async (tx) => {
    const found = await tx.get(ref);
    if (!found.exists) return { ok: false as const, reason: 'missing' as const };
    const data = found.data() as HandoffRecord & { expiresAt?: admin.firestore.Timestamp; ticketHash?: string };

    // A wrong ticket leaves the record alone. Deleting it looked like the strict choice and is the
    // wrong one: whoever crafted the authorization link knows the state, so deleting on a bad
    // ticket would let them destroy the credential the person they lured is about to claim. There
    // is no brute-force to protect against — the ticket is 256 bits — and the rate limit bounds the
    // attempts.
    if (!ticketMatches(data, ticket)) return { ok: false as const, reason: 'wrong-ticket' as const };

    // Everything past this point consumes the record: the right claimer gets it once, and an
    // expired one is collected on the attempt rather than waiting for the sweep.
    tx.delete(ref);
    if (!data.expiresAt || data.expiresAt.toMillis() < now) return { ok: false as const, reason: 'expired' as const };
    return { ok: true as const, record: data };
  });
}

/**
 * Records are dead after ten minutes and claimed records delete themselves, so this exists for the
 * ones nobody ever came back for. Mirrors `deleteOldHandoffs` on the Pit Wall side.
 */
export async function sweepAuthHandoffs(now: number): Promise<number> {
  let deleted = 0;
  for (const [col, field, age] of [[HANDOFF, 'createdAt', TTL_MS], [LIMITS, 'updatedAt', 24 * 3600 * 1000]] as const) {
    for (;;) {
      const page = await db().collection(col).where(field, '<', now - age).limit(300).get();
      if (page.empty) break;
      const batch = db().batch();
      page.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += page.size;
      if (page.size < 300) break;
    }
  }
  return deleted;
}
