/**
 * Reading the price out of whatever the store sent back.
 *
 * The row shows this string to a buyer before they commit, so the one thing it must never do is
 * show a number without a currency. expo-iap exposes a bare `price` as well as the formatted
 * `displayPrice`, and the field names have moved between versions, so this is the piece most likely
 * to rot quietly: a rename degrades the row to "Get the pass" with nothing failing anywhere.
 */
import { readStorePrices } from '../../src/store/storePrices';

describe('readStorePrices', () => {
  it('reads the formatted price expo-iap 5.x returns', () => {
    expect(readStorePrices([{ id: 'pitwall.pass.season', displayPrice: '$14.99' }])).toEqual({ 'pitwall.pass.season': '$14.99' });
  });

  it('accepts the older field names too', () => {
    expect(readStorePrices([{ productId: 'a', localizedPrice: '£12.99' }])).toEqual({ a: '£12.99' });
    expect(readStorePrices([{ sku: 'b', displayPrice: '¥1,800' }])).toEqual({ b: '¥1,800' });
  });

  it('never takes a bare number, because a price with no currency is worse than no price', () => {
    expect(readStorePrices([{ id: 'a', price: 14.99 }])).toEqual({});
    expect(readStorePrices([{ id: 'a', displayPrice: 14.99 }])).toEqual({});
  });

  it('keeps a storefront with a different currency intact', () => {
    expect(readStorePrices([{ id: 'a', displayPrice: '19,99 €' }])).toEqual({ a: '19,99 €' });
  });

  it('survives whatever the store actually sends', () => {
    expect(readStorePrices(null)).toEqual({});
    expect(readStorePrices(undefined)).toEqual({});
    expect(readStorePrices('nope')).toEqual({});
    expect(readStorePrices([null, undefined, {}, { id: 'a' }, { displayPrice: '$1' }])).toEqual({});
    expect(readStorePrices([{ id: '', displayPrice: '$1' }, { id: 'a', displayPrice: '' }])).toEqual({});
  });

  it('reads every product in one answer', () => {
    const got = readStorePrices([{ id: 'a', displayPrice: '$1.99' }, { id: 'b', displayPrice: '$4.99' }]);
    expect(got).toEqual({ a: '$1.99', b: '$4.99' });
  });
});
