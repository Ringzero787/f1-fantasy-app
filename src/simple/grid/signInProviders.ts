/**
 * Which sign-in buttons a build shows, and in what order (F-091). Pure, so the decision can be
 * tested — it is the difference between a person reaching their account and silently making a
 * second one, and it is easy to break by editing a conditional in a render block.
 *
 * An account belongs to the person, not to the store they installed from, so each build offers
 * every provider it can actually run, with the store's own first:
 *
 *   Amazon build   Amazon, Apple        — no Play Services on Fire OS, so no native Google
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
}

export function providerOrder({ isAmazonBuild, isIOS, canApple, canAmazon }: ProviderContext): Provider[] {
  if (isAmazonBuild) {
    return [canAmazon ? 'amazon' : null, canApple ? 'apple' : null].filter(Boolean) as Provider[];
  }
  const first: Provider[] = isIOS
    ? [...(canApple ? ['apple' as Provider] : []), 'google']
    : ['google', ...(canApple ? ['apple' as Provider] : [])];
  return [...first, ...(canAmazon ? ['amazon' as Provider] : [])];
}
