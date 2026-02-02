import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FantasyTeam, FantasyDriver, FantasyConstructor, Driver, Constructor, TeamSelectionState, LockStatus } from '../types';
import { teamService } from '../services/team.service';
import { useAuthStore } from './auth.store';
import { BUDGET, TEAM_SIZE, SALE_COMMISSION_RATE, STAR_DRIVER_BONUS } from '../config/constants';
import { useAdminStore } from './admin.store';

// Calculate sale value after commission
const calculateSaleValue = (currentPrice: number): number => {
  return Math.floor(currentPrice * (1 - SALE_COMMISSION_RATE));
};
import { demoDrivers, demoConstructors } from '../data/demoData';

// Calculate fantasy points for a team based on race results
const calculateTeamPointsFromRaces = (team: FantasyTeam): {
  totalPoints: number;
  driverPoints: Record<string, number>;
  constructorPoints: number;
} => {
  const { raceResults } = useAdminStore.getState();
  let totalPoints = 0;
  const driverPoints: Record<string, number> = {};
  let constructorPoints = 0;

  // Calculate points for each driver
  team.drivers.forEach(driver => {
    let driverTotal = 0;
    Object.values(raceResults).forEach(result => {
      if (result.isComplete) {
        const driverResult = result.driverResults.find(dr => dr.driverId === driver.driverId);
        if (driverResult) {
          let points = driverResult.points;
          // Apply star driver bonus (20%)
          if (driver.isStarDriver) {
            points = Math.floor(points * (1 + STAR_DRIVER_BONUS));
          }
          driverTotal += points;
        }
      }
    });
    driverPoints[driver.driverId] = driverTotal;
    totalPoints += driverTotal;
  });

  // Calculate points for constructor
  if (team.constructor) {
    Object.values(raceResults).forEach(result => {
      if (result.isComplete) {
        const constructorResult = result.constructorResults.find(
          cr => cr.constructorId === team.constructor!.constructorId
        );
        if (constructorResult) {
          let points = constructorResult.points;
          // Apply star constructor bonus (20%)
          if (team.constructor!.isStarDriver) {
            points = Math.floor(points * (1 + STAR_DRIVER_BONUS));
          }
          constructorPoints += points;
        }
      }
    });
    totalPoints += constructorPoints;
  }

  return { totalPoints, driverPoints, constructorPoints };
};

// Demo team counter
let demoTeamIdCounter = 1;

interface TeamState {
  currentTeam: FantasyTeam | null;
  userTeams: FantasyTeam[]; // All teams for the user
  isLoading: boolean;
  error: string | null;
  hasHydrated: boolean; // Track if persist has rehydrated

  // Selection state for building team
  selectedDrivers: Driver[];
  selectedConstructor: Constructor | null;
  selectionState: TeamSelectionState;

  // Actions
  setCurrentTeam: (team: FantasyTeam | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasHydrated: (hasHydrated: boolean) => void;

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
  addDriver: (driverId: string, isStarDriver?: boolean) => Promise<void>;
  removeDriver: (driverId: string) => Promise<void>;
  swapDriver: (oldDriverId: string, newDriverId: string) => Promise<void>;
  setConstructor: (constructorId: string) => Promise<void>;
  setStarDriver: (driverId: string) => Promise<void>;
  setStarConstructor: () => Promise<void>;
  getEligibleStarDrivers: () => string[]; // Returns IDs of bottom 10 drivers eligible for star
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
  selectedDrivers: [],
  selectedConstructor: null,
  selectionState: initialSelectionState,

  setHasHydrated: (hasHydrated) => set({ hasHydrated }),
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
        // Deduplicate teams by ID (keep the latest by updatedAt)
        const { userTeams, currentTeam } = get();
        const uniqueTeams = userTeams.reduce((acc, team) => {
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

      const teams = await teamService.getUserTeams(userId);
      set({ userTeams: teams, isLoading: false });

      // Auto-select first team if no current team
      if (teams.length > 0 && !get().currentTeam) {
        set({ currentTeam: teams[0] });
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
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, team is stored locally
        const { currentTeam } = get();
        if (currentTeam?.id === teamId) {
          set({ isLoading: false });
          return;
        }
        set({ currentTeam: null, isLoading: false });
        return;
      }

      const team = await teamService.getTeamById(teamId);
      set({ currentTeam: team, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load team';
      set({ error: message, isLoading: false });
    }
  },

  loadUserTeamInLeague: async (userId, leagueId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, check if current team matches the league
        const { currentTeam } = get();
        if (currentTeam?.leagueId === leagueId && currentTeam?.userId === userId) {
          set({ isLoading: false });
          return;
        }
        set({ currentTeam: null, isLoading: false });
        return;
      }

      const team = await teamService.getUserTeamInLeague(userId, leagueId);
      set({ currentTeam: team, isLoading: false });
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
        const teamId = `demo-team-${demoTeamIdCounter++}`;
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

  addDriver: async (driverId, isStarDriver = false) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { currentTeam, selectedDrivers } = get();

    if (!currentTeam) {
      set({ error: 'No team loaded' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, update team locally
        // First check selectedDrivers (from build screen), then check demoDrivers
        let driver = selectedDrivers.find(d => d.id === driverId);
        if (!driver) {
          driver = demoDrivers.find(d => d.id === driverId);
        }
        if (!driver) {
          throw new Error('Driver not found');
        }

        const fantasyDriver: FantasyDriver = {
          driverId: driver.id,
          name: driver.name,
          shortName: driver.shortName,
          constructorId: driver.constructorId,
          purchasePrice: driver.price,
          currentPrice: driver.price,
          pointsScored: 0,
          racesHeld: 0,
          isStarDriver,
        };

        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          drivers: [...currentTeam.drivers, fantasyDriver],
          totalSpent: currentTeam.totalSpent + driver.price,
          budget: currentTeam.budget - driver.price,
          updatedAt: new Date(),
        };
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      const updatedTeam = await teamService.addDriver(currentTeam.id, driverId, isStarDriver);
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
    } catch (error) {
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

        // Sell at current price minus 5% commission
        const saleValue = calculateSaleValue(driverToRemove.currentPrice);

        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          drivers: currentTeam.drivers.filter(d => d.driverId !== driverId),
          totalSpent: currentTeam.totalSpent - driverToRemove.purchasePrice,
          budget: currentTeam.budget + saleValue,
          updatedAt: new Date(),
        };
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      const updatedTeam = await teamService.removeDriver(currentTeam.id, driverId);
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
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

        const fantasyDriver: FantasyDriver = {
          driverId: newDriver.id,
          name: newDriver.name,
          shortName: newDriver.shortName,
          constructorId: newDriver.constructorId,
          purchasePrice: newDriver.price,
          currentPrice: newDriver.price,
          pointsScored: 0,
          racesHeld: 0,
          isStarDriver: oldDriver.isStarDriver,
        };

        // Sell old driver at current price minus 5% commission, buy new at full price
        const saleValue = calculateSaleValue(oldDriver.currentPrice);
        const purchaseCost = newDriver.price;
        const netCostChange = purchaseCost - saleValue;

        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          drivers: currentTeam.drivers.map(d =>
            d.driverId === oldDriverId ? fantasyDriver : d
          ),
          totalSpent: currentTeam.totalSpent - oldDriver.purchasePrice + purchaseCost,
          budget: currentTeam.budget - netCostChange,
          updatedAt: new Date(),
        };
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      const updatedTeam = await teamService.swapDriver(currentTeam.id, oldDriverId, newDriverId);
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to swap driver';
      set({ error: message, isLoading: false });
    }
  },

  setConstructor: async (constructorId) => {
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
        const fantasyConstructor: FantasyConstructor = {
          constructorId: constructor.id,
          name: constructor.name,
          purchasePrice: constructor.price,
          currentPrice: constructor.price,
          pointsScored: 0,
          racesHeld: 0,
          isStarDriver: false,
        };

        const priceDiff = constructor.price - oldConstructorPrice;
        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          constructor: fantasyConstructor,
          totalSpent: currentTeam.totalSpent + priceDiff,
          budget: currentTeam.budget - priceDiff,
          updatedAt: new Date(),
        };
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      const updatedTeam = await teamService.setConstructor(currentTeam.id, constructorId);
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
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
      if (isDemoMode) {
        // In demo mode, remove constructor locally
        // Sell at current price minus 5% commission
        const saleValue = calculateSaleValue(currentTeam.constructor.currentPrice);
        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          constructor: null,
          totalSpent: currentTeam.totalSpent - currentTeam.constructor.purchasePrice,
          budget: currentTeam.budget + saleValue,
          updatedAt: new Date(),
        };
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      const updatedTeam = await teamService.removeConstructor(currentTeam.id);
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove constructor';
      set({ error: message, isLoading: false });
    }
  },

  getEligibleStarDrivers: () => {
    // Get bottom 10 drivers by fantasy points from demo data
    const sortedDrivers = [...demoDrivers].sort((a, b) => a.fantasyPoints - b.fantasyPoints);
    const bottom10 = sortedDrivers.slice(0, 10);
    return bottom10.map(d => d.id);
  },

  setStarDriver: async (driverId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { currentTeam } = get();

    if (!currentTeam) {
      set({ error: 'No team loaded' });
      return;
    }

    // Validate driver is eligible (bottom 10 by points)
    const eligibleDrivers = get().getEligibleStarDrivers();
    if (!eligibleDrivers.includes(driverId)) {
      set({ error: 'Only bottom 10 drivers by points can be star driver' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, set star driver locally and clear from constructor
        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          drivers: currentTeam.drivers.map(d => ({
            ...d,
            isStarDriver: d.driverId === driverId,
          })),
          constructor: currentTeam.constructor ? {
            ...currentTeam.constructor,
            isStarDriver: false,
          } : null,
          updatedAt: new Date(),
        };
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      const updatedTeam = await teamService.setStarDriver(currentTeam.id, driverId);
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set star driver';
      set({ error: message, isLoading: false });
    }
  },

  setStarConstructor: async () => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { currentTeam } = get();

    if (!currentTeam) {
      set({ error: 'No team loaded' });
      return;
    }

    if (!currentTeam.constructor) {
      set({ error: 'No constructor to set as star' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, set constructor as star and clear from drivers
        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          drivers: currentTeam.drivers.map(d => ({
            ...d,
            isStarDriver: false,
          })),
          constructor: {
            ...currentTeam.constructor,
            isStarDriver: true,
          },
          updatedAt: new Date(),
        };
        updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
        return;
      }

      const updatedTeam = await teamService.setStarConstructor(currentTeam.id);
      updateTeamAndSync(get, set, updatedTeam, { isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set star constructor';
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
        // Get eligible star drivers (bottom 10 by points)
        const eligibleStarDrivers = get().getEligibleStarDrivers();

        // Find first eligible driver for star, or default to constructor
        const firstEligibleDriver = selectedDrivers.find(d => eligibleStarDrivers.includes(d.id));
        const hasEligibleDriver = !!firstEligibleDriver;

        // In demo mode, build team locally with all selections
        const fantasyDrivers: FantasyDriver[] = selectedDrivers.map((driver) => ({
          driverId: driver.id,
          name: driver.name,
          shortName: driver.shortName,
          constructorId: driver.constructorId,
          purchasePrice: driver.price,
          currentPrice: driver.price,
          pointsScored: 0,
          racesHeld: 0,
          isStarDriver: hasEligibleDriver && driver.id === firstEligibleDriver?.id,
        }));

        const fantasyConstructor: FantasyConstructor | null = selectedConstructor ? {
          constructorId: selectedConstructor.id,
          name: selectedConstructor.name,
          purchasePrice: selectedConstructor.price,
          currentPrice: selectedConstructor.price,
          pointsScored: 0,
          racesHeld: 0,
          isStarDriver: !hasEligibleDriver, // Constructor is star if no eligible driver
        } : null;

        const totalSpent = selectionState.totalCost;
        const updatedTeam: FantasyTeam = {
          ...currentTeam,
          drivers: fantasyDrivers,
          constructor: fantasyConstructor,
          totalSpent,
          budget: BUDGET - totalSpent,
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

      // For Firebase, add each driver and constructor
      const driverPromises = selectedDrivers.map((driver, index) =>
        teamService.addDriver(currentTeam.id, driver.id, index === 0)
      );
      await Promise.all(driverPromises);

      if (selectedConstructor) {
        await teamService.setConstructor(currentTeam.id, selectedConstructor.id);
      }

      // Reload the team to get updated state
      const updatedTeam = await teamService.getTeamById(currentTeam.id);
      if (updatedTeam) {
        updateTeamAndSync(get, set, updatedTeam, {
          selectedDrivers: [],
          selectedConstructor: null,
          selectionState: initialSelectionState,
          isLoading: false,
        });
      } else {
        set({
          selectedDrivers: [],
          selectedConstructor: null,
          selectionState: initialSelectionState,
          isLoading: false,
        });
      }
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

    const { totalPoints, driverPoints, constructorPoints } = calculateTeamPointsFromRaces(currentTeam);

    // Update driver points scored
    const updatedDrivers = currentTeam.drivers.map(driver => ({
      ...driver,
      pointsScored: driverPoints[driver.driverId] || 0,
    }));

    // Update constructor points scored
    const updatedConstructor = currentTeam.constructor ? {
      ...currentTeam.constructor,
      pointsScored: constructorPoints,
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

    const updatedUserTeams = userTeams.map(team => {
      const { totalPoints, driverPoints, constructorPoints } = calculateTeamPointsFromRaces(team);

      const updatedDrivers = team.drivers.map(driver => ({
        ...driver,
        pointsScored: driverPoints[driver.driverId] || 0,
      }));

      const updatedConstructor = team.constructor ? {
        ...team.constructor,
        pointsScored: constructorPoints,
      } : null;

      return {
        ...team,
        drivers: updatedDrivers,
        constructor: updatedConstructor,
        totalPoints,
        updatedAt: new Date(),
      };
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
          // Convert date strings back to Date objects
          if (state.currentTeam) {
            state.currentTeam.createdAt = new Date(state.currentTeam.createdAt);
            state.currentTeam.updatedAt = new Date(state.currentTeam.updatedAt);
          }
          state.userTeams = state.userTeams.map(team => ({
            ...team,
            createdAt: new Date(team.createdAt),
            updatedAt: new Date(team.updatedAt),
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
      },
    }
  )
);
