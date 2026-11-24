/**
 * Pit Wall Pass state inside the app (F-077).
 *
 * The pass is the same `pw` custom claim the Firestore rules read and the portal reads, so the app
 * can never disagree with either. The claim carries the expiry in epoch seconds; a pass that has
 * run out is simply an old claim, which is why the time is checked here rather than trusting the
 * claim's presence.
 *
 * The app never grants or writes a pass. It is bought on the web today, and the server stamps the
 * claim from `users/{uid}.pass`. Pure on purpose: the reads live in `client.ts`, so the rules here
 * are tested without a React Native runtime.
 */
export interface PassState {
  active: boolean;
  /** epoch ms the pass ends, when there is one */
  expiresAt: number | null;
}

export const NO_PASS: PassState = { active: false, expiresAt: null };

/** Pure, so the expiry rule is tested without an auth session. */
export function passFromClaims(claims: Record<string, unknown> | undefined | null, now: number): PassState {
  const pw = claims?.pw;
  if (typeof pw !== 'number' || !Number.isFinite(pw)) return NO_PASS;
  const expiresAt = pw * 1000;
  return expiresAt > now ? { active: true, expiresAt } : NO_PASS;
}

/**
 * Whether this account owns a personal Pit Wall Pass, from `users/{uid}.pass` (F-175).
 *
 * Not the same as `passFromClaims(...).active`: since Charter the `pw` claim is the later of the
 * personal pass and Charter access through a league, so a Charter member has the claim without a
 * pass. "You already have a pass" must read the pass itself, or a Charter member could never buy one.
 * Same test as the server's `passActive` (tier `pitwall`, unexpired).
 */
export function ownsPersonalPass(userDoc: { pass?: unknown; [field: string]: unknown } | null | undefined, now: number): boolean {
  const p = userDoc?.pass as { tier?: unknown; expiresAt?: unknown } | null | undefined;
  return !!p && p.tier === 'pitwall' && typeof p.expiresAt === 'number' && p.expiresAt > now;
}
