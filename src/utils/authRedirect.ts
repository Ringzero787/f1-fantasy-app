/**
 * Reading the redirect that ends a web sign-in (F-094).
 *
 * The same six lines had been written three times — Apple, Amazon and Google — and the handoff now
 * carries a second value, so they would have been written three more. Pure, so the rules are tested
 * without a browser.
 *
 * The `ticket` is the half of the handoff that proves this app is where the redirect came back to;
 * the verifier it is paired with never left the device. Neither is enough alone — see
 * `functions/src/auth/handoffStore.ts`.
 */
export interface RedirectResult {
  ticket: string;
}

/**
 * @param url the redirect the browser session returned
 * @param expectedState the state this app sent, to reject a redirect it did not start
 * @param provider how to name it to the person — collapsing these three callers into one helper
 *        should not have cost the message its "Amazon could not…" specificity
 * @throws with a message the caller shows, or `Sign in cancelled` which callers swallow
 */
export function readAuthRedirect(url: string | undefined, expectedState: string, provider: string): RedirectResult {
  const params = new URLSearchParams((url ?? '').split('?')[1] ?? '');
  if (params.get('error') === 'cancelled') throw new Error('Sign in cancelled');
  if (params.get('error')) throw new Error(`${provider} could not complete the sign in. Try again.`);
  // A redirect we did not start, or one replayed from another session, stops here.
  if (params.get('state') !== expectedState) throw new Error('Sign in could not be verified. Try again.');
  const ticket = params.get('ticket') ?? '';
  if (!/^[0-9a-f]{64}$/.test(ticket)) throw new Error('Sign in could not be verified. Try again.');
  return { ticket };
}
