/**
 * Product events (F-108). The app had no client analytics path; this is the smallest honest one:
 * Firebase Analytics where the JS SDK supports it (the web build), a no-op elsewhere. Native
 * builds would need the native Analytics module, which is a separate decision — until then the
 * server's own structured logs (`moonshot_confirmed`, `moonshot_cancelled`, settlement) are the
 * record. Never throws: a failed event must not break a screen.
 */
import { Platform } from 'react-native';
import { app } from '../config/firebase';

type Params = Record<string, string | number | boolean | null | undefined>;
type Logger = (name: string, params?: Params) => void;

let logger: Logger | null | undefined;   // undefined = not yet decided, null = unavailable

async function resolveLogger(): Promise<Logger | null> {
  if (logger !== undefined) return logger;
  logger = null;
  if (Platform.OS === 'web') {
    try {
      const mod = await import('firebase/analytics');
      if (await mod.isSupported()) {
        const analytics = mod.getAnalytics(app);
        logger = (name, params) => mod.logEvent(analytics, name, params as Record<string, unknown>);
      }
    } catch (e) {
      console.warn('[analytics] unavailable:', e);
    }
  }
  return logger;
}

/** Record a product event; drops undefined values; never throws. */
export function track(name: string, params: Params = {}): void {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
  resolveLogger().then((log) => { if (log) log(name, clean); }).catch(() => undefined);
  if (__DEV__) console.log(`[event] ${name}`, clean);
}
