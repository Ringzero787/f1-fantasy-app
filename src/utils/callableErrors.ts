/** F-176. Pure, so it is tested without Firebase. */
/**
 * True when the error is the callable itself being missing (an app build that reached players
 * before the function was deployed), not one of its refusals: the caller then falls back to the
 * single-move calls. Firebase answers a missing function with code not-found and a bare
 * "NOT_FOUND" message; every refusal of ours carries a sentence.
 */
export function isMissingCallable(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === 'string' ? e.code.replace(/^functions\//, '') : '';
  const msg = typeof e?.message === 'string' ? e.message.trim() : '';
  return code === 'not-found' && /^not[ _-]?found$/i.test(msg);
}

/** The callable codes that mean "refused by the game rules" (budget, lock, lockout), not a fault. */
export const REFUSAL_CODES = ['failed-precondition', 'already-exists', 'not-found', 'invalid-argument', 'permission-denied'];

/** True for a refusal from one of our callables; false for a timeout, a lost connection, or anything without a code. */
export function isRefusal(err: unknown): boolean {
  const code = String((err as { code?: unknown } | null)?.code ?? '').replace(/^functions\//, '');
  return REFUSAL_CODES.includes(code);
}
