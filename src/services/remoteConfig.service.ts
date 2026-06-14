import { doc, getDoc, collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PRICING_CONFIG } from '../config/pricing.config';
import { TEAM_COLORS, RACE_POINTS, SPRINT_POINTS, GRID_SIZE, BUDGET, TEAM_SIZE } from '../config/constants';
import { raceService } from './race.service';
import type { Driver, Constructor, Race } from '../types';

// ─── Types ───

export interface GameConfig {
  // Budget & team
  budget: number;
  teamSize: number;
  gridSize: number;

  // Points
  racePoints: number[];
  sprintPoints: number[];
  fastestLapBonus: number;
  positionGainedBonus: number;
  dnfPenalty: number;
  sprintDnfPenalty: number;

  // Ace
  aceMultiplier: number;
  aceMaxPrice: number;

  // Contracts
  contractDefault: number;
  contractMax: number;
  contractLockoutRaces: number;
  earlyTerminationRate: number;

  // Stale penalty
  stalePenaltyAfter: number;
  stalePenaltyPerRace: number;

  // Pricing
  minPrice: number;
  maxPrice: number;
  diminishFloor: number;

  // Season
  totalRounds: number;
  sprintRounds: number[];
}

/**
 * App-version gate, stored at config/app. ENTIRELY OPTIONAL and fail-open:
 * if the doc is missing or a field is absent, that tier of gating is off.
 *   - minVersion:    below this → hard block ("must update")
 *   - latestVersion: below this → dismissible "update available" prompt
 */
export interface AppVersionConfig {
  minVersion: string | null;
  latestVersion: string | null;
  updateMessage: string | null;
  androidUrl: string | null;
  iosUrl: string | null;
}

const DEFAULT_APP_CONFIG: AppVersionConfig = {
  minVersion: null,
  latestVersion: null,
  updateMessage: null,
  androidUrl: 'https://play.google.com/store/apps/details?id=com.undercut.app',
  iosUrl: 'https://apps.apple.com/app/id6739999999',
};

export interface RemoteData {
  config: GameConfig;
  appConfig: AppVersionConfig;
  drivers: Driver[];
  constructors: Constructor[];
  races: Race[];
  teamColors: Record<string, { primary: string; secondary: string }>;
}

// ─── Defaults (current hardcoded values as fallback) ───

const DEFAULT_CONFIG: GameConfig = {
  budget: BUDGET,
  teamSize: TEAM_SIZE,
  gridSize: GRID_SIZE,
  racePoints: RACE_POINTS,
  sprintPoints: SPRINT_POINTS,
  fastestLapBonus: 1,
  positionGainedBonus: 1,
  dnfPenalty: -5,
  sprintDnfPenalty: -3,
  aceMultiplier: PRICING_CONFIG.ACE_MULTIPLIER,
  aceMaxPrice: PRICING_CONFIG.ACE_MAX_PRICE,
  contractDefault: PRICING_CONFIG.CONTRACT_LENGTH,
  contractMax: PRICING_CONFIG.MAX_CONTRACT_LENGTH,
  contractLockoutRaces: PRICING_CONFIG.CONTRACT_LOCKOUT_RACES,
  earlyTerminationRate: PRICING_CONFIG.EARLY_TERMINATION_RATE,
  stalePenaltyAfter: PRICING_CONFIG.STALE_ROSTER_THRESHOLD,
  stalePenaltyPerRace: PRICING_CONFIG.STALE_ROSTER_PENALTY,
  minPrice: PRICING_CONFIG.MIN_PRICE,
  maxPrice: PRICING_CONFIG.MAX_PRICE,
  diminishFloor: PRICING_CONFIG.DIMINISH_FLOOR,
  totalRounds: 24,
  sprintRounds: [2, 6, 7, 11, 14, 18],
};

// ─── Service ───

export const remoteConfigService = {
  /**
   * Fetch game config from Firestore. Falls back to defaults on failure.
   */
  async fetchConfig(): Promise<GameConfig> {
    try {
      const docRef = doc(db, 'config', 'gameRules');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { ...DEFAULT_CONFIG, ...snap.data() } as GameConfig;
      }
    } catch (err) {
      console.warn('[RemoteConfig] Failed to fetch config, using defaults:', err);
    }
    return DEFAULT_CONFIG;
  },

  /**
   * Fetch the app-version gate (config/app). Fail-open: any error or missing
   * doc returns defaults with no min/latest version → no gating.
   */
  async fetchAppConfig(): Promise<AppVersionConfig> {
    try {
      const snap = await getDoc(doc(db, 'config', 'app'));
      if (snap.exists()) {
        return { ...DEFAULT_APP_CONFIG, ...snap.data() } as AppVersionConfig;
      }
    } catch (err) {
      console.warn('[RemoteConfig] Failed to fetch app config:', err);
    }
    return DEFAULT_APP_CONFIG;
  },

  /**
   * Fetch live driver roster from Firestore.
   */
  async fetchDrivers(): Promise<Driver[]> {
    try {
      const snap = await getDocs(collection(db, 'drivers'));
      if (!snap.empty) {
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Driver));
      }
    } catch (err) {
      console.warn('[RemoteConfig] Failed to fetch drivers:', err);
    }
    return [];
  },

  /**
   * Fetch live constructor roster from Firestore.
   */
  async fetchConstructors(): Promise<Constructor[]> {
    try {
      const snap = await getDocs(collection(db, 'constructors'));
      if (!snap.empty) {
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Constructor));
      }
    } catch (err) {
      console.warn('[RemoteConfig] Failed to fetch constructors:', err);
    }
    return [];
  },

  /**
   * Fetch live race schedule from Firestore.
   *
   * Schedule fields are stored as Firestore Timestamps (written by the server
   * schedule sync) and MUST be normalized to JS Dates here: the lockout and
   * countdown code does `new Date(value).getTime()` arithmetic, and
   * `new Date(firestoreTimestamp)` is Invalid Date — which silently disabled
   * schedule-based locking and produced "NaNm NaNs" countdowns.
   */
  async fetchRaces(): Promise<Race[]> {
    try {
      const q = query(collection(db, 'races'), orderBy('round', 'asc'));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          schedule: raceService.parseScheduleDates(d.data().schedule),
        } as Race));
      }
    } catch (err) {
      console.warn('[RemoteConfig] Failed to fetch races:', err);
    }
    return [];
  },

  /**
   * Fetch team colors from Firestore (stored on constructor docs).
   */
  async fetchTeamColors(): Promise<Record<string, { primary: string; secondary: string }>> {
    try {
      const snap = await getDocs(collection(db, 'constructors'));
      if (!snap.empty) {
        const colors: Record<string, { primary: string; secondary: string }> = {};
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.colors) {
            colors[d.id] = data.colors;
          }
        });
        if (Object.keys(colors).length > 0) return colors;
      }
    } catch {
      // Fall through to defaults
    }
    return TEAM_COLORS;
  },

  /**
   * Fetch everything in parallel. Single call on app startup.
   */
  async fetchAll(): Promise<RemoteData> {
    const [config, appConfig, drivers, constructors, races, teamColors] = await Promise.all([
      this.fetchConfig(),
      this.fetchAppConfig(),
      this.fetchDrivers(),
      this.fetchConstructors(),
      this.fetchRaces(),
      this.fetchTeamColors(),
    ]);
    return { config, appConfig, drivers, constructors, races, teamColors };
  },

  /**
   * Get default config (for offline/fallback).
   */
  getDefaults(): GameConfig {
    return { ...DEFAULT_CONFIG };
  },
};
