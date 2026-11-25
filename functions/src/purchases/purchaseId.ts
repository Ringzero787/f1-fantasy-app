/**
 * The id of a store purchase's document in `purchases`, derived from the transaction the store
 * confirmed. The id IS the duplicate check (see validatePurchase), and the App Store refund
 * notification (F-175 slice 5) finds the purchase it is about the same way.
 */
import { createHash } from 'crypto';

export const IOS_BUNDLE_ID = 'com.undercut.app';

export type StorePlatform = 'ios' | 'amazon' | 'android';

export const purchaseIdFor = (platform: StorePlatform, storeTransactionId: string): string =>
  createHash('sha256').update(`${platform}:${storeTransactionId}`).digest('hex').slice(0, 40);
