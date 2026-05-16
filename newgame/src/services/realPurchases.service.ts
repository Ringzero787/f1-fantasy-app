// Real IAP integration via react-native-iap v14.
//
// STATUS: stub. The integration shape is wired throughout the app
// (purchases.service.ts gates calls via USE_REAL_IAP, the store screen calls
// requestPurchase / restorePurchases through this module, the
// tl_validatePurchase Cloud Function is deployed) — but the actual react-native-iap
// v14 API calls are not implemented. Implementing them is a focused 1–2 hour
// task right before going to TestFlight / Play internal track.
//
// What needs implementing in v14:
//   - fetchProducts({ skus, type: 'in-app' | 'subs' }) to load product info
//   - requestPurchase({ request: { ios: {...}, android: {...} }, type })
//   - purchaseUpdatedListener + purchaseErrorListener for completion
//   - finishTransaction({ purchase, isConsumable }) on success
//   - restorePurchases() (built-in v14)
//   - Pass receipts to tl_validatePurchase Cloud Function
//
// Reference: https://github.com/hyochan/react-native-iap (v14 docs)

export const realPurchasesService = {
  // Returns false until the v14 API integration is implemented. With this
  // false, purchases.service.ts always falls through to mockPurchase.
  isAvailable(): boolean {
    return false;
  },

  async requestPurchase(_productId: string): Promise<{ success: true; duplicate?: boolean }> {
    throw new Error(
      'Real IAP not implemented yet. Implement v14 fetchProducts + requestPurchase + listener flow before flipping USE_REAL_IAP.'
    );
  },

  async restorePurchases(): Promise<{ count: number; errors: string[] }> {
    return { count: 0, errors: [] };
  },

  async getProductPrice(_productId: string): Promise<string | null> {
    return null;
  },
};
