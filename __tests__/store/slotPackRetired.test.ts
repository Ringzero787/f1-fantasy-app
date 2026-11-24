/**
 * F-175: the +20 slot pack (`league.expansion`) is retired. Nothing in the app may sell it, and a
 * credit a player already paid for must still be applicable from the league screens.
 */
import fs from 'fs';
import path from 'path';
import { LEAGUE_EXPANSION_ON_SALE, PRODUCT_IDS } from '../../src/config/products';

const root = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const SCREENS = [
  'src/simple/grid/GridLeagueManager.tsx',
  'app/(tabs)/leagues/create.tsx',
  'app/(tabs)/leagues/[id]/admin.tsx',
];

describe('slot pack retired (F-175)', () => {
  it('is off sale', () => {
    expect(LEAGUE_EXPANSION_ON_SALE).toBe(false);
    expect(PRODUCT_IDS.LEAGUE_EXPANSION).toBe('league.expansion');
  });

  it('the store action returns before reaching the store sheet', () => {
    const src = read('src/store/purchase.store.ts');
    const body = src.slice(src.indexOf('purchaseLeagueExpansion: async'));
    const guard = body.indexOf('if (!LEAGUE_EXPANSION_ON_SALE) return;');
    const buy = body.indexOf('await buy(PRODUCT_IDS.LEAGUE_EXPANSION)');
    expect(guard).toBeGreaterThan(-1);
    expect(buy).toBeGreaterThan(guard);
  });

  it.each(SCREENS)('%s neither sells nor prices the pack', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/purchaseLeagueExpansion/);
    expect(src).not.toMatch(/PRODUCTS\[PRODUCT_IDS\.LEAGUE_EXPANSION\]/);
    expect(src).not.toMatch(/\$4\.99/);
  });

  it.each(SCREENS.filter((f) => !f.endsWith('create.tsx')))('%s still offers a paid-for credit, gated on holding one', (file) => {
    const src = read(file);
    expect(src).toMatch(/pendingExpansionCredits/);
    expect(src).toMatch(/expansionCredits > 0/);
    expect(src).toMatch(/consumeExpansionCredit\(\)/);
  });
});
