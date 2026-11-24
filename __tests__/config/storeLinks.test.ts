/**
 * F-157 (for F-116): "Update Now" reaches the build's own store. Before, an Amazon build fell back to
 * Play and the iOS fallback was a made-up app id, so the update floor could not be raised safely.
 */
import { storeUrlsFor, PLAY_STORE_URL, APP_STORE_URL, AMAZON_APPSTORE_URL, AMAZON_APPSTORE_WEB_URL } from '../../src/config/storeLinks';

describe('storeUrlsFor', () => {
  it('iOS: config/app.iosUrl, then the real App Store listing', () => {
    expect(APP_STORE_URL).toBe('https://apps.apple.com/app/id6759428075');
    expect(storeUrlsFor('ios', false, {})).toEqual([APP_STORE_URL]);
    expect(storeUrlsFor('ios', false, { iosUrl: 'https://x/ios', androidUrl: PLAY_STORE_URL })).toEqual(['https://x/ios', APP_STORE_URL]);
  });

  it('Play build: config/app.androidUrl, then Play', () => {
    expect(storeUrlsFor('android', false, {})).toEqual([PLAY_STORE_URL]);
    expect(storeUrlsFor('android', false, { androidUrl: PLAY_STORE_URL })).toEqual([PLAY_STORE_URL]);
  });

  it('Amazon build: never Play, even when config/app.androidUrl is set', () => {
    const urls = storeUrlsFor('android', true, { androidUrl: PLAY_STORE_URL });
    expect(urls).toEqual([AMAZON_APPSTORE_URL, AMAZON_APPSTORE_WEB_URL]);
    expect(urls.some((u) => u.includes('play.google.com'))).toBe(false);
    expect(storeUrlsFor('android', true, { amazonUrl: 'https://x/amazon' })[0]).toBe('https://x/amazon');
  });

  it('empty strings and nulls from config/app are skipped', () => {
    expect(storeUrlsFor('ios', false, { iosUrl: '' })).toEqual([APP_STORE_URL]);
    expect(storeUrlsFor('android', true, { amazonUrl: null })).toEqual([AMAZON_APPSTORE_URL, AMAZON_APPSTORE_WEB_URL]);
  });
});
