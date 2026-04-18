import { create } from 'zustand';
import { remoteConfigService, type GameConfig, type RemoteData } from '../services/remoteConfig.service';
import { demoDrivers, demoConstructors, demoRaces } from '../data/demoData';
import type { Driver, Constructor, Race } from '../types';
import { TEAM_COLORS } from '../config/constants';

interface RemoteConfigState {
  // Config
  config: GameConfig;

  // Live data (falls back to demoData)
  drivers: Driver[];
  constructors: Constructor[];
  races: Race[];
  teamColors: Record<string, { primary: string; secondary: string }>;

  // State
  isLoaded: boolean;
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
  drivers: demoDrivers,
  constructors: demoConstructors,
  races: demoRaces,
  teamColors: TEAM_COLORS,
  isLoaded: false,
  isLoading: false,
  lastFetched: null,

  initialize: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });

    try {
      const data = await remoteConfigService.fetchAll();
      set({
        config: data.config,
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
  },

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
}));
