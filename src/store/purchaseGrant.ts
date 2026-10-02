/**
 * Whether a completed purchase should grant anything on this device (F-092).
 *
 * The three consumable products — league expansion, an extra league slot, avatar credits — were
 * granted from the device the moment the store handed a purchase over, before any server round
 * trip, with no record of which transactions had already been honoured. `replayHeldPurchases` then
 * feeds every unfinished purchase the store is holding back through the same handler on each
 * launch. So a purchase whose `finishTransaction` could not complete — the store is offline, the
 * consume never reaches Play — was handed back and granted again, once per launch, for one payment.
 * The Pit Wall Pass was never exposed: the server owns that grant and keys it on the purchase
 * record.
 *
 * Two independent guards, because each covers what the other cannot:
 *
 *   - The server's own `duplicate` flag, which knows about purchases made on a device this one has
 *     never been, and survives a reinstall.
 *   - A list of transactions this device has already honoured, which survives the server being
 *     unreachable and is what makes the offline replay loop safe.
 *
 * Pure, so the decision is tested without a store, a React Native runtime or a store connection.
 */

/** How many honoured transactions to remember. Well past any real purchase history. */
export const HONOURED_CAP = 100;

export type GrantDecision =
  /** Not seen before, anywhere: grant it. */
  | 'grant'
  /** This device already granted this transaction. Finish it and say nothing. */
  | 'already-honoured'
  /** The server has it from another device or before a reinstall; the server sync restores it. */
  | 'server-already-has-it'
  /** Nothing stable to key on and this is a replay, so granting might be the second time. */
  | 'cannot-verify';

export const alreadyHonoured = (honoured: readonly string[], key: string | null): boolean =>
  !!key && honoured.includes(key);

/** Newest last, de-duplicated, capped. A no-op for a null key, which has nothing to remember. */
export function rememberHonoured(honoured: readonly string[], key: string | null, cap: number = HONOURED_CAP): string[] {
  if (!key) return [...honoured];
  return [...honoured.filter((k) => k !== key), key].slice(-cap);
}

export function grantDecision(input: {
  /** From `transactionKeyOf`; null when the purchase carries no stable identifier. */
  key: string | null;
  honoured: readonly string[];
  /** What the server said. `true` means it had already recorded this purchase. */
  duplicate: boolean;
  /** Whether this came from the replay of a purchase the store was holding, not from a live buy. */
  isReplay: boolean;
}): GrantDecision {
  const { key, honoured, duplicate, isReplay } = input;
  if (alreadyHonoured(honoured, key)) return 'already-honoured';
  // A live purchase with no identifier is still a purchase someone just paid for, and the server
  // has confirmed it is new. A *replay* with no identifier cannot be told apart from one this
  // device already honoured, so it is not granted again — the server sync is the way back.
  if (!key && isReplay) return 'cannot-verify';
  if (duplicate) return 'server-already-has-it';
  return 'grant';
}
