/**
 * F-175 slice 2, the app half: buying a Charter, and the personal-pass check that Charter access
 * would otherwise break.
 */
import fs from 'fs';
import path from 'path';
import { PRODUCT_IDS, PRODUCTS, ALL_PRODUCT_IDS } from '../../src/config/products';
import { ownsPersonalPass, passFromClaims } from '../../src/pitwall/pass';

const root = path.join(__dirname, '..', '..');
const store = fs.readFileSync(path.join(root, 'src/store/purchase.store.ts'), 'utf8');
const NOW = Date.parse('2027-03-01T12:00:00Z');

describe('Charter product (F-175)', () => {
  it('has the id, name, price and description from the plan', () => {
    expect(PRODUCT_IDS.PITWALL_CHARTER).toBe('pitwall.charter.season');
    expect(ALL_PRODUCT_IDS).toContain('pitwall.charter.season');
    const p = PRODUCTS[PRODUCT_IDS.PITWALL_CHARTER];
    expect(p.title).toBe('Charter');
    expect(p.price).toBe('$39.99');
    expect(p.description).toBe('Pit Wall for every player in one league, for the season.');
    for (const s of [p.title, p.description, ...p.benefits]) expect(s).not.toMatch(/\bF1\b|Formula|\bFIA\b|Grand Prix/i);
  });
});

describe('personal pass vs Pit Wall access (F-175)', () => {
  const pass = { tier: 'pitwall', season: '2027', expiresAt: NOW + 1000 };

  it('a Charter member has access through the claim but owns no pass, and may buy one', () => {
    const claims = { pw: Math.floor((NOW + 86400000) / 1000) };
    expect(passFromClaims(claims, NOW).active).toBe(true);
    expect(ownsPersonalPass({ charterAccess: { leagues: { L1: NOW + 86400000 } } }, NOW)).toBe(false);
  });

  it('owns a pass only with an unexpired pitwall pass on the user document', () => {
    expect(ownsPersonalPass({ pass }, NOW)).toBe(true);
    expect(ownsPersonalPass({ pass: { ...pass, expiresAt: NOW - 1 } }, NOW)).toBe(false);
    expect(ownsPersonalPass({ pass: { ...pass, tier: 'other' } }, NOW)).toBe(false);
    expect(ownsPersonalPass({}, NOW)).toBe(false);
    expect(ownsPersonalPass(null, NOW)).toBe(false);
  });

  it('the "you already have a pass" check reads users/{uid}.pass, not the claim', () => {
    const body = store.slice(store.indexOf('purchasePitWallPass: async'), store.indexOf('purchaseCharter: async'));
    expect(body).toMatch(/ownsPersonalPass\(userSnap\.data\(\), Date\.now\(\)\)/);
    expect(body).not.toMatch(/usePitWallStore\.getState\(\)\.pass\.active/);
  });
});

describe('Charter purchase wiring (F-175)', () => {
  const buy = store.slice(store.indexOf('purchaseCharter: async'), store.indexOf('handlePurchaseComplete: async'));
  const complete = store.slice(store.indexOf('if (productId === PRODUCT_IDS.PITWALL_CHARTER)'), store.indexOf('// A product this build does not know about'));

  it('is refused in demo mode and on the Amazon build, before the store sheet', () => {
    const sheet = buy.indexOf('await buy(PRODUCT_IDS.PITWALL_CHARTER)');
    expect(buy.indexOf('isDemoMode')).toBeGreaterThan(-1);
    expect(buy.indexOf('if (isAmazonBuild)')).toBeGreaterThan(-1);
    expect(buy.indexOf('if (isAmazonBuild)')).toBeLessThan(sheet);
    expect(buy.indexOf('isDemoMode')).toBeLessThan(sheet);
  });

  it('remembers the league across launches and sends it to the server', () => {
    expect(buy).toMatch(/pendingCharterLeagueId: leagueId/);
    expect(store).toMatch(/pendingCharterLeagueId: state\.pendingCharterLeagueId/);
    expect(complete).toMatch(/recordPurchaseOnServer\(productId, .*, \{ leagueId \}\)/);
  });

  it('finishes the transaction only after the server answered, and never grants anything on the device', () => {
    expect(complete.indexOf('recordPurchaseOnServer')).toBeLessThan(complete.indexOf('finishTransaction'));
    expect(complete).not.toMatch(/pendingExpansionCredits|leagueSlotCredits|bonusAvatarCredits/);
  });
});
