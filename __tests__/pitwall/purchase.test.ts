/**
 * Which store a receipt came from, and what the server needs to verify it. Pure, and worth pinning:
 * Amazon cannot be verified without its own user id, and sending an Android token to Apple's
 * endpoint (or the reverse) fails in a way that looks like a refused purchase.
 */
import { receiptOf, storeOf } from '../../src/pitwall/receipt';

const GOOGLE = { productId: 'pitwall.pass.season', purchaseToken: 'tok_google' };
const AMAZON = { productId: 'pitwall.pass.season', purchaseToken: 'receipt_amazon', userIdAmazon: 'amzn1.account.ABC' };
const APPLE = { productId: 'pitwall.pass.season', transactionReceipt: 'base64', transactionId: '200001' };
const APPLE_SK2 = { productId: 'pitwall.pass.season', purchaseToken: 'head.body.sig', transactionId: '200002' };

describe('storeOf', () => {
  it('tells Amazon from Google by the Amazon user id, which only the Amazon build carries', () => {
    expect(storeOf(GOOGLE, 'android')).toBe('android');
    expect(storeOf(AMAZON, 'android')).toBe('amazon');
  });

  it('is ios on an Apple device whatever the receipt looks like', () => {
    expect(storeOf(APPLE, 'ios')).toBe('ios');
    expect(storeOf(AMAZON, 'ios')).toBe('ios');
  });
});

describe('receiptOf', () => {
  it('sends the token and the Amazon user id on Android', () => {
    expect(receiptOf(AMAZON, 'android')).toEqual({ purchaseToken: 'receipt_amazon', userIdAmazon: 'amzn1.account.ABC' });
    // no stray Amazon field on a Google receipt: the server rejects a mismatch
    expect(receiptOf(GOOGLE, 'android')).toEqual({ purchaseToken: 'tok_google' });
  });

  it('sends the receipt and transaction id on iOS', () => {
    expect(receiptOf(APPLE, 'ios')).toEqual({ transactionReceipt: 'base64', transactionId: '200001' });
  });

  it('sends the StoreKit 2 signed transaction where the server looks for it', () => {
    expect(receiptOf(APPLE_SK2, 'ios')).toEqual({ transactionReceipt: 'head.body.sig', transactionId: '200002' });
  });
});
