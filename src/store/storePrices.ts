/**
 * The price of each product as its own storefront formatted it.
 *
 * Kept in its own file with no React Native behind it, because the row shows this string to a buyer
 * before they commit and it is the piece most likely to rot quietly: expo-iap has moved these field
 * names between versions, and a rename degrades the row to "Get the pass" with nothing failing.
 *
 * Only a formatted string is taken. expo-iap also exposes a bare `price` number with no currency,
 * and showing "14.99" to someone whose store charges euros or yen is worse than showing nothing, so
 * a product with no readable formatted price is simply absent.
 */
export function readStorePrices(products: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of Array.isArray(products) ? products : []) {
    const product = p as Record<string, unknown> | null;
    const id = product?.id ?? product?.productId ?? product?.sku;
    const shown = product?.displayPrice ?? product?.localizedPrice;
    if (typeof id === 'string' && id && typeof shown === 'string' && shown) out[id] = shown;
  }
  return out;
}
