/**
 * League slot packs (owner decision 2026-11-25): +3 slots, $4.99, or $3.99 in a chartered league,
 * stackable with no ceiling, applied by the server to the league the purchase names.
 */
import fs from 'fs';
import path from 'path';
import { ALL_PRODUCT_IDS, PRODUCT_IDS, PRODUCTS, SLOTS_PER_PACK } from '../../src/config/products';

const root = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const store = read('src/store/purchase.store.ts');

describe('slot packs', () => {
  it('two products, two prices, three slots, the same number as the server', () => {
    expect(PRODUCT_IDS.SLOT_PACK).toBe('league.slots3');
    expect(PRODUCT_IDS.SLOT_PACK_CHARTER).toBe('league.slots3.charter');
    expect(ALL_PRODUCT_IDS).toEqual(expect.arrayContaining(['league.slots3', 'league.slots3.charter']));
    expect(PRODUCTS[PRODUCT_IDS.SLOT_PACK].price).toBe('$4.99');
    expect(PRODUCTS[PRODUCT_IDS.SLOT_PACK_CHARTER].price).toBe('$3.99');
    expect(SLOTS_PER_PACK).toBe(3);
    expect(read('functions/src/purchases/slotPack.ts')).toMatch(/export const SLOTS_PER_PACK = 3;/);
  });

  it('picks the Charter price only for a chartered league, never on Amazon; refused in demo mode', () => {
    const buy = store.slice(store.indexOf('purchaseSlotPack: async'), store.indexOf('handlePurchaseComplete: async'));
    expect(buy).toMatch(/chartered && !isAmazonBuild \? PRODUCT_IDS\.SLOT_PACK_CHARTER : PRODUCT_IDS\.SLOT_PACK/);
    expect(buy.indexOf('isDemoMode')).toBeLessThan(buy.indexOf('await buy('));
    expect(buy).toMatch(/pendingSlotLeagueId: leagueId/);
  });

  it('the server applies the slots: the device sends the league and keeps no credit', () => {
    const done = store.slice(store.indexOf('if (productId === PRODUCT_IDS.SLOT_PACK ||'), store.indexOf('if (productId === PRODUCT_IDS.PITWALL_CHARTER)'));
    expect(done).toMatch(/recordPurchaseOnServer\(productId, .*, \{ leagueId \}\)/);
    expect(done.indexOf('recordPurchaseOnServer')).toBeLessThan(done.indexOf('finishTransaction'));
    expect(done).not.toMatch(/pendingExpansionCredits|expandLeagueCapacity/);
    expect(store).toMatch(/pendingSlotLeagueId: state\.pendingSlotLeagueId/);
  });

  it('the grid offers a pack only to the owner, only once the store has priced it', () => {
    const grid = read('src/simple/grid/GridLeagueManager.tsx');
    expect(grid).toMatch(/const slotPrice = storePrices\[slotSku\];/);
    expect(grid).toMatch(/\{isOwner && !isDemoMode && !!slotPrice && \(/);
  });
});
