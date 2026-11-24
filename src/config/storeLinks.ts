/**
 * F-157 (for F-116): where "Update Now" sends a player, per store. The config/app doc can override
 * each (androidUrl, iosUrl, amazonUrl); these are the fallbacks when it does not, or cannot be read
 * (it is signed-in only). An update floor is only safe to raise when every store's build can reach
 * its own store from here.
 */

/** Google Play listing. */
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.undercut.app';

/** App Store listing (App Store Connect app id 6759428075). */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6759428075';

/**
 * Amazon Appstore, by package name (no ASIN is recorded in the repo): the `amzn://` link opens the
 * Appstore app on a Fire device; the https link is the browser fallback when it cannot be opened.
 */
export const AMAZON_APPSTORE_URL = 'amzn://apps/android?p=com.undercut.app';
export const AMAZON_APPSTORE_WEB_URL = 'https://www.amazon.com/gp/mas/dl/android?p=com.undercut.app';

export interface StoreUrlConfig {
  androidUrl?: string | null;
  iosUrl?: string | null;
  amazonUrl?: string | null;
}

/**
 * The links to try, in order, for this build. An Amazon build never goes to Play (a Fire device has
 * no Play Store, and config/app.androidUrl is the Play link): config/app.amazonUrl, else the Appstore
 * app, else the web listing.
 */
export function storeUrlsFor(os: string, isAmazon: boolean, cfg: StoreUrlConfig): string[] {
  const list = os === 'ios'
    ? [cfg.iosUrl, APP_STORE_URL]
    : isAmazon
      ? [cfg.amazonUrl, AMAZON_APPSTORE_URL, AMAZON_APPSTORE_WEB_URL]
      : [cfg.androidUrl, PLAY_STORE_URL];
  return list.filter((u, i, a): u is string => typeof u === 'string' && u.length > 0 && a.indexOf(u) === i);
}
