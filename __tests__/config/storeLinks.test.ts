/**
 * F-157 (for F-116): "Update Now" reaches the build's own store. Before, an Amazon build fell back to
 * Play and the iOS fallback was a made-up app id, so the update floor could not be raised safely.
 */
import { storeUrlsFor, isStoreUrl, PLAY_STORE_URL, APP_STORE_URL, AMAZON_APPSTORE_URL, AMAZON_APPSTORE_WEB_URL } from '../../src/config/storeLinks';

describe('storeUrlsFor', () => {
  it('iOS: config/app.iosUrl, then the real App Store listing', () => {
    expect(APP_STORE_URL).toBe('https://apps.apple.com/app/id6759428075');
    expect(storeUrlsFor('ios', false, {})).toEqual([APP_STORE_URL]);
    expect(storeUrlsFor('ios', false, { iosUrl: 'https://apps.apple.com/us/app/undercut/id6759428075', androidUrl: PLAY_STORE_URL })).toEqual(['https://apps.apple.com/us/app/undercut/id6759428075', APP_STORE_URL]);
  });

  it('Play build: config/app.androidUrl, then Play', () => {
    expect(storeUrlsFor('android', false, {})).toEqual([PLAY_STORE_URL]);
    expect(storeUrlsFor('android', false, { androidUrl: PLAY_STORE_URL })).toEqual([PLAY_STORE_URL]);
  });

  it('Amazon build: never Play, even when config/app.androidUrl is set', () => {
    const urls = storeUrlsFor('android', true, { androidUrl: PLAY_STORE_URL });
    expect(urls).toEqual([AMAZON_APPSTORE_URL, AMAZON_APPSTORE_WEB_URL]);
    expect(urls.some((u) => u.includes('play.google.com'))).toBe(false);
    expect(storeUrlsFor('android', true, { amazonUrl: 'https://www.amazon.com/dp/B0EXAMPLE' })[0]).toBe('https://www.amazon.com/dp/B0EXAMPLE');
  });

  it('empty strings and nulls from config/app are skipped', () => {
    expect(storeUrlsFor('ios', false, { iosUrl: '' })).toEqual([APP_STORE_URL]);
    expect(storeUrlsFor('android', true, { amazonUrl: null })).toEqual([AMAZON_APPSTORE_URL, AMAZON_APPSTORE_WEB_URL]);
  });
  it('a config link that is not a store is dropped, the bundled one is used (tampered or mistyped config/app)', () => {
    for (const bad of ['https://evil.example/update', 'http://play.google.com/store/apps/details?id=x', 'intent://x#Intent;end', 'javascript:alert(1)', 'https://play.google.com.evil.example/', 'https://user@apps.apple.com.evil/']) {
      expect(storeUrlsFor('ios', false, { iosUrl: bad })).toEqual([APP_STORE_URL]);
      expect(storeUrlsFor('android', false, { androidUrl: bad })).toEqual([PLAY_STORE_URL]);
    }
    expect(isStoreUrl('https://play.google.com/store/apps/details?id=com.undercut.app')).toBe(true);
    expect(isStoreUrl('https://www.amazon.com/dp/B0EXAMPLE')).toBe(true);
    expect(isStoreUrl(AMAZON_APPSTORE_URL)).toBe(true);
  });
});
