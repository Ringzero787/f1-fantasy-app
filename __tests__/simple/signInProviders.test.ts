/**
 * Which sign-in buttons each store build shows (F-091).
 *
 * This is the table that decides whether a person reaches their account or quietly makes a second
 * one, and it used to live in a render block as three nested conditionals. A regression that drops
 * the Amazon pill on Play, or reverses Apple and Google on iOS, has no other way of being noticed.
 */
import { providerOrder } from '../../src/simple/grid/signInProviders';

const ctx = (over: Partial<Parameters<typeof providerOrder>[0]> = {}) =>
  providerOrder({ isAmazonBuild: false, isIOS: false, canApple: true, canAmazon: true, canGoogleWeb: true, ...over });

describe('providerOrder', () => {
  it('leads with the store the build came from', () => {
    expect(ctx({ isAmazonBuild: true })).toEqual(['amazon', 'apple', 'google']);
    expect(ctx({ isIOS: true })).toEqual(['apple', 'google', 'amazon']);
    expect(ctx()).toEqual(['google', 'apple', 'amazon']);
  });

  it('offers Google on the Amazon build only through the browser flow', () => {
    // Fire OS has no Play Services, so the native module cannot run; without the browser flow an
    // account made with Google on a phone is unreachable from a Fire tablet (F-093).
    expect(ctx({ isAmazonBuild: true })).toEqual(['amazon', 'apple', 'google']);
    expect(ctx({ isAmazonBuild: true, canGoogleWeb: false })).toEqual(['amazon', 'apple']);
    expect(ctx({ isAmazonBuild: true, canApple: false, canGoogleWeb: false })).toEqual(['amazon']);
  });

  it('puts the store\u2019s own provider first on the Amazon build', () => {
    expect(ctx({ isAmazonBuild: true })[0]).toBe('amazon');
  });

  it('hides Apple where its web flow is not configured, rather than offering a broken button', () => {
    expect(ctx({ canApple: false })).toEqual(['google', 'amazon']);
    // iOS has the native sheet, so canApple is always true there; the ordering still holds if not.
    expect(ctx({ isIOS: true, canApple: false })).toEqual(['google', 'amazon']);
  });

  it('hides Amazon outside its own store until the hardened flow is in the build', () => {
    // The original Amazon flow returns the authorization code on a claimable custom scheme, so the
    // pill waits rather than widening that exposure to every Play and iOS install.
    expect(ctx({ canAmazon: false })).toEqual(['google', 'apple']);
    expect(ctx({ isIOS: true, canAmazon: false })).toEqual(['apple', 'google']);
  });

  it('keeps the Amazon build usable even if nothing else is configured', () => {
    expect(ctx({ isAmazonBuild: true, canApple: false, canAmazon: true, canGoogleWeb: false })).toEqual(['amazon']);
    // And never returns an empty set on a build that can run Google.
    expect(ctx({ canApple: false, canAmazon: false })).toEqual(['google']);
  });

  it('is a list with no repeats, whatever the combination', () => {
    for (const isAmazonBuild of [true, false]) {
      for (const isIOS of [true, false]) {
        for (const canApple of [true, false]) {
          for (const canAmazon of [true, false]) {
            for (const canGoogleWeb of [true, false]) {
              const order = providerOrder({ isAmazonBuild, isIOS, canApple, canAmazon, canGoogleWeb });
              expect(new Set(order).size).toBe(order.length);
              // The non-Amazon builds use the native sheet, so the browser flag must not add a
              // second Google pill there.
              if (!isAmazonBuild) expect(order.filter((p) => p === 'google')).toHaveLength(1);
            }
          }
        }
      }
    }
  });
});
