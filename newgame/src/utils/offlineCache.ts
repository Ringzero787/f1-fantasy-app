import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'tl_offline_cache_v1:';

// Wraps a network read so the last successful result serves as a fallback
// when the fetch fails (offline, backend hiccup). Read-only offline support:
// writes still require a connection and surface their own errors.
//
// Cached values are JSON round-tripped, so Firestore Timestamps come back as
// plain `{seconds, nanoseconds}` objects — date access on any cached path
// must go through the tolerant toDate/toMillis helpers (formatters.ts,
// lineup.service.ts, data.service.ts), never `.toDate()` directly.
export async function withOfflineFallback<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const storageKey = PREFIX + key;
  try {
    const value = await fetcher();
    // Best-effort write-behind; a full disk or serialization hiccup must not
    // fail the live read.
    AsyncStorage.setItem(storageKey, JSON.stringify(value)).catch(() => {});
    return value;
  } catch (err) {
    const raw = await AsyncStorage.getItem(storageKey).catch(() => null);
    if (raw != null) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        // fall through to the original error
      }
    }
    throw err;
  }
}

// Offline, Firestore's getDocs does NOT reject — it resolves an empty
// snapshot straight from its (empty on cold start) memory cache with
// metadata.fromCache set. Call this after any getDocs whose empty result
// should mean "no server contact" rather than "genuinely empty", so
// withOfflineFallback can serve the last known copy instead.
export function throwIfOfflineEmpty(snap: {
  empty: boolean;
  metadata: { fromCache: boolean };
}): void {
  if (snap.empty && snap.metadata.fromCache) {
    throw new Error('offline: query resolved from empty local cache');
  }
}
