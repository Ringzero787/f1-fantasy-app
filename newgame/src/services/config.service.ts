// Remote app config — reads the single tl_config/app doc. Fails open: any
// error (missing doc, rules, network) resolves to null so the app behaves as
// if there were no config at all. Never let this brick the app.

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AppConfig } from '../types';

export const configService = {
  async get(): Promise<AppConfig | null> {
    try {
      const snap = await getDoc(doc(db, 'tl_config', 'app'));
      return snap.exists() ? (snap.data() as AppConfig) : null;
    } catch {
      return null;
    }
  },
};

// Read a feature flag with a default. Safe on a null config.
export function appConfigFlag(config: AppConfig | null | undefined, key: string, fallback = false): boolean {
  const v = config?.features?.[key];
  return typeof v === 'boolean' ? v : fallback;
}

// The readers below all take the bundled value as `fallback` and return it
// whenever the config is missing, unreadable, or carries a nonsense value.
// That keeps the "fails open" contract: deleting tl_config/app must leave the
// app behaving exactly as it did before the doc existed.

// An economy figure shown to players. The server decides what it actually pays
// and charges; this only controls what the app displays. Rejects negatives and
// non-finite numbers so a bad config can't render "$NaN" or "$-100".
export function appConfigEconomy(
  config: AppConfig | null | undefined,
  key: 'startingCash' | 'rollStartingCash',
  fallback: number
): number {
  const v = config?.economy?.[key];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

// A cosmetic pack price. The server re-checks the real price on purchase, so a
// wrong value here misleads rather than overcharges — still worth guarding.
export function appConfigPackPrice(
  config: AppConfig | null | undefined,
  packId: string,
  fallback: number
): number {
  const v = config?.packPrices?.[packId];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

// A player-facing string. An empty or whitespace-only override is treated as
// absent, so a blank config value can never wipe out copy on screen.
export function appConfigCopy(
  config: AppConfig | null | undefined,
  key: string,
  fallback: string
): string {
  const v = config?.copy?.[key];
  return typeof v === 'string' && v.trim() ? v : fallback;
}
