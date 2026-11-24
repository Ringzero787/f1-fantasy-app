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
/** The store hosts a config URL may point at (https only), plus the one Appstore deep link. */
const STORE_HOSTS = new Set(['play.google.com', 'apps.apple.com', 'www.amazon.com', 'amazon.com']);

/**
 * A config/app link is opened only if it goes to a store: https on a store host, or the Appstore deep
 * link. A mistyped or tampered doc must not send every player's "Update Now" to an arbitrary page or
 * scheme; anything else is dropped and the bundled link is used.
 */
export function isStoreUrl(u: unknown): u is string {
  if (typeof u !== 'string' || !u) return false;
  if (u === AMAZON_APPSTORE_URL) return true;
  const m = /^https:\/\/([^/?#:@]+)(?:[/?#]|$)/i.exec(u);
  return !!m && STORE_HOSTS.has(m[1].toLowerCase());
}

export function storeUrlsFor(os: string, isAmazon: boolean, cfg: StoreUrlConfig): string[] {
  const list = os === 'ios'
    ? [cfg.iosUrl, APP_STORE_URL]
    : isAmazon
      ? [cfg.amazonUrl, AMAZON_APPSTORE_URL, AMAZON_APPSTORE_WEB_URL]
      : [cfg.androidUrl, PLAY_STORE_URL];
  return list.filter((u, i, a): u is string => isStoreUrl(u) && a.indexOf(u) === i);
}
