/**
 * Which sign-in buttons a build shows, and in what order (F-091). Pure, so the decision can be
 * tested — it is the difference between a person reaching their account and silently making a
 * second one, and it is easy to break by editing a conditional in a render block.
 *
 * An account belongs to the person, not to the store they installed from, so each build offers
 * every provider it can actually run, with the store's own first:
 *
 *   Amazon build   Amazon, Apple, Google — Google through the browser, since Fire OS has no
 *                                          Play Services and the native module cannot run
 *   Play build     Google, Apple, Amazon
 *   iOS build      Apple, Google, Amazon
 */
export type Provider = 'google' | 'apple' | 'amazon';

export interface ProviderContext {
  /** The Amazon Appstore build (EXPO_PUBLIC_STORE=amazon). */
  isAmazonBuild: boolean;
  isIOS: boolean;
  /** Apple is native on iOS, and elsewhere needs a configured Services ID. */
  canApple: boolean;
  /**
   * Outside the Amazon build this waits for the hardened Amazon flow: the original one brings the
   * authorization code back on a custom scheme, which any installed Android app may claim.
   */
  canAmazon: boolean;
  /**
   * Google on the Amazon build, through the browser flow (F-093). The native module needs Play
   * Services, which Fire OS does not have, so on that build this is the only way Google works —
   * and without it an account made with Google on a phone is unreachable from a Fire tablet.
   * Everywhere else the native sheet is used and this is irrelevant.
   */
  canGoogleWeb: boolean;
}

export function providerOrder({ isAmazonBuild, isIOS, canApple, canAmazon, canGoogleWeb }: ProviderContext): Provider[] {
  if (isAmazonBuild) {
    return [canAmazon ? 'amazon' : null, canApple ? 'apple' : null, canGoogleWeb ? 'google' : null]
      .filter(Boolean) as Provider[];
  }
  const first: Provider[] = isIOS
    ? [...(canApple ? ['apple' as Provider] : []), 'google']
    : ['google', ...(canApple ? ['apple' as Provider] : [])];
  return [...first, ...(canAmazon ? ['amazon' as Provider] : [])];
}
