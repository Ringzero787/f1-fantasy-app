/**
 * The sign-in handoff (F-091): how a credential that arrives in a browser reaches the app.
 *
 * Both Apple's and Amazon's web flows end with the identity provider redirecting a browser. On
 * Android any installed app may claim a custom scheme, and either credential — an Apple identity
 * token or an Amazon authorization code — is enough to sign in as its owner, so the credential must
 * not ride that redirect. Instead it is filed here under `state = sha256(verifier)` and the browser
 * is sent back with the state alone; the app then trades its `verifier` for the credential over
 * HTTPS. The verifier is 32 random bytes that never left the device, and an app that intercepted
 * the redirect holds only its hash.
 *
 * Everything that touches this collection is unauthenticated by necessity — the caller is in the
 * middle of signing in — so the rules are: one-shot records, a short life, `create` and never `set`,
 * a rate limit per caller, and no client access at all (`firestore.rules`).
 */
import * as admin from 'firebase-admin';
import { nextRateWindow } from '../pitwall/handoffCore';

export const HANDOFF = 'auth_handoff';
const LIMITS = 'auth_handoff_limits';
/** Long enough for a consent screen on a slow phone, short enough that a leaked state is worthless. */
export const TTL_MS = 10 * 60 * 1000;
/** A person signing in does this once. Ten a minute is generous; a loop is not. */
export const FILE_LIMIT = { windowMs: 60_000, max: 10 };
export const CLAIM_LIMIT = { windowMs: 60_000, max: 20 };

export type HandoffProvider = 'apple' | 'amazon' | 'google';

export interface HandoffRecord {
  provider: HandoffProvider;
  /** Apple's identity token, or Amazon's or Google's authorization code. */
  credential: string;
  /** Amazon needs the same redirect_uri back for the token exchange. */
  redirectUri?: string | null;
  /** The name the provider sends once, on first consent only. */
  displayName?: string | null;
}

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
 * @returns false when the state is already taken.
 */
export async function fileHandoff(state: string, record: HandoffRecord, now: number): Promise<boolean> {
  try {
    await db().collection(HANDOFF).doc(state).create({
      ...record,
      redirectUri: record.redirectUri ?? null,
      displayName: record.displayName ?? null,
      createdAt: now,
      expiresAt: admin.firestore.Timestamp.fromMillis(now + TTL_MS),
    });
    return true;
  } catch (err) {
    if ((err as { code?: number | string }).code === 6 || (err as { code?: string }).code === 'already-exists') return false;
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
export async function claimHandoff(state: string, now: number): Promise<{ ok: true; record: HandoffRecord } | { ok: false; reason: 'missing' | 'expired' }> {
  const ref = db().collection(HANDOFF).doc(state);
  const snap = await db().runTransaction(async (tx) => {
    const found = await tx.get(ref);
    if (found.exists) tx.delete(ref);
    return found;
  });
  if (!snap.exists) return { ok: false, reason: 'missing' };
  const data = snap.data() as HandoffRecord & { expiresAt?: admin.firestore.Timestamp };
  if (!data.expiresAt || data.expiresAt.toMillis() < now) return { ok: false, reason: 'expired' };
  return { ok: true, record: data };
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
