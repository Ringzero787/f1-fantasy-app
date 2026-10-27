import { create } from 'zustand';
import { remoteConfigService, type GameConfig, type RemoteData, type AppVersionConfig } from '../services/remoteConfig.service';
import { demoDrivers, demoConstructors, demoRaces } from '../data/demoData';
import type { Driver, Constructor, Race } from '../types';
import { TEAM_COLORS } from '../config/constants';
import { firebaseAuth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface RemoteConfigState {
  // Config
  config: GameConfig;
  appConfig: AppVersionConfig;

  // Live data (falls back to demoData)
  drivers: Driver[];
  constructors: Constructor[];
  races: Race[];
  teamColors: Record<string, { primary: string; secondary: string }>;

  // State
  isLoaded: boolean;
  /** F-130: the last fetch ran with a signed-in session, so the signed-in-only documents were readable */
  fetchedSignedIn: boolean;
  ensureSignedInConfig: () => Promise<void>;
  isLoading: boolean;
  lastFetched: number | null;

  // Actions
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;

  // Getters (convenience)
  getDriver: (id: string) => Driver | undefined;
  getConstructor: (id: string) => Constructor | undefined;
  getRace: (id: string) => Race | undefined;
  getActiveDrivers: () => Driver[];
  getActiveConstructors: () => Constructor[];
  getUpcomingRaces: () => Race[];
}

export const useRemoteConfigStore = create<RemoteConfigState>((set, get) => ({
  config: remoteConfigService.getDefaults(),
  appConfig: { minVersion: null, latestVersion: null, updateMessage: null, androidUrl: null, iosUrl: null },
  drivers: demoDrivers,
  constructors: demoConstructors,
  races: demoRaces,
  teamColors: TEAM_COLORS,
  isLoaded: false,
  fetchedSignedIn: false,
  isLoading: false,
  lastFetched: null,

  initialize: () => {
    // One fetch at a time; a second caller waits for the one in flight rather than being dropped
    // (ensureSignedInConfig relies on this: it must see the first fetch finish before deciding).
    if (inflight) return inflight;
    inflight = runInitialize(set, get).finally(() => { inflight = null; });
    return inflight;
  },

  // F-130: `config/app` and `config/gameRules` are readable only when signed in. The startup fetch
  // can run before the session has been restored, in which case both fall back to defaults —
  // Moonshot reads as off, the version gate as open — for the rest of the session. Called once
  // sign-in is known: waits for any fetch in flight, then for the Firebase session itself (the
  // persisted sign-in flag is true before Firebase has restored the user), then fetches again.
  // A no-op when the last fetch already ran signed in.
  refresh: async () => {
    // Only refresh if it's been more than 5 minutes
    const last = get().lastFetched;
    if (last && Date.now() - last < 5 * 60 * 1000) return;
    await get().initialize();
  },

  getDriver: (id: string) => get().drivers.find(d => d.id === id),
  getConstructor: (id: string) => get().constructors.find(c => c.id === id),
  getRace: (id: string) => get().races.find(r => r.id === id),
  getActiveDrivers: () => get().drivers.filter(d => d.isActive),
  getActiveConstructors: () => get().constructors.filter(c => c.isActive),
  getUpcomingRaces: () => get().races.filter(r => r.status === 'upcoming'),

  ensureSignedInConfig: async () => {
    if (get().fetchedSignedIn) return;
    if (inflight) await inflight;
    if (get().fetchedSignedIn) return;
    if (!firebaseAuth.currentUser) await firebaseUser();
    if (get().fetchedSignedIn) return;
    await get().initialize();
  },
}));

let inflight: Promise<void> | null = null;

/** Resolves once Firebase has a signed-in user; never resolves while there is none (nothing to fetch for). */
function firebaseUser(): Promise<void> {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(firebaseAuth, (u) => { if (u) { off(); resolve(); } });
  });
}

async function runInitialize(set: (p: Partial<RemoteConfigState>) => void, get: () => RemoteConfigState): Promise<void> {
    set({ isLoading: true });
    const signedIn = !!firebaseAuth.currentUser;

    try {
      const data = await remoteConfigService.fetchAll();
      set({
        config: data.config,
        appConfig: data.appConfig,
        // Use Firestore data if available, fall back to demoData
        drivers: data.drivers.length > 0 ? data.drivers : demoDrivers,
        constructors: data.constructors.length > 0 ? data.constructors : demoConstructors,
        races: data.races.length > 0 ? data.races : demoRaces,
        teamColors: Object.keys(data.teamColors).length > 0 ? data.teamColors : TEAM_COLORS,
        isLoaded: true,
        isLoading: false,
        lastFetched: Date.now(),
      });
      console.log('[RemoteConfig] Loaded from Firestore');
    } catch (err) {
      console.warn('[RemoteConfig] Failed to load, using defaults:', err);
      set({ isLoaded: true, isLoading: false });
    }
    // a signed-in fetch that failed still counts: the recap must not wait forever offline
    set({ fetchedSignedIn: signedIn || get().fetchedSignedIn });
}
