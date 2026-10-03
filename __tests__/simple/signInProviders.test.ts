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
    expect(ctx({ isIOS: true })).toEqual(['apple', 'google']);
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
    // iOS has the native sheet, so canApple is always true there; the ordering still holds if not,
    // and Amazon is absent on iOS by decision (covered below), not because of this flag.
    expect(ctx({ isIOS: true, canApple: false })).toEqual(['google']);
  });

  it('hides Amazon outside its own store until the hardened flow is in the build', () => {
    // The original Amazon flow returns the authorization code on a claimable custom scheme, so the
    // pill waits rather than widening that exposure to every Play install.
    expect(ctx({ canAmazon: false })).toEqual(['google', 'apple']);
  });

  it('never offers Amazon on iOS, configured or not', () => {
    // The one provider left out by decision rather than capability: the browser flow runs on iOS
    // perfectly well. So the flag must make no difference there, which a flag usually does.
    expect(ctx({ isIOS: true, canAmazon: true })).toEqual(['apple', 'google']);
    expect(ctx({ isIOS: true, canAmazon: false })).toEqual(['apple', 'google']);
    expect(ctx({ isIOS: true, canApple: false })).toEqual(['google']);
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
              // `isAmazonBuild && isIOS` is not a real build; the Amazon branch owns that case.
              if (isIOS && !isAmazonBuild) expect(order).not.toContain('amazon');
            }
          }
        }
      }
    }
  });
});
