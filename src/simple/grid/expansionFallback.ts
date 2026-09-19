/**
 * League expansion: what to do when applyLeagueExpansion did not confirm (F-059).
 *
 * The server path spends a store-verified purchase. Until purchase validation
 * has been proven with a real store purchase, one case still falls back to the
 * old direct write: the server has NO verified purchase on record
 * (`failed-precondition`) although the store told this device the purchase
 * completed. Without that, a paying customer would get nothing. It grants
 * nothing the rules do not already allow an owner; step B removes it together
 * with the owner's ability to write maxMembers.
 *
 * A refusal that is about the REQUEST (not the owner, league missing, bad
 * input, signed out) never falls back.
 */
export type ExpansionNext = 'done' | 'fallback' | 'fail';

/** Interim: see above. Flip to false when validated purchases are confirmed working. */
export const INTERIM_UNVERIFIED_EXPANSION_FALLBACK = true;

const REFUSED = new Set(['permission-denied', 'not-found', 'invalid-argument', 'unauthenticated']);
const TRANSPORT = new Set(['unavailable', 'deadline-exceeded', 'internal', 'unknown', 'cancelled', 'resource-exhausted']);

/** Firebase callable errors carry `code` as `functions/<code>`. */
export function callableErrorCode(e: unknown): string {
  const raw = (e as { code?: unknown } | null)?.code;
  return typeof raw === 'string' ? raw.replace(/^functions\//, '') : 'unknown';
}

export function expansionNext(errorCode: string, capacityAlreadyGrew: boolean): ExpansionNext {
  if (capacityAlreadyGrew) return 'done';                 // the call committed; only its reply was lost
  if (REFUSED.has(errorCode)) return 'fail';
  if (errorCode === 'failed-precondition') return INTERIM_UNVERIFIED_EXPANSION_FALLBACK ? 'fallback' : 'fail';
  if (TRANSPORT.has(errorCode)) return 'fallback';
  return 'fail';
}
