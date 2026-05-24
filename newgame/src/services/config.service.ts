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
