/**
 * Reading a store receipt (F-060). Which store it came from decides how the server verifies it,
 * and each store needs different fields: Apple wants the receipt, Google the purchase token, and
 * Amazon the receipt id together with an Amazon user id that only the Amazon build carries.
 *
 * Pure, with the platform passed in, so the rules are tested without a React Native runtime.
 */
export interface StorePurchase {
  productId: string;
  purchaseToken?: string;
  transactionReceipt?: string;
  transactionId?: string;
  /** Amazon Appstore user id; Amazon's verification service will not accept a receipt without it */
  userIdAmazon?: string;
}

export type StoreKind = 'ios' | 'android' | 'amazon';

/** The Amazon build is still Android to the operating system, so the receipt is what tells them apart. */
export const storeOf = (purchase: StorePurchase, os: string): StoreKind =>
  (os === 'ios' ? 'ios' : purchase.userIdAmazon ? 'amazon' : 'android');

/** Only the fields that store's verification needs; sending the wrong one reads as a refused purchase. */
export function receiptOf(purchase: StorePurchase, os: string): Record<string, string | undefined> {
  // StoreKit 2 puts the signed transaction in purchaseToken; older builds had a base64 app
  // receipt. The server accepts either, and tells them apart by shape.
  if (os === 'ios') return { transactionReceipt: purchase.purchaseToken ?? purchase.transactionReceipt, transactionId: purchase.transactionId };
  return purchase.userIdAmazon
    ? { purchaseToken: purchase.purchaseToken, userIdAmazon: purchase.userIdAmazon }
    : { purchaseToken: purchase.purchaseToken };
}
