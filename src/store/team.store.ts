import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FantasyTeam, FantasyDriver, FantasyConstructor, Driver, Constructor, TeamSelectionState, LockStatus } from '../types';
import { teamService } from '../services/team.service';
import { useAuthStore } from './auth.store';
import { BUDGET, TEAM_SIZE, SALE_COMMISSION_RATE } from '../config/constants';
import { PRICING_CONFIG } from '../config/pricing.config';
import { useAdminStore } from './admin.store';
import { errorLogService } from '../services/errorLog.service';

// Calculate sale value after commission
const calculateSaleValue = (currentPrice: number): number => {
  return Math.floor(currentPrice * (1 - SALE_COMMISSION_RATE));
};

// V5: Lockout helpers — pure functions for checking driver lockout after contract expiry
export function isDriverLockedOut(
  driverLockouts: Record<string, number> | undefined,
  driverId: string,
  completedRaceCount: number
): boolean {
  if (!driverLockouts) return false;
  const expiresAt = driverLockouts[driverId];
  if (expiresAt === undefined) return false;
  return completedRaceCount < expiresAt;
}

export function getLockedOutDriverIds(
  driverLockouts: Record<string, number> | undefined,
  completedRaceCount: number
): string[] {
  if (!driverLockouts) return [];
  return Object.entries(driverLockouts)
    .filter(([_, expiresAt]) => completedRaceCount < expiresAt)
    .map(([driverId]) => driverId);
}
// V6: Calculate early termination fee for breaking a driver contract early
// Fee is based on current market price so it scales with the driver's actual value
export function calculateEarlyTerminationFee(
  currentPrice: number,
  contractLength: number,
  racesHeld: number
): number {
  const racesRemaining = Math.max(0, contractLength - racesHeld);
  return Math.floor(currentPrice * PRICING_CONFIG.EARLY_TERMINATION_RATE * racesRemaining);
}

import { demoDrivers, demoConstructors, demoRaces } from '../data/demoData';

// Calculate fantasy points for a team based on race results
// V3: Uses ace system (2x points) and stale roster penalty
// Build raceId -> round lookup from demoRaces
const raceRoundLookup: Record<string, number> = {};
demoRaces.forEach(r => { raceRoundLookup[r.id] = r.round; });

const calculateTeamPointsFromRaces = (team: FantasyTeam): {
  totalPoints: number;
  driverPoints: Record<string, number>;
  constructorPoints: number;
  perRacePoints: { round: number; points: number }[];
} => {
  const { raceResults } = useAdminStore.getState();
  let totalPoints = 0;
  const driverPoints: Record<string, number> = {};
  let constructorPoints = 0;

  // Only count races after the team was created
  const joinedAtRace = team.joinedAtRace || 0;

  // Collect completed race rounds relevant to this team
  const completedRaces: { raceId: string; round: number; result: typeof raceResults[string] }[] = [];
  Object.entries(raceResults).forEach(([raceId, result]) => {
    if (!result.isComplete) return;
    const round = raceRoundLookup[raceId] || 0;
    if (round <= joinedAtRace) return;
    completedRaces.push({ raceId, round, result });
  });
  completedRaces.sort((a, b) => a.round - b.round);

  // Track per-race point totals
  const perRacePoints: { round: number; points: number }[] = [];

  // Calculate points for each driver (only for races during their tenure)
  team.drivers.forEach(driver => {
    let driverTotal = 0;
    const driverAddedAt = driver.addedAtRace ?? (team.joinedAtRace || 0);
    completedRaces.forEach(({ round, result }) => {
      if (round <= driverAddedAt) return; // Skip races before driver joined
      const driverResult = result.driverResults.find(dr => dr.driverId === driver.driverId);
      if (driverResult) {
        let points = driverResult.points;
        if (team.aceDriverId === driver.driverId) {
          points = points * PRICING_CONFIG.ACE_MULTIPLIER;
        }
        driverTotal += points;
      }
      const sprintResult = result.sprintResults?.find(sr => sr.driverId === driver.driverId);
      if (sprintResult) {
        let points = sprintResult.points;
        if (team.aceDriverId === driver.driverId) {
          points = points * PRICING_CONFIG.ACE_MULTIPLIER;
        }
        driverTotal += points;
      }
    });
    driverPoints[driver.driverId] = driverTotal;
    totalPoints += driverTotal;
  });

  // Calculate points for constructor (ace bonus if aceConstructorId matches)
  if (team.constructor) {
    const isAceConstructor = team.aceConstructorId === team.constructor.constructorId;
    completedRaces.forEach(({ result }) => {
      const constructorResult = result.constructorResults.find(
        cr => cr.constructorId === team.constructor!.constructorId
      );
      if (constructorResult) {
        let points = constructorResult.points;
        if (isAceConstructor) points *= PRICING_CONFIG.ACE_MULTIPLIER;
        constructorPoints += points;
      }
      const sprintConstructorResult = result.sprintConstructorResults?.find(
        scr => scr.constructorId === team.constructor!.constructorId
      );
      if (sprintConstructorResult) {
        let points = sprintConstructorResult.points;
        if (isAceConstructor) points *= PRICING_CONFIG.ACE_MULTIPLIER;
        constructorPoints += points;
      }
    });
    totalPoints += constructorPoints;
  }

  // Build per-race totals (drivers + constructor for each race, filtered by tenure)
  completedRaces.forEach(({ round, result }) => {
    let raceTotal = 0;
    team.drivers.forEach(driver => {
      const driverAddedAt = driver.addedAtRace ?? (team.joinedAtRace || 0);
      if (round <= driverAddedAt) return; // Skip races before driver joined
      const driverResult = result.driverResults.find(dr => dr.driverId === driver.driverId);
      if (driverResult) {
        let points = driverResult.points;
        if (team.aceDriverId === driver.driverId) points *= PRICING_CONFIG.ACE_MULTIPLIER;
        raceTotal += points;
      }
      const sprintResult = result.sprintResults?.find(sr => sr.driverId === driver.driverId);
      if (sprintResult) {
        let points = sprintResult.points;
        if (team.aceDriverId === driver.driverId) points *= PRICING_CONFIG.ACE_MULTIPLIER;
        raceTotal += points;
      }
    });
    if (team.constructor) {
      const isAceCon = team.aceConstructorId === team.constructor.constructorId;
      const cr = result.constructorResults.find(c => c.constructorId === team.constructor!.constructorId);
      if (cr) raceTotal += isAceCon ? cr.points * PRICING_CONFIG.ACE_MULTIPLIER : cr.points;
      const scr = result.sprintConstructorResults?.find(c => c.constructorId === team.constructor!.constructorId);
      if (scr) raceTotal += isAceCon ? scr.points * PRICING_CONFIG.ACE_MULTIPLIER : scr.points;
    }
    perRacePoints.push({ round, points: raceTotal });
  });

  // V3: Apply stale roster penalty
  const racesSinceTransfer = team.racesSinceTransfer || 0;
  if (racesSinceTransfer > PRICING_CONFIG.STALE_ROSTER_THRESHOLD) {
    const racesOverThreshold = racesSinceTransfer - PRICING_CONFIG.STALE_ROSTER_THRESHOLD;
    const penalty = racesOverThreshold * PRICING_CONFIG.STALE_ROSTER_PENALTY;
    totalPoints -= penalty;
  }

  // V4: Late joiner catch-up points for missed races
  const missedRaces = team.joinedAtRace || 0;
  if (missedRaces > 0) {
    totalPoints += missedRaces * PRICING_CONFIG.LATE_JOINER_POINTS_PER_RACE;
  }

  // V7: Add banked points from departed drivers
  totalPoints += team.lockedPoints || 0;

  return { totalPoints, driverPoints, constructorPoints, perRacePoints };
};

// Demo team counter - use timestamp to avoid ID collisions across sessions
let demoTeamIdCounter = Date.now();

// Periodic sync interval (60 seconds)
const SYNC_INTERVAL_MS = 60 * 1000;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;

interface TeamState {
  currentTeam: FantasyTeam | null;
  userTeams: FantasyTeam[]; // All teams for the user
  isLoading: boolean;
  error: string | null;
  hasHydrated: boolean; // Track if persist has rehydrated
  lastSyncTime: number | null; // Timestamp of last successful sync
  isSyncing: boolean; // Track if sync is in progress

  // Selection state for building team
  selectedDrivers: Driver[];
  selectedConstructor: Constructor | null;
  selectionState: TeamSelectionState;

  // Actions
  setCurrentTeam: (team: FantasyTeam | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasHydrated: (hasHydrated: boolean) => void;

  // Sync actions
  syncToFirebase: () => Promise<void>;
  startPeriodicSync: () => void;
  stopPeriodicSync: () => void;

  // Selection actions
  addDriverToSelection: (driver: Driver) => void;
  removeDriverFromSelection: (driverId: string) => void;
  setSelectedConstructor: (constructor: Constructor | null) => void;
  clearSelection: () => void;
  validateSelection: () => TeamSelectionState;

  // Multi-team actions
  loadUserTeams: (userId: string) => Promise<void>;
  selectTeam: (teamId: string) => void;

  // Team actions
  loadTeam: (teamId: string) => Promise<void>;
  loadUserTeamInLeague: (userId: string, leagueId: string) => Promise<void>;
  createTeam: (userId: string, leagueId: string | null, name: string) => Promise<FantasyTeam>;
  assignTeamToLeague: (teamId: string, leagueId: string) => Promise<void>;
  addDriver: (driverId: string) => Promise<void>;
  removeDriver: (driverId: string) => Promise<void>;
  swapDriver: (oldDriverId: string, newDriverId: string) => Promise<void>;
  setConstructor: (constructorId: string, contractLength?: number) => Promise<void>;
  // V3: Ace system (replaces star driver) — one of driver or constructor
  setAce: (driverId: string) => Promise<void>;
  setAceConstructor: (constructorId: string) => Promise<void>;
  clearAce: () => Promise<void>;
  confirmSelection: () => Promise<void>;
  updateTeamName: (name: string) => Promise<void>;
  removeConstructor: () => Promise<void>;
  deleteTeam: () => Promise<void>;

  // Points calculation
  recalculateTeamPoints: () => void;
  recalculateAllTeamsPoints: () => void;
  getTeamPointsBreakdown: () => { totalPoints: number; driverPoints: Record<string, number>; constructorPoints: number } | null;

  clearError: () => void;
  resetTeamState: () => void;
}

const initialSelectionState: TeamSelectionState = {
  selectedDrivers: [],
  selectedConstructor: null,
  totalCost: 0,
  remainingBudget: BUDGET,
  isValid: false,
  validationErrors: [],
};

const defaultLockStatus: LockStatus = {
  isSeasonLocked: false,
  seasonLockRacesRemaining: 0,
  canModify: true,
};

// Local validation function for demo mode
function validateTeamSelectionLocal(
  drivers: Driver[],
  constructor: Constructor | null,
  budget: number
): TeamSelectionState {
  const driversCost = drivers.reduce((sum, d) => sum + d.price, 0);
  const constructorCost = constructor?.price || 0;
  const totalCost = driversCost + constructorCost;
  const remainingBudget = budget - totalCost;

  const errors: string[] = [];

  if (drivers.length !== TEAM_SIZE) {
    errors.push(`Select ${TEAM_SIZE} drivers (currently ${drivers.length})`);
  }

  if (!constructor) {
    errors.push('Select a constructor');
  }

  if (remainingBudget < 0) {
    errors.push(`Over budget by ${Math.abs(remainingBudget)} points`);
  }

  return {
    selectedDrivers: drivers.map(d => d.id),
    selectedConstructor: constructor?.id || null,
    totalCost,
    remainingBudget,
    isValid: errors.length === 0,
    validationErrors: errors,
  };
}

// Helper to sync team to Firebase and update lastSyncTime
const syncTeamToFirebase = (team: FantasyTeam, context: string) => {
  const isDemoMode = useAuthStore.getState().isDemoMode;
  if (isDemoMode) return;

  teamService.syncTeam(team).then(() => {
    useTeamStore.setState({ lastSyncTime: Date.now() });
    console.log(`${context}: Firebase sync successful`);
  }).catch((firebaseError) => {
    errorLogService.logError(context, firebaseError);
  });
};

// Helper to update currentTeam and sync to userTeams
const updateTeamAndSync = (
  get: () => TeamState,
  set: (state: Partial<TeamState>) => void,
  updatedTeam: FantasyTeam,
  additionalState: Partial<TeamState> = {}
) => {
  const { userTeams } = get();
  const updatedUserTeams = userTeams.map(t => t.id === updatedTeam.id ? updatedTeam : t);
  set({ currentTeam: updatedTeam, userTeams: updatedUserTeams, ...additionalState });
};

export const useTeamStore = create<TeamState>()(
  persist(
    (set, get) => ({
  currentTeam: null,
  userTeams: [],
  isLoading: false,
  error: null,
  hasHydrated: false,
  lastSyncTime: null,
  isSyncing: false,
  selectedDrivers: [],
  selectedConstructor: null,
  selectionState: initialSelectionState,

  setHasHydrated: (hasHydrated) => set({ hasHydrated }),

  // Sync all teams to Firebase
  syncToFirebase: async () => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    if (isDemoMode) return; // No sync in demo mode

    const { userTeams, isSyncing } = get();
    if (isSyncing || userTeams.length === 0) return; // Already syncing or no teams

    set({ isSyncing: true });
    try {
      await teamService.syncTeams(userTeams);
      set({ lastSyncTime: Date.now(), isSyncing: false });
      console.log('syncToFirebase: Sync successful at', new Date().toISOString());
    } catch (error) {
      set({ isSyncing: false });
      errorLogService.logError('syncToFirebase', error);
    }
  },

  // Start periodic sync every 60 seconds
  startPeriodicSync: () => {
    try {
      const isDemoMode = useAuthStore.getState().isDemoMode;
      if (isDemoMode) return; // No sync in demo mode

      // Clear any existing interval
      if (syncIntervalId) {
        clearInterval(syncIntervalId);
      }

      // Start new interval
      syncIntervalId = setInterval(() => {
        try {
          const state = useTeamStore.getState();
          const now = Date.now();
          // Only sync if it's been at least 60 seconds since last sync
          if (!state.lastSyncTime || (now - state.lastSyncTime) >= SYNC_INTERVAL_MS) {
            state.syncToFirebase();
          }
        } catch (e) {
          errorLogService.logError('periodicSync', e);
        }
      }, SYNC_INTERVAL_MS);

      console.log('startPeriodicSync: Started periodic sync every 60 seconds');
    } catch (e) {
      console.log('Failed to start periodic sync:', e);
    }
  },

  // Stop periodic sync
  stopPeriodicSync: () => {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
      console.log('stopPeriodicSync: Stopped periodic sync');
    }
  },
  setCurrentTeam: (team) => {
    // Also update the team in userTeams array if it exists
    if (team) {
      const { userTeams } = get();
      const updatedUserTeams = userTeams.map(t => t.id === team.id ? team : t);
      set({ currentTeam: team, userTeams: updatedUserTeams });
    } else {
      set({ currentTeam: team });
    }
  },
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  clearError: () => set({ error: null }),
  resetTeamState: () => set({
    currentTeam: null,
    userTeams: [],
    selectedDrivers: [],
    selectedConstructor: null,
    selectionState: initialSelectionState,
  }),

  addDriverToSelection: (driver) => {
    const { selectedDrivers } = get();
    if (selectedDrivers.length >= TEAM_SIZE) {
      set({ error: `Maximum ${TEAM_SIZE} drivers allowed` });
      return;
    }
    if (selectedDrivers.some((d) => d.id === driver.id)) {
      set({ error: 'Driver already selected' });
      return;
    }
    const newDrivers = [...selectedDrivers, driver];
    set({ selectedDrivers: newDrivers, error: null });
    get().validateSelection();
  },

  removeDriverFromSelection: (driverId) => {
    const { selectedDrivers } = get();
    const newDrivers = selectedDrivers.filter((d) => d.id !== driverId);
    set({ selectedDrivers: newDrivers });
    get().validateSelection();
  },

  setSelectedConstructor: (constructor) => {
    set({ selectedConstructor: constructor });
    get().validateSelection();
  },

  clearSelection: () => {
    set({
      selectedDrivers: [],
      selectedConstructor: null,
      selectionState: initialSelectionState,
    });
  },

  validateSelection: () => {
    const { selectedDrivers, selectedConstructor } = get();
    const isDemoMode = useAuthStore.getState().isDemoMode;

    let selectionState: TeamSelectionState;
    if (isDemoMode) {
      selectionState = validateTeamSelectionLocal(selectedDrivers, selectedConstructor, BUDGET);
    } else {
      selectionState = teamService.validateTeamSelection(
        selectedDrivers,
        selectedConstructor,
        BUDGET
      );
    }
    set({ selectionState });
    return selectionState;
  },

  // Load all teams for a user
  loadUserTeams: async (userId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, userTeams are stored locally in state
        // Filter by userId and deduplicate teams by ID (keep the latest by updatedAt)
        const { userTeams, currentTeam } = get();
        const userFilteredTeams = userTeams.filter(t => t.userId === userId);
        const uniqueTeams = userFilteredTeams.reduce((acc, team) => {
          const existing = acc.find(t => t.id === team.id);
          if (!existing) {
            acc.push(team);
          } else if (team.updatedAt > existing.updatedAt) {
            // Replace with newer version
            const index = acc.indexOf(existing);
            acc[index] = team;
          }
          return acc;
        }, [] as FantasyTeam[]);

        // Update state if duplicates were found
        if (uniqueTeams.length !== userTeams.length) {
          set({ userTeams: uniqueTeams });
        }

        // Auto-select first team if no current team, OR refresh currentTeam from userTeams
        if (uniqueTeams.length > 0) {
          if (!currentTeam) {
            set({ currentTeam: uniqueTeams[0], isLoading: false });
          } else {
            // Ensure currentTeam is synced with the latest from userTeams
            const latestTeam = uniqueTeams.find(t => t.id === currentTeam.id);
            if (latestTeam) {
              set({ currentTeam: latestTeam, isLoading: false });
            } else {
              // Current team not found in userTeams, select first available
              set({ currentTeam: uniqueTeams[0], isLoading: false });
            }
          }
        } else {
          set({ isLoading: false });
        }
        return;
      }

      // Use local-first pattern - local state is the source of truth
      // Filter by userId and deduplicate teams by ID
      const { userTeams, currentTeam } = get();
      const userFilteredTeams = userTeams.filter(t => t.userId === userId);
      const uniqueTeams = userFilteredTeams.reduce((acc, team) => {
        const existing = acc.find(t => t.id === team.id);
        if (!existing) {
          acc.push(team);
        } else if (team.updatedAt > existing.updatedAt) {
          const index = acc.indexOf(existing);
          acc[index] = team;
        }
        return acc;
      }, [] as FantasyTeam[]);

      if (uniqueTeams.length !== userTeams.length) {
        set({ userTeams: uniqueTeams });
      }

      if (uniqueTeams.length > 0) {
        if (!currentTeam) {
          set({ currentTeam: uniqueTeams[0], isLoading: false });
        } else {
          const latestTeam = uniqueTeams.find(t => t.id === currentTeam.id);
          if (latestTeam) {
            set({ currentTeam: latestTeam, isLoading: false });
          } else {
            set({ currentTeam: uniqueTeams[0], isLoading: false });
          }
        }
      } else {
        // Local state is empty — try recovering teams from Firebase
        try {
          const firebaseTeams = await teamService.getUserTeams(userId);
          if (firebaseTeams.length > 0) {
            console.log(`loadUserTeams: Recovered ${firebaseTeams.length} team(s) from Firebase`);
            set({
              userTeams: firebaseTeams,
              currentTeam: firebaseTeams[0],
              isLoading: false,
            });
            return;
          }
        } catch (fetchError) {
          errorLogService.logError('loadUserTeams', fetchError);
        }
        set({ isLoading: false });
      }

      // Sync local teams TO Firebase in background
      if (uniqueTeams.length > 0) {
        const isDemoMode2 = useAuthStore.getState().isDemoMode;
        if (!isDemoMode2) {
          teamService.syncTeams(uniqueTeams).then(() => {
            set({ lastSyncTime: Date.now() });
            console.log('loadUserTeams: Firebase sync successful');
          }).catch((firebaseError) => {
            errorLogService.logError('loadUserTeams.sync', firebaseError);
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load teams';
      set({ error: message, isLoading: false });
    }
  },

  // Select a team from userTeams as the current team
  selectTeam: (teamId) => {
    const { userTeams } = get();
    const team = userTeams.find(t => t.id === teamId);
    if (team) {
      set({ currentTeam: team });
    }
  },

  loadTeam: async (teamId) => {
    set({ isLoading: true, error: null });
    try {
      // Use local-first pattern - check userTeams first
      const { currentTeam, userTeams } = get();

      // If already the current team, just return
      if (currentTeam?.id === teamId) {
        set({ isLoading: false });
        return;
      }

      // Try to find in local userTeams
      const localTeam = userTeams.find(t => t.id === teamId);
      if (localTeam) {
        set({ currentTeam: localTeam, isLoading: false });
        return;
      }

      // Team not found locally, set to null
      set({ currentTeam: null, isLoading: false });

      // Try Firebase in background (fire-and-forget)
      const isDemoMode = useAuthStore.getState().isDemoMode;
      if (!isDemoMode) {
        teamService.getTeamById(teamId).catch((firebaseError) => {
          errorLogService.logError('loadTeam', firebaseError, { teamId });
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load team';
      set({ error: message, isLoading: false });
    }
  },

  loadUserTeamInLeague: async (userId, leagueId) => {
    set({ isLoading: true, error: null });
    try {
      // Use local-first pattern - check local state first
      const { currentTeam, userTeams } = get();

      // If current team already matches, just return
      if (currentTeam?.leagueId === leagueId && currentTeam?.userId === userId) {
        set({ isLoading: false });
        return;
      }

      // Try to find in local userTeams
      const localTeam = userTeams.find(t => t.leagueId === leagueId && t.userId === userId);
      if (localTeam) {
        set({ currentTeam: localTeam, isLoading: false });
        return;
      }

      // Team not found locally, set to null
      set({ currentTeam: null, isLoading: false });

      // Try Firebase in background (fire-and-forget)
      const isDemoMode = useAuthStore.getState().isDemoMode;
      if (!isDemoMode) {
        teamService.getUserTeamInLeague(userId, leagueId).catch((firebaseError) => {
          errorLogService.logError('loadUserTeamInLeague', firebaseError, { leagueId });
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load team';
      set({ error: message, isLoading: false });
    }
  },

  createTeam: async (userId, leagueId, name) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, create team locally
        // Check for duplicate team name
        if (get().userTeams.some(t => t.name === name)) {
          throw new Error('A team with this name already exists');
        }
        const teamId = `demo-team-${demoTeamIdCounter++}`;
        // Get current race number from admin store for late joiner tracking
        const completedRaces = Object.values(useAdminStore.getState().raceResults).filter(r => r.isComplete).length;
        const team: FantasyTeam = {
          id: teamId,
          userId,
          leagueId: leagueId || null, // Support solo teams with null leagueId
          name,
          drivers: [],
          constructor: null,
          budget: BUDGET,
          totalSpent: 0,
          totalPoints: 0,
          isLocked: false,
          lockStatus: defaultLockStatus,
          createdAt: new Date(),
          updatedAt: new Date(),
          // V3: Initialize transfer tracking
          racesSinceTransfer: 0,
          // V4: Late joiner support
          racesPlayed: 0,
          pointsHistory: [],
          joinedAtRace: completedRaces, // Track which race they joined at
          raceWins: 0,
        };
        // Add to userTeams array and set as current (filter out any duplicates first)
        const { userTeams } = get();
        const filteredTeams = userTeams.filter(t => t.id !== team.id);
        set({
          currentTeam: team,
          userTeams: [...filteredTeams, team],
          isLoading: false,
          hasHydrated: true, // Data is now in store
        });
        return team;
      }

      const team = await teamService.createTeam(userId, leagueId, name);
      // Add to userTeams array and set as current (filter out any duplicates first)
      const { userTeams } = get();
      const filteredTeams = userTeams.filter(t => t.id !== team.id);
      set({
        currentTeam: team,
        userTeams: [...filteredTeams, team],
        isLoading: false,
        hasHydrated: true, // Data is now in store
      });
      return team;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create team';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  assignTeamToLeague: async (teamId, leagueId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      const { userTeams, currentTeam } = get();

      if (isDemoMode) {
        // In demo mode, update team locally
        const updatedTeams = userTeams.map(team =>
          team.id === teamId ? { ...team, leagueId, updatedAt: new Date() } : team
        );
        const updatedCurrentTeam = currentTeam?.id === teamId
          ? { ...currentTeam, leagueId, updatedAt: new Date() }
          : currentTeam;

        set({
          userTeams: updatedTeams,
          currentTeam: updatedCurrentTeam,
          isLoading: false
        });
        return;
      }

      // In real mode, call the service
      await teamService.updateTeam(teamId, { leagueId });

      // Update local state
      const updatedTeams = userTeams.map(team =>
        team.id === teamId ? { ...team, leagueId, updatedAt: new Date() } : team
      );
      const updatedCurrentTeam = currentTeam?.id === teamId
        ? { ...currentTeam, leagueId, updatedAt: new Date() }
        : currentTeam;

      set({
        userTeams: updatedTeams,
        currentTeam: updatedCurrentTeam,
        isLoading: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to assign team to league';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  addDriver: async (driverId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { currentTeam, selectedDrivers } = get();

    console.log('addDriver called:', { driverId, isDemoMode, hasCurrentTeam: !!currentTeam, currentDriverCount: currentTeam?.drivers?.length });

    if (!currentTeam) {
      console.log('addDriver: No team loaded, returning early');
      set({ error: 'No team loaded' });
      return;
    }

    // Check if team already has max drivers
    if (currentTeam.drivers.length >= TEAM_SIZE) {
      set({ error: `Maximum ${TEAM_SIZE} drivers allowed` });
      return;
    }

    // Check if driver is already on the team
    if (currentTeam.drivers.some(d => d.driverId === driverId)) {
      set({ error: 'Driver already on team' });
      return;
    }

    // V5: Check if driver is locked out after contract expiry (1 race lockout)
    const { raceResults: lockoutRaceResults } = useAdminStore.getState();
    const lockoutCompletedRaces = Object.values(lockoutRaceResults).filter(r => r.isComplete).length;
    if (isDriverLockedOut(currentTeam.driverLockouts, driverId, lockoutCompletedRaces)) {
      set({ error: 'Driver is locked out for 1 race after contract expiry' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, update team locally
        // First check selectedDrivers (from build screen), then check demoDrivers
        let driver = selectedDrivers.find(d => d.id === driverId);
        console.log('addDriver: Found in selectedDrivers?', !!driver);
        if (!driver) {
          driver = demoDrivers.find(d => d.id === driverId);
          console.log('addDriver: Found in demoDrivers?', !!driver);
        }
        if (!driver) {
          console.log('addDriver: Driver not found!');
          throw new Error('Driver not found');
        }

        // Get current market price from admin store (for dynamic pricing)
        const { driverPrices } = useAdminStore.getState();
        const priceUpdate = driverPrices[driverId];
        const currentMarketPrice = priceUpdate?.currentPrice ?? driver.price;
        console.log('Adding driver:', { driverId, basePrice: driver.price, marketPrice: currentMarketPrice });

        // Check if adding this driver would exceed budget
        if (currentMarketPrice > currentTeam.budget) {
          set({ error: `Cannot afford this driver (need $${currentMarketPrice}, have $${currentTeam.budget})`, isLoading: false });
          return;
        }

        const { raceResults } = useAdminStore.getState();
        const currentCompletedRaces = Object.values(raceResults).filter(r => r.isComplete).length;

        const fantasyDriver: FantasyDriver = {
          driverId: driver.id,
          name: driver.name,
          shortName: driver.shortName,
          constructorId: driver.constructorId,
          purchasePrice: currentMarketPrice,
          currentPrice: currentMarketPrice,
          pointsScored: 0,
          racesHeld: 0,
          contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
          addedAtRace: currentCompletedRaces,
        };

        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          drivers: [...currentTeam.drivers, fantasyDriver],
          totalSpent: currentTeam.totalSpent + currentMarketPrice,
          budget: currentTeam.budget - currentMarketPrice,
          // V3: Reset stale roster counter on transfer
          racesSinceTransfer: 0,
          updatedAt: new Date(),
        };
        console.log('addDriver: Updating team, new driver count:', updatedTeam.drivers.length);
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      // Not in demo mode - use local-first update pattern
      console.log('addDriver: Using local-first update');
      let driver = selectedDrivers.find(d => d.id === driverId);
      if (!driver) {
        driver = demoDrivers.find(d => d.id === driverId);
      }
      if (!driver) {
        throw new Error('Driver not found');
      }

      const { driverPrices } = useAdminStore.getState();
      const priceUpdate = driverPrices[driverId];
      const currentMarketPrice = priceUpdate?.currentPrice ?? driver.price;

      // Check if adding this driver would exceed budget
      if (currentMarketPrice > currentTeam.budget) {
        set({ error: `Cannot afford this driver (need $${currentMarketPrice}, have $${currentTeam.budget})`, isLoading: false });
        return;
      }

      const { raceResults: fbRaceResults } = useAdminStore.getState();
      const fbCompletedRaces = Object.values(fbRaceResults).filter(r => r.isComplete).length;

      const fantasyDriver: FantasyDriver = {
        driverId: driver.id,
        name: driver.name,
        shortName: driver.shortName,
        constructorId: driver.constructorId,
        purchasePrice: currentMarketPrice,
        currentPrice: currentMarketPrice,
        pointsScored: 0,
        racesHeld: 0,
        contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
        addedAtRace: fbCompletedRaces,
      };

      const updatedTeam: FantasyTeam = {
        ...currentTeam,
        drivers: [...currentTeam.drivers, fantasyDriver],
        totalSpent: currentTeam.totalSpent + currentMarketPrice,
        budget: currentTeam.budget - currentMarketPrice,
        racesSinceTransfer: 0,
        updatedAt: new Date(),
      };
      console.log('addDriver: Local update successful, new driver count:', updatedTeam.drivers.length);
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });

      // Sync updated team to Firebase in background
      syncTeamToFirebase(updatedTeam, 'addDriver');
    } catch (error) {
      errorLogService.logError('addDriver', error);
      const message = error instanceof Error ? error.message : 'Failed to add driver';
      set({ error: message, isLoading: false });
    }
  },

  removeDriver: async (driverId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { currentTeam } = get();

    if (!currentTeam) {
      set({ error: 'No team loaded' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, update team locally
        const driverToRemove = currentTeam.drivers.find(d => d.driverId === driverId);
        if (!driverToRemove) {
          throw new Error('Driver not found in team');
        }

        // Get current market price from admin store (for dynamic pricing)
        // Fall back to stored price if no price update exists
        const { driverPrices } = useAdminStore.getState();
        const priceUpdate = driverPrices[driverId];
        const currentMarketPrice = priceUpdate?.currentPrice ?? driverToRemove.currentPrice;

        // V6: Apply early termination fee for breaking contract early
        const contractLen = driverToRemove.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
        const earlyTermFee = calculateEarlyTerminationFee(currentMarketPrice, contractLen, driverToRemove.racesHeld || 0);
        const saleValue = Math.max(0, currentMarketPrice - earlyTermFee);
        console.log('Selling driver:', { driverId, storedPrice: driverToRemove.currentPrice, marketPrice: currentMarketPrice, earlyTermFee, saleValue });

        // V3: Clear ace if removed driver was ace
        const newAceId = currentTeam.aceDriverId === driverId ? undefined : currentTeam.aceDriverId;

        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          drivers: currentTeam.drivers.filter(d => d.driverId !== driverId),
          totalSpent: currentTeam.totalSpent - driverToRemove.purchasePrice,
          budget: currentTeam.budget + saleValue,
          // V3: Update ace and transfer tracking
          aceDriverId: newAceId,
          racesSinceTransfer: 0,
          // V7: Bank departing driver's points
          lockedPoints: (currentTeam.lockedPoints || 0) + (driverToRemove.pointsScored || 0),
          updatedAt: new Date(),
        };
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      // Use local-first update pattern
      const driverToRemove = currentTeam.drivers.find(d => d.driverId === driverId);
      if (!driverToRemove) {
        throw new Error('Driver not found in team');
      }

      const { driverPrices } = useAdminStore.getState();
      const priceUpdate = driverPrices[driverId];
      const currentMarketPrice = priceUpdate?.currentPrice ?? driverToRemove.currentPrice;
      // V6: Apply early termination fee
      const contractLen = driverToRemove.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
      const earlyTermFee = calculateEarlyTerminationFee(currentMarketPrice, contractLen, driverToRemove.racesHeld || 0);
      const saleValue = Math.max(0, currentMarketPrice - earlyTermFee);
      const newAceId = currentTeam.aceDriverId === driverId ? undefined : currentTeam.aceDriverId;

      const updatedTeam: FantasyTeam = {
        ...currentTeam,
        drivers: currentTeam.drivers.filter(d => d.driverId !== driverId),
        totalSpent: currentTeam.totalSpent - driverToRemove.purchasePrice,
        budget: currentTeam.budget + saleValue,
        aceDriverId: newAceId,
        racesSinceTransfer: 0,
        // V7: Bank departing driver's points
        lockedPoints: (currentTeam.lockedPoints || 0) + (driverToRemove.pointsScored || 0),
        updatedAt: new Date(),
      };
      console.log('removeDriver: Local update successful, new driver count:', updatedTeam.drivers.length);
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });

      // Sync updated team to Firebase in background
      syncTeamToFirebase(updatedTeam, 'removeDriver');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove driver';
      set({ error: message, isLoading: false });
    }
  },

  swapDriver: async (oldDriverId, newDriverId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { currentTeam, selectedDrivers } = get();

    if (!currentTeam) {
      set({ error: 'No team loaded' });
      return;
    }

    // V5: Check if new driver is locked out after contract expiry (1 race lockout)
    const { raceResults: swapLockoutRaceResults } = useAdminStore.getState();
    const swapLockoutCompletedRaces = Object.values(swapLockoutRaceResults).filter(r => r.isComplete).length;
    if (isDriverLockedOut(currentTeam.driverLockouts, newDriverId, swapLockoutCompletedRaces)) {
      set({ error: 'Driver is locked out for 1 race after contract expiry' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, swap drivers locally
        const oldDriver = currentTeam.drivers.find(d => d.driverId === oldDriverId);
        let newDriver = selectedDrivers.find(d => d.id === newDriverId);
        if (!newDriver) {
          newDriver = demoDrivers.find(d => d.id === newDriverId);
        }

        if (!oldDriver || !newDriver) {
          throw new Error('Driver not found');
        }

        // Get current market prices from admin store
        const { driverPrices } = useAdminStore.getState();
        const oldDriverPriceUpdate = driverPrices[oldDriverId];
        const newDriverPriceUpdate = driverPrices[newDriverId];
        const oldDriverMarketPrice = oldDriverPriceUpdate?.currentPrice ?? oldDriver.currentPrice;
        const newDriverMarketPrice = newDriverPriceUpdate?.currentPrice ?? newDriver.price;

        const { raceResults: swapRaceResults } = useAdminStore.getState();
        const swapCompletedRaces = Object.values(swapRaceResults).filter(r => r.isComplete).length;

        const fantasyDriver: FantasyDriver = {
          driverId: newDriver.id,
          name: newDriver.name,
          shortName: newDriver.shortName,
          constructorId: newDriver.constructorId,
          purchasePrice: newDriverMarketPrice,
          currentPrice: newDriverMarketPrice,
          pointsScored: 0,
          racesHeld: 0,
          contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
          addedAtRace: swapCompletedRaces,
        };

        // V6: Apply early termination fee for breaking old driver's contract early
        const oldContractLen = oldDriver.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
        const oldEarlyTermFee = calculateEarlyTerminationFee(oldDriverMarketPrice, oldContractLen, oldDriver.racesHeld || 0);
        const saleValue = Math.max(0, oldDriverMarketPrice - oldEarlyTermFee);
        const purchaseCost = newDriverMarketPrice;
        const netCostChange = purchaseCost - saleValue;

        // Check if swap would exceed budget
        if (netCostChange > currentTeam.budget) {
          set({ error: `Cannot afford this swap (need $${netCostChange} more, have $${currentTeam.budget})`, isLoading: false });
          return;
        }

        // V3: If swapped driver was ace, clear ace
        const newAceId = currentTeam.aceDriverId === oldDriverId ? undefined : currentTeam.aceDriverId;

        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          drivers: currentTeam.drivers.map(d =>
            d.driverId === oldDriverId ? fantasyDriver : d
          ),
          totalSpent: currentTeam.totalSpent - oldDriver.purchasePrice + purchaseCost,
          budget: currentTeam.budget - netCostChange,
          // V3: Reset stale roster counter and update ace
          racesSinceTransfer: 0,
          aceDriverId: newAceId,
          // V7: Bank departing driver's points
          lockedPoints: (currentTeam.lockedPoints || 0) + (oldDriver.pointsScored || 0),
          updatedAt: new Date(),
        };
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      // Use local-first update pattern
      const oldDriver = currentTeam.drivers.find(d => d.driverId === oldDriverId);
      let newDriver = selectedDrivers.find(d => d.id === newDriverId);
      if (!newDriver) {
        newDriver = demoDrivers.find(d => d.id === newDriverId);
      }

      if (!oldDriver || !newDriver) {
        throw new Error('Driver not found');
      }

      const { driverPrices } = useAdminStore.getState();
      const oldDriverPriceUpdate = driverPrices[oldDriverId];
      const newDriverPriceUpdate = driverPrices[newDriverId];
      const oldDriverMarketPrice = oldDriverPriceUpdate?.currentPrice ?? oldDriver.currentPrice;
      const newDriverMarketPrice = newDriverPriceUpdate?.currentPrice ?? newDriver.price;

      const { raceResults: fbSwapRaceResults } = useAdminStore.getState();
      const fbSwapCompletedRaces = Object.values(fbSwapRaceResults).filter(r => r.isComplete).length;

      const fantasyDriver: FantasyDriver = {
        driverId: newDriver.id,
        name: newDriver.name,
        shortName: newDriver.shortName,
        constructorId: newDriver.constructorId,
        purchasePrice: newDriverMarketPrice,
        currentPrice: newDriverMarketPrice,
        pointsScored: 0,
        racesHeld: 0,
        contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
        addedAtRace: fbSwapCompletedRaces,
      };

      // V6: Apply early termination fee for breaking old driver's contract early
      const oldContractLen = oldDriver.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
      const oldEarlyTermFee = calculateEarlyTerminationFee(oldDriverMarketPrice, oldContractLen, oldDriver.racesHeld || 0);
      const saleValue = Math.max(0, oldDriverMarketPrice - oldEarlyTermFee);
      const purchaseCost = newDriverMarketPrice;
      const netCostChange = purchaseCost - saleValue;

      // Check if swap would exceed budget
      if (netCostChange > currentTeam.budget) {
        set({ error: `Cannot afford this swap (need $${netCostChange} more, have $${currentTeam.budget})`, isLoading: false });
        return;
      }

      const newAceId = currentTeam.aceDriverId === oldDriverId ? undefined : currentTeam.aceDriverId;

      const updatedTeam: FantasyTeam = {
        ...currentTeam,
        drivers: currentTeam.drivers.map(d =>
          d.driverId === oldDriverId ? fantasyDriver : d
        ),
        totalSpent: currentTeam.totalSpent - oldDriver.purchasePrice + purchaseCost,
        budget: currentTeam.budget - netCostChange,
        racesSinceTransfer: 0,
        aceDriverId: newAceId,
        // V7: Bank departing driver's points
        lockedPoints: (currentTeam.lockedPoints || 0) + (oldDriver.pointsScored || 0),
        updatedAt: new Date(),
      };
      console.log('swapDriver: Local update successful');
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });

      // Sync updated team to Firebase in background
      syncTeamToFirebase(updatedTeam, 'swapDriver');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to swap driver';
      set({ error: message, isLoading: false });
    }
  },

  setConstructor: async (constructorId, contractLength) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { currentTeam, selectedConstructor } = get();

    if (!currentTeam) {
      set({ error: 'No team loaded' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, set constructor locally
        // First check selectedConstructor, then check demoConstructors
        let constructor = selectedConstructor?.id === constructorId ? selectedConstructor : null;
        if (!constructor) {
          constructor = demoConstructors.find(c => c.id === constructorId) || null;
        }
        if (!constructor) {
          throw new Error('Constructor not found');
        }

        const oldConstructorPrice = currentTeam.constructor?.purchasePrice || 0;
        const priceDiff = constructor.price - oldConstructorPrice;

        // Check if setting this constructor would exceed budget
        if (priceDiff > currentTeam.budget) {
          set({ error: `Cannot afford this constructor (need $${priceDiff} more, have $${currentTeam.budget})`, isLoading: false });
          return;
        }

        const { raceResults } = useAdminStore.getState();
        const currentCompletedRaces = Object.values(raceResults).filter(r => r.isComplete).length;

        // V8: Bank departing constructor's points before replacement
        const bankedPoints = currentTeam.constructor ? (currentTeam.constructor.pointsScored || 0) : 0;

        const fantasyConstructor: FantasyConstructor = {
          constructorId: constructor.id,
          name: constructor.name,
          purchasePrice: constructor.price,
          currentPrice: constructor.price,
          pointsScored: 0,
          racesHeld: 0,
          contractLength: contractLength ?? PRICING_CONFIG.CONTRACT_LENGTH,
          addedAtRace: currentCompletedRaces,
        };

        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          constructor: fantasyConstructor,
          totalSpent: currentTeam.totalSpent + priceDiff,
          budget: currentTeam.budget - priceDiff,
          lockedPoints: (currentTeam.lockedPoints || 0) + bankedPoints,
          updatedAt: new Date(),
        };
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      // Use local-first update pattern
      let constructor = selectedConstructor?.id === constructorId ? selectedConstructor : null;
      if (!constructor) {
        constructor = demoConstructors.find(c => c.id === constructorId) || null;
      }
      if (!constructor) {
        throw new Error('Constructor not found');
      }

      const oldConstructorPrice = currentTeam.constructor?.purchasePrice || 0;
      const priceDiff = constructor.price - oldConstructorPrice;

      // Check if setting this constructor would exceed budget
      if (priceDiff > currentTeam.budget) {
        set({ error: `Cannot afford this constructor (need $${priceDiff} more, have $${currentTeam.budget})`, isLoading: false });
        return;
      }

      const { raceResults: fbRaceResults } = useAdminStore.getState();
      const fbCompletedRaces = Object.values(fbRaceResults).filter(r => r.isComplete).length;

      // V8: Bank departing constructor's points before replacement
      const bankedPoints = currentTeam.constructor ? (currentTeam.constructor.pointsScored || 0) : 0;

      const fantasyConstructor: FantasyConstructor = {
        constructorId: constructor.id,
        name: constructor.name,
        purchasePrice: constructor.price,
        currentPrice: constructor.price,
        pointsScored: 0,
        racesHeld: 0,
        contractLength: contractLength ?? PRICING_CONFIG.CONTRACT_LENGTH,
        addedAtRace: fbCompletedRaces,
      };

      const updatedTeam: FantasyTeam = {
        ...currentTeam,
        constructor: fantasyConstructor,
        totalSpent: currentTeam.totalSpent + priceDiff,
        budget: currentTeam.budget - priceDiff,
        lockedPoints: (currentTeam.lockedPoints || 0) + bankedPoints,
        updatedAt: new Date(),
      };
      console.log('setConstructor: Local update successful');
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });

      // Sync updated team to Firebase in background
      syncTeamToFirebase(updatedTeam, 'setConstructor');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set constructor';
      set({ error: message, isLoading: false });
    }
  },

  removeConstructor: async () => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { currentTeam } = get();

    if (!currentTeam) {
      set({ error: 'No team loaded' });
      return;
    }

    if (!currentTeam.constructor) {
      set({ error: 'No constructor to remove' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      // Get live market price from admin store
      const { constructorPrices } = useAdminStore.getState();
      const cPriceUpdate = constructorPrices[currentTeam.constructor!.constructorId];
      const currentMarketPrice = cPriceUpdate?.currentPrice ?? currentTeam.constructor!.currentPrice;

      if (isDemoMode) {
        // V8: Apply early termination fee based on current market price
        const contractLen = currentTeam.constructor.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
        const earlyTermFee = calculateEarlyTerminationFee(currentMarketPrice, contractLen, currentTeam.constructor.racesHeld || 0);
        const saleValue = Math.max(0, currentMarketPrice - earlyTermFee);
        console.log('Selling constructor:', { constructorId: currentTeam.constructor.constructorId, marketPrice: currentMarketPrice, earlyTermFee, saleValue });

        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          constructor: null,
          aceConstructorId: undefined, // Clear ace if removed constructor was ace
          totalSpent: currentTeam.totalSpent - currentTeam.constructor.purchasePrice,
          budget: currentTeam.budget + saleValue,
          // V8: Bank departing constructor's points
          lockedPoints: (currentTeam.lockedPoints || 0) + (currentTeam.constructor.pointsScored || 0),
          updatedAt: new Date(),
        };
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      // Use local-first update pattern
      // V8: Apply early termination fee based on current market price
      const contractLen = currentTeam.constructor!.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
      const earlyTermFee = calculateEarlyTerminationFee(currentMarketPrice, contractLen, currentTeam.constructor!.racesHeld || 0);
      const saleValue = Math.max(0, currentMarketPrice - earlyTermFee);

      const updatedTeam: FantasyTeam = {
        ...currentTeam,
        constructor: null,
        aceConstructorId: undefined, // Clear ace if removed constructor was ace
        totalSpent: currentTeam.totalSpent - currentTeam.constructor!.purchasePrice,
        budget: currentTeam.budget + saleValue,
        // V8: Bank departing constructor's points
        lockedPoints: (currentTeam.lockedPoints || 0) + (currentTeam.constructor!.pointsScored || 0),
        updatedAt: new Date(),
      };
      console.log('removeConstructor: Local update successful');
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });

      // Sync updated team to Firebase in background
      syncTeamToFirebase(updatedTeam, 'removeConstructor');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove constructor';
      set({ error: message, isLoading: false });
    }
  },

  // V3: Set ace driver (any driver on the team with price <= ACE_MAX_PRICE, gets 2x points)
  setAce: async (driverId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { currentTeam } = get();

    if (!currentTeam) {
      set({ error: 'No team loaded' });
      return;
    }

    // Validate driver is on the team
    const driver = currentTeam.drivers.find(d => d.driverId === driverId);
    if (!driver) {
      set({ error: 'Driver not in team' });
      return;
    }

    // V3 Rule: Drivers with price over ACE_MAX_PRICE cannot be ace
    if (driver.currentPrice > PRICING_CONFIG.ACE_MAX_PRICE) {
      set({ error: `Drivers over $${PRICING_CONFIG.ACE_MAX_PRICE} cannot be your Ace` });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      // Always update locally first to preserve current team state
      const updatedTeam: FantasyTeam = {
        ...currentTeam,
        aceDriverId: driverId,
        aceConstructorId: undefined, // Mutual exclusion: clear constructor ace
        updatedAt: new Date(),
      };
      console.log('setAce: Setting ace locally to:', driverId, 'Driver count:', updatedTeam.drivers.length);
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });

      // Sync updated team to Firebase in background
      syncTeamToFirebase(updatedTeam, 'setAce');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set Ace';
      set({ error: message, isLoading: false });
    }
  },

  // V9: Set ace constructor (constructor on the team with price <= ACE_MAX_PRICE, gets 2x points)
  setAceConstructor: async (constructorId) => {
    const { currentTeam } = get();

    if (!currentTeam) {
      set({ error: 'No team loaded' });
      return;
    }

    // Validate constructor is on the team
    if (!currentTeam.constructor || currentTeam.constructor.constructorId !== constructorId) {
      set({ error: 'Constructor not in team' });
      return;
    }

    // Price check
    if (currentTeam.constructor.currentPrice > PRICING_CONFIG.ACE_MAX_PRICE) {
      set({ error: `Constructors over $${PRICING_CONFIG.ACE_MAX_PRICE} cannot be your Ace` });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const updatedTeam: FantasyTeam = {
        ...currentTeam,
        aceConstructorId: constructorId,
        aceDriverId: undefined, // Mutual exclusion: clear driver ace
        updatedAt: new Date(),
      };
      console.log('setAceConstructor: Setting ace constructor to:', constructorId);
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });

      // Sync updated team to Firebase in background
      syncTeamToFirebase(updatedTeam, 'setAceConstructor');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set Ace Constructor';
      set({ error: message, isLoading: false });
    }
  },

  // V3: Clear ace selection
  clearAce: async () => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { currentTeam } = get();

    if (!currentTeam) {
      set({ error: 'No team loaded' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, clear ace locally
        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          aceDriverId: undefined,
          aceConstructorId: undefined,
          updatedAt: new Date(),
        };
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      // Use local-first update pattern
      const updatedTeam: FantasyTeam = {
        ...currentTeam,
        aceDriverId: undefined,
        aceConstructorId: undefined,
        updatedAt: new Date(),
      };
      console.log('clearAce: Local update successful');
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });

      // Sync updated team to Firebase in background
      syncTeamToFirebase(updatedTeam, 'clearAce');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to clear Ace';
      set({ error: message, isLoading: false });
    }
  },

  confirmSelection: async () => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { currentTeam, selectedDrivers, selectedConstructor, selectionState } = get();

    if (!currentTeam) {
      set({ error: 'No team loaded' });
      return;
    }

    if (!selectionState.isValid) {
      set({ error: selectionState.validationErrors.join(', ') });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // V3: Build team without star driver - user will select ace each race
        const fantasyDrivers: FantasyDriver[] = selectedDrivers.map((driver) => ({
          driverId: driver.id,
          name: driver.name,
          shortName: driver.shortName,
          constructorId: driver.constructorId,
          purchasePrice: driver.price,
          currentPrice: driver.price,
          pointsScored: 0,
          racesHeld: 0,
          contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
        }));

        const fantasyConstructor: FantasyConstructor | null = selectedConstructor ? {
          constructorId: selectedConstructor.id,
          name: selectedConstructor.name,
          purchasePrice: selectedConstructor.price,
          currentPrice: selectedConstructor.price,
          pointsScored: 0,
          racesHeld: 0,
          contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
          addedAtRace: Object.values(useAdminStore.getState().raceResults).filter(r => r.isComplete).length,
        } : null;

        const totalSpent = selectionState.totalCost;
        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          drivers: fantasyDrivers,
          constructor: fantasyConstructor,
          totalSpent,
          budget: BUDGET - totalSpent,
          // V3: Initialize transfer tracking
          racesSinceTransfer: 0,
          updatedAt: new Date(),
        };

        updateTeamAndSync(get, set, updatedTeam, {
          selectedDrivers: [],
          selectedConstructor: null,
          selectionState: initialSelectionState,
          isLoading: false,
        });
        return;
      }

      // Use local-first pattern - same as demo mode
      const fantasyDrivers: FantasyDriver[] = selectedDrivers.map((driver) => ({
        driverId: driver.id,
        name: driver.name,
        shortName: driver.shortName,
        constructorId: driver.constructorId,
        purchasePrice: driver.price,
        currentPrice: driver.price,
        pointsScored: 0,
        racesHeld: 0,
        contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
      }));

      const fantasyConstructor: FantasyConstructor | null = selectedConstructor ? {
        constructorId: selectedConstructor.id,
        name: selectedConstructor.name,
        purchasePrice: selectedConstructor.price,
        currentPrice: selectedConstructor.price,
        pointsScored: 0,
        racesHeld: 0,
        contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
        addedAtRace: Object.values(useAdminStore.getState().raceResults).filter(r => r.isComplete).length,
      } : null;

      const totalSpent = selectionState.totalCost;
      const updatedTeam: FantasyTeam = {
        ...currentTeam,
        drivers: fantasyDrivers,
        constructor: fantasyConstructor,
        totalSpent,
        budget: BUDGET - totalSpent,
        racesSinceTransfer: 0,
        updatedAt: new Date(),
      };

      updateTeamAndSync(get, set, updatedTeam, {
        selectedDrivers: [],
        selectedConstructor: null,
        selectionState: initialSelectionState,
        isLoading: false,
      });

      // Sync to Firebase in background
      syncTeamToFirebase(updatedTeam, 'confirmSelection');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to build team';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  updateTeamName: async (name) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { currentTeam } = get();

    if (!currentTeam) {
      set({ error: 'No team loaded' });
      return;
    }

    if (!name.trim()) {
      set({ error: 'Team name cannot be empty' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, update team name locally
        // Check for duplicate team name (exclude current team)
        const { userTeams } = get();
        if (userTeams.some(t => t.name === name.trim() && t.id !== currentTeam.id)) {
          throw new Error('A team with this name already exists');
        }
        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          name: name.trim(),
          updatedAt: new Date(),
        };
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      const updatedTeam = await teamService.updateTeamName(currentTeam.id, name.trim());
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update team name';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  deleteTeam: async () => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { currentTeam, userTeams } = get();

    if (!currentTeam) {
      set({ error: 'No team loaded' });
      return;
    }

    // Preserve league scores before deletion
    if (currentTeam.leagueId) {
      try {
        const { useLeagueStore } = require('./league.store');
        const user = useAuthStore.getState().user;
        useLeagueStore.getState().addRetiredMember({
          id: currentTeam.id,
          leagueId: currentTeam.leagueId,
          userId: currentTeam.userId,
          displayName: user?.displayName || 'Former Member',
          teamName: currentTeam.name,
          teamAvatarUrl: currentTeam.avatarUrl,
          role: 'member' as const,
          totalPoints: currentTeam.totalPoints || 0,
          rank: 0,
          joinedAt: currentTeam.createdAt,
          racesPlayed: currentTeam.racesPlayed || 0,
          pprAverage: currentTeam.racesPlayed && currentTeam.racesPlayed > 0
            ? Math.round((currentTeam.totalPoints / currentTeam.racesPlayed) * 10) / 10
            : 0,
          recentFormPoints: (currentTeam.pointsHistory || []).slice(-5).reduce((a: number, b: number) => a + b, 0),
          raceWins: currentTeam.raceWins || 0,
          isWithdrawn: true,
        });
      } catch {
        // Non-critical: proceed with deletion even if score preservation fails
      }
    }

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, remove from userTeams and clear currentTeam
        const updatedUserTeams = userTeams.filter(t => t.id !== currentTeam.id);
        // Select another team if available
        const nextTeam = updatedUserTeams.length > 0 ? updatedUserTeams[0] : null;
        set({ currentTeam: nextTeam, userTeams: updatedUserTeams, isLoading: false });
        return;
      }

      await teamService.deleteTeam(currentTeam.id);
      const updatedUserTeams = userTeams.filter(t => t.id !== currentTeam.id);
      const nextTeam = updatedUserTeams.length > 0 ? updatedUserTeams[0] : null;
      set({ currentTeam: nextTeam, userTeams: updatedUserTeams, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete team';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // Recalculate points for the current team based on race results
  recalculateTeamPoints: () => {
    const { currentTeam, userTeams } = get();
    if (!currentTeam) return;

    const { driverPrices, constructorPrices } = useAdminStore.getState();
    const { totalPoints, driverPoints, constructorPoints } = calculateTeamPointsFromRaces(currentTeam);

    // Update driver points scored and sync current prices
    const updatedDrivers = currentTeam.drivers.map(driver => {
      const priceUpdate = driverPrices[driver.driverId];
      return {
        ...driver,
        pointsScored: driverPoints[driver.driverId] || 0,
        currentPrice: priceUpdate?.currentPrice ?? driver.currentPrice,
      };
    });

    // Update constructor points scored and sync current price
    const updatedConstructor = currentTeam.constructor ? {
      ...currentTeam.constructor,
      pointsScored: constructorPoints,
      currentPrice: constructorPrices[currentTeam.constructor.constructorId]?.currentPrice ?? currentTeam.constructor.currentPrice,
    } : null;

    const updatedTeam: FantasyTeam = {
      ...currentTeam,
      drivers: updatedDrivers,
      constructor: updatedConstructor,
      totalPoints,
      updatedAt: new Date(),
    };

    // Update in userTeams as well
    const updatedUserTeams = userTeams.map(t =>
      t.id === updatedTeam.id ? updatedTeam : t
    );

    set({ currentTeam: updatedTeam, userTeams: updatedUserTeams });
  },

  // Recalculate points for all teams
  recalculateAllTeamsPoints: () => {
    const { userTeams, currentTeam } = get();
    const { driverPrices, constructorPrices, raceResults } = useAdminStore.getState();

    // Count total completed races
    const completedRaceCount = Object.values(raceResults).filter(r => r.isComplete).length;

    const perRaceCache = new Map<string, { round: number; points: number }[]>();

    const updatedUserTeams = userTeams.map(team => {
      const { totalPoints, driverPoints, constructorPoints, perRacePoints } = calculateTeamPointsFromRaces(team);

      // Cache per-race points so we don't recompute for league race-wins
      perRaceCache.set(team.id, perRacePoints);

      // Update driver points, sync current prices, and update racesHeld
      let updatedDrivers = team.drivers.map(driver => {
        const priceUpdate = driverPrices[driver.driverId];
        // racesHeld = completed races since this driver was added
        // Use driver's addedAtRace if available, otherwise fall back to team's joinedAtRace
        const driverAddedAt = driver.addedAtRace ?? (team.joinedAtRace || 0);
        const driverRacesHeld = Math.max(0, completedRaceCount - driverAddedAt);
        return {
          ...driver,
          pointsScored: driverPoints[driver.driverId] || 0,
          currentPrice: priceUpdate?.currentPrice ?? driver.currentPrice,
          racesHeld: driverRacesHeld,
        };
      });

      // V5: Contract expiry - remove drivers whose racesHeld >= contractLength
      let budgetReturn = 0;
      let aceId = team.aceDriverId;
      const expiredDriverIds: string[] = [];
      // Copy existing lockouts (will add new ones for expired drivers)
      const updatedLockouts: Record<string, number> = { ...(team.driverLockouts || {}) };
      // V7: Bank departing driver points
      let lockedPoints = team.lockedPoints || 0;

      updatedDrivers = updatedDrivers.filter(driver => {
        const contractLen = driver.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
        if (driver.racesHeld >= contractLen) {
          // Contract expired - sell at current market value (minus commission)
          budgetReturn += calculateSaleValue(driver.currentPrice);
          expiredDriverIds.push(driver.driverId);
          // V7: Bank departing driver's points before removal
          lockedPoints += driverPoints[driver.driverId] || 0;
          // V5: Add lockout for this driver (locked until completedRaceCount + LOCKOUT_RACES)
          updatedLockouts[driver.driverId] = completedRaceCount + PRICING_CONFIG.CONTRACT_LOCKOUT_RACES;
          // Clear ace if expired driver was ace
          if (aceId === driver.driverId) {
            aceId = undefined;
          }
          return false; // Remove from team
        }
        return true;
      });

      // V5: Prune expired lockouts (no longer needed once completedRaceCount >= expiresAt)
      Object.entries(updatedLockouts).forEach(([dId, expiresAt]) => {
        if (completedRaceCount >= expiresAt) {
          delete updatedLockouts[dId];
        }
      });

      // V5: Auto-fill empty slots with cheapest available drivers
      let autoFillBudget = team.budget + budgetReturn;
      const teamDriverIds = new Set(updatedDrivers.map(d => d.driverId));

      // Only auto-fill teams that previously had drivers (skip brand-new empty teams being built)
      const hadDriversBefore = team.drivers.length > 0 || (team.lockedPoints || 0) > 0 || team.totalSpent > 0;
      // Only auto-fill after all lockouts have cleared AND exclude drivers that just expired this pass
      const expiredSet = new Set(expiredDriverIds);
      if (updatedDrivers.length < TEAM_SIZE && Object.keys(updatedLockouts).length === 0 && hadDriversBefore) {
        // Find cheapest available drivers not on the team, not locked out, and not just expired
        const availableForAutoFill = demoDrivers
          .filter(d => d.isActive && !teamDriverIds.has(d.id) && !expiredSet.has(d.id) && !isDriverLockedOut(updatedLockouts, d.id, completedRaceCount))
          .map(d => {
            const priceUpdate = driverPrices[d.id];
            return { ...d, marketPrice: priceUpdate?.currentPrice ?? d.price };
          })
          .sort((a, b) => a.marketPrice - b.marketPrice);

        for (const candidate of availableForAutoFill) {
          if (updatedDrivers.length >= TEAM_SIZE) break;
          if (candidate.marketPrice > autoFillBudget) break;

          const reserveDriver: FantasyDriver = {
            driverId: candidate.id,
            name: candidate.name,
            shortName: candidate.shortName,
            constructorId: candidate.constructorId,
            purchasePrice: candidate.marketPrice,
            currentPrice: candidate.marketPrice,
            pointsScored: 0,
            racesHeld: 0,
            contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
            isReservePick: true,
            addedAtRace: completedRaceCount,
          };
          updatedDrivers.push(reserveDriver);
          teamDriverIds.add(candidate.id);
          autoFillBudget -= candidate.marketPrice;
        }
      }

      // Recalculate budget: original budget + sale returns - auto-fill cost
      const autoFillCost = team.budget + budgetReturn - autoFillBudget;
      const newBudget = team.budget + budgetReturn - autoFillCost;

      // Update constructor points, sync current price, and update racesHeld
      // V8: Use constructor's own addedAtRace for accurate racesHeld calculation
      let updatedConstructor = team.constructor ? (() => {
        const cAddedAt = team.constructor!.addedAtRace ?? (team.joinedAtRace || 0);
        const cRacesHeld = Math.max(0, completedRaceCount - cAddedAt);
        return {
          ...team.constructor!,
          pointsScored: constructorPoints,
          currentPrice: constructorPrices[team.constructor!.constructorId]?.currentPrice ?? team.constructor!.currentPrice,
          racesHeld: cRacesHeld,
        };
      })() : null;

      // V8: Constructor contract expiry - auto-sell if racesHeld >= contractLength
      let aceConstructorId = team.aceConstructorId;
      if (updatedConstructor) {
        const cContractLen = updatedConstructor.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
        if (updatedConstructor.racesHeld >= cContractLen) {
          // Contract expired - sell at current market value and bank points
          budgetReturn += calculateSaleValue(updatedConstructor.currentPrice);
          lockedPoints += constructorPoints;
          // Clear ace if expired constructor was ace
          if (aceConstructorId === updatedConstructor.constructorId) {
            aceConstructorId = undefined;
          }
          updatedConstructor = null;
        }
      }

      return {
        ...team,
        drivers: updatedDrivers,
        constructor: updatedConstructor,
        totalPoints,
        budget: newBudget,
        aceDriverId: aceId,
        aceConstructorId,
        driverLockouts: Object.keys(updatedLockouts).length > 0 ? updatedLockouts : undefined,
        lockedPoints: lockedPoints > 0 ? lockedPoints : undefined,
        racesPlayed: perRacePoints.length,
        pointsHistory: perRacePoints.map(r => r.points),
        updatedAt: new Date(),
      };
    });

    // Calculate raceWins per league: for each race, the team with the highest
    // points in its league wins that race
    const leagueTeams: Record<string, typeof updatedUserTeams> = {};
    updatedUserTeams.forEach(team => {
      team.raceWins = 0;
      const lid = team.leagueId || 'solo';
      if (!leagueTeams[lid]) leagueTeams[lid] = [];
      leagueTeams[lid].push(team);
    });

    Object.values(leagueTeams).forEach(teams => {
      if (teams.length <= 1) return;

      // Build per-team per-race data
      const teamRaceData = teams.map(team => {
        const prp = perRaceCache.get(team.id) || [];
        const map = new Map<number, number>();
        prp.forEach(r => map.set(r.round, r.points));
        return { team, perRace: map };
      });

      // Get all rounds across all teams
      const allRounds = new Set<number>();
      teamRaceData.forEach(td => td.perRace.forEach((_, round) => allRounds.add(round)));

      allRounds.forEach(round => {
        let bestPoints = -1;
        let winnerIdx = -1;
        teamRaceData.forEach((td, idx) => {
          const pts = td.perRace.get(round) || 0;
          if (pts > bestPoints) {
            bestPoints = pts;
            winnerIdx = idx;
          }
        });
        if (winnerIdx >= 0 && bestPoints > 0) {
          teamRaceData[winnerIdx].team.raceWins += 1;
        }
      });
    });

    // Update currentTeam if it exists
    const updatedCurrentTeam = currentTeam
      ? updatedUserTeams.find(t => t.id === currentTeam.id) || null
      : null;

    set({ userTeams: updatedUserTeams, currentTeam: updatedCurrentTeam });
  },

  // Get breakdown of points for current team
  getTeamPointsBreakdown: () => {
    const { currentTeam } = get();
    if (!currentTeam) return null;
    return calculateTeamPointsFromRaces(currentTeam);
  },
    }),
    {
      name: 'team-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentTeam: state.currentTeam,
        userTeams: state.userTeams,
      }),
      // Convert Date objects when deserializing
      onRehydrateStorage: () => (state, error) => {
        if (state) {
          // Safe date converter - falls back to current time if invalid
          const toValidDate = (val: unknown): Date => {
            if (val instanceof Date && !isNaN(val.getTime())) return val;
            if (typeof val === 'string' || typeof val === 'number') {
              const d = new Date(val);
              if (!isNaN(d.getTime())) return d;
            }
            return new Date();
          };

          // Convert date strings back to Date objects
          if (state.currentTeam) {
            state.currentTeam.createdAt = toValidDate(state.currentTeam.createdAt);
            state.currentTeam.updatedAt = toValidDate(state.currentTeam.updatedAt);
          }
          state.userTeams = state.userTeams.map(team => ({
            ...team,
            createdAt: toValidDate(team.createdAt),
            updatedAt: toValidDate(team.updatedAt),
          }));

          // Deduplicate teams by ID (keep the latest by updatedAt)
          const uniqueTeams = state.userTeams.reduce((acc, team) => {
            const existing = acc.find(t => t.id === team.id);
            if (!existing) {
              acc.push(team);
            } else if (team.updatedAt > existing.updatedAt) {
              const index = acc.indexOf(existing);
              acc[index] = team;
            }
            return acc;
          }, [] as FantasyTeam[]);
          state.userTeams = uniqueTeams;
          state.hasHydrated = true;
        }
        // Always mark as hydrated after rehydration attempt (even if no data)
        setTimeout(() => {
          useTeamStore.setState({ hasHydrated: true });
        }, 0);
        // Start periodic sync after a delay to ensure app is fully loaded
        setTimeout(() => {
          try {
            useTeamStore.getState().startPeriodicSync();
          } catch (e) {
            console.log('Failed to start periodic sync:', e);
          }
        }, 2000);
        // Prune orphan league references (clear leagueId) for teams whose leagues no longer exist
        // Runs after a delay so the league store has time to hydrate
        // Only clears the leagueId — never deletes the team itself
        setTimeout(() => {
          try {
            // Lazy import to avoid circular dependency (league.store imports team.store)
            const { useLeagueStore } = require('./league.store');
            const { leagues } = useLeagueStore.getState();
            // Skip pruning if leagues haven't loaded yet (empty array could mean still loading)
            if (leagues.length === 0) return;
            const leagueIds = new Set(leagues.map(l => l.id));
            const { userTeams, currentTeam } = useTeamStore.getState();
            let changed = false;
            const cleaned = userTeams.map(t => {
              if (t.leagueId && !leagueIds.has(t.leagueId)) {
                changed = true;
                console.log(`Cleared orphan leagueId on team "${t.name}"`);
                return { ...t, leagueId: null, updatedAt: new Date() };
              }
              return t;
            });
            if (changed) {
              const updatedCurrent = currentTeam && currentTeam.leagueId && !leagueIds.has(currentTeam.leagueId)
                ? { ...currentTeam, leagueId: null, updatedAt: new Date() }
                : currentTeam;
              useTeamStore.setState({ userTeams: cleaned, currentTeam: updatedCurrent });
            }
          } catch (e) {
            console.log('Failed to prune orphan league refs:', e);
          }
        }, 3000);
      },
    }
  )
);
