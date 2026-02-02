import { create } from 'zustand';
import type { League, LeagueMember, CreateLeagueForm, LeagueSettings } from '../types';
import { leagueService } from '../services/league.service';
import { useAuthStore } from './auth.store';
import { useTeamStore } from './team.store';
import {
  RACE_POINTS,
  SPRINT_POINTS,
  FASTEST_LAP_BONUS,
  POSITION_GAINED_BONUS,
} from '../config/constants';

// Default league settings for demo mode
const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  allowLateJoin: true,
  lockDeadline: 'qualifying',
  scoringRules: {
    racePoints: RACE_POINTS,
    sprintPoints: SPRINT_POINTS,
    fastestLapBonus: FASTEST_LAP_BONUS,
    positionGainedBonus: POSITION_GAINED_BONUS,
    qualifyingPoints: [],
    dnfPenalty: 0,
    dsqPenalty: -5,
  },
};

// Generate a random invite code for demo mode
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Demo leagues for demo mode
let demoLeagueIdCounter = 1;

interface LeagueState {
  leagues: League[];
  currentLeague: League | null;
  recentlyCreatedLeague: League | null; // Track league just created for team creation flow
  members: LeagueMember[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setLeagues: (leagues: League[]) => void;
  setCurrentLeague: (league: League | null) => void;
  setRecentlyCreatedLeague: (league: League | null) => void;
  setMembers: (members: LeagueMember[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // League actions
  loadUserLeagues: (userId: string) => Promise<void>;
  loadLeague: (leagueId: string) => Promise<void>;
  loadLeagueMembers: (leagueId: string) => Promise<void>;
  lookupLeagueByCode: (code: string) => Promise<League | null>;
  createLeague: (userId: string, userName: string, data: CreateLeagueForm, seasonId: string) => Promise<League>;
  joinLeague: (leagueId: string, userId: string, userName: string) => Promise<void>;
  joinLeagueByCode: (code: string, userId: string, userName: string) => Promise<void>;
  leaveLeague: (leagueId: string, userId: string) => Promise<void>;
  deleteLeague: (leagueId: string, userId: string) => Promise<void>;

  // Admin actions
  removeMember: (leagueId: string, memberId: string) => Promise<void>;
  inviteMemberByEmail: (leagueId: string, email: string) => Promise<void>;

  clearError: () => void;
  clearRecentlyCreatedLeague: () => void;
}

export const useLeagueStore = create<LeagueState>()((set, get) => ({
  leagues: [],
  currentLeague: null,
  recentlyCreatedLeague: null,
  members: [],
  isLoading: false,
  error: null,

  setLeagues: (leagues) => set({ leagues }),
  setCurrentLeague: (league) => set({ currentLeague: league }),
  setRecentlyCreatedLeague: (league) => set({ recentlyCreatedLeague: league }),
  setMembers: (members) => set({ members }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  clearError: () => set({ error: null }),
  clearRecentlyCreatedLeague: () => set({ recentlyCreatedLeague: null }),

  loadUserLeagues: async (userId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, just return the current leagues from store
        set({ isLoading: false });
        return;
      }

      const leagues = await leagueService.getUserLeagues(userId);
      set({ leagues, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load leagues';
      set({ error: message, isLoading: false });
    }
  },

  loadLeague: async (leagueId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, find league from local store
        const { leagues } = get();
        const league = leagues.find(l => l.id === leagueId) || null;
        set({ currentLeague: league, isLoading: false });
        return;
      }

      const league = await leagueService.getLeagueById(leagueId);
      set({ currentLeague: league, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load league';
      set({ error: message, isLoading: false });
    }
  },

  loadLeagueMembers: async (leagueId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, return only the owner (founder)
        const user = useAuthStore.getState().user;
        const { currentLeague } = get();

        if (user && currentLeague) {
          // Get user's team for this league to get their actual points and team name
          const { userTeams } = useTeamStore.getState();
          const userTeamInLeague = userTeams.find(t => t.leagueId === leagueId);
          const userPoints = userTeamInLeague?.totalPoints || 0;
          const teamName = userTeamInLeague?.name;

          // Only include the owner/founder
          const members: LeagueMember[] = [
            {
              id: user.id,
              leagueId,
              userId: user.id,
              displayName: user.displayName || 'Demo User',
              teamName, // Include the team name
              role: 'owner',
              totalPoints: userPoints, // Use actual team points
              rank: 1, // Owner is rank 1 when solo
              joinedAt: new Date(),
            },
          ];

          set({ members, isLoading: false });
        } else {
          set({ members: [], isLoading: false });
        }
        return;
      }

      const members = await leagueService.getLeagueMembers(leagueId);
      set({ members, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load members';
      set({ error: message, isLoading: false });
    }
  },

  lookupLeagueByCode: async (code) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    if (!code || code.length < 4) {
      return null;
    }

    try {
      if (isDemoMode) {
        // In demo mode, search local leagues for the code
        const { leagues } = get();
        const league = leagues.find(l => l.inviteCode === code.toUpperCase());
        return league || null;
      }

      const league = await leagueService.getLeagueByCode(code);
      return league;
    } catch (error) {
      return null;
    }
  },

  createLeague: async (userId, userName, data, seasonId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, create league locally with just the owner
        const leagueId = `demo-league-${demoLeagueIdCounter++}`;
        const league: League = {
          id: leagueId,
          name: data.name,
          description: data.description,
          ownerId: userId,
          ownerName: userName,
          inviteCode: generateInviteCode(),
          isPublic: data.isPublic,
          maxMembers: data.maxMembers || 20,
          memberCount: 1, // Just the owner
          seasonId,
          createdAt: new Date(),
          updatedAt: new Date(),
          settings: DEFAULT_LEAGUE_SETTINGS,
        };

        const { leagues } = get();
        set({ leagues: [...leagues, league], currentLeague: league, recentlyCreatedLeague: league, isLoading: false });
        return league;
      }

      const league = await leagueService.createLeague(userId, userName, data, seasonId);
      const { leagues } = get();
      set({ leagues: [...leagues, league], currentLeague: league, recentlyCreatedLeague: league, isLoading: false });
      return league;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create league';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  joinLeague: async (leagueId, userId, userName) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, just add to local leagues
        const { leagues } = get();
        const existingLeague = leagues.find(l => l.id === leagueId);
        if (existingLeague) {
          throw new Error('Already a member of this league');
        }
        set({ isLoading: false });
        return;
      }

      await leagueService.joinLeague(leagueId, userId, userName);
      await get().loadUserLeagues(userId);
      set({ isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join league';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  joinLeagueByCode: async (code, userId, userName) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        const { leagues } = get();
        const upperCode = code.toUpperCase();

        // Check if already a member of a league with this code
        const existingLeague = leagues.find(l => l.inviteCode === upperCode);
        if (existingLeague) {
          // If user owns this league or is already in it, just set it as current and return success
          set({
            currentLeague: existingLeague,
            isLoading: false
          });
          return;
        }

        // In demo mode, create a simulated league for any valid code format
        // This simulates joining an "external" league created by someone else
        const newLeague: League = {
          id: `joined-league-${Date.now()}`,
          name: `League ${upperCode}`,
          description: 'A league you joined via invite code',
          ownerId: 'external-owner',
          ownerName: 'League Admin',
          inviteCode: upperCode,
          isPublic: false,
          maxMembers: 20,
          memberCount: 5, // Simulated existing members
          seasonId: '2026',
          createdAt: new Date(),
          updatedAt: new Date(),
          settings: DEFAULT_LEAGUE_SETTINGS,
        };

        set({
          leagues: [...leagues, newLeague],
          currentLeague: newLeague,
          isLoading: false
        });
        return;
      }

      const league = await leagueService.getLeagueByCode(code);
      if (!league) {
        throw new Error('Invalid invite code');
      }
      await leagueService.joinLeague(league.id, userId, userName);
      await get().loadUserLeagues(userId);
      set({ isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join league';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  leaveLeague: async (leagueId, userId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, remove from local leagues
        const { leagues } = get();
        const league = leagues.find(l => l.id === leagueId);
        if (league && league.ownerId === userId) {
          throw new Error('Owner cannot leave the league. Delete it instead.');
        }
        set({
          leagues: leagues.filter((l) => l.id !== leagueId),
          currentLeague: null,
          isLoading: false,
        });
        return;
      }

      await leagueService.leaveLeague(leagueId, userId);
      const { leagues } = get();
      set({
        leagues: leagues.filter((l) => l.id !== leagueId),
        currentLeague: null,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to leave league';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  deleteLeague: async (leagueId, userId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, remove from local leagues
        const { leagues } = get();
        const league = leagues.find(l => l.id === leagueId);
        if (!league) {
          throw new Error('League not found');
        }
        if (league.ownerId !== userId) {
          throw new Error('Only the owner can delete the league');
        }
        set({
          leagues: leagues.filter((l) => l.id !== leagueId),
          currentLeague: null,
          isLoading: false,
        });
        return;
      }

      await leagueService.deleteLeague(leagueId, userId);
      const { leagues } = get();
      set({
        leagues: leagues.filter((l) => l.id !== leagueId),
        currentLeague: null,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete league';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  removeMember: async (leagueId, memberId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, remove member from local state
        const { members, currentLeague, leagues } = get();
        const updatedMembers = members.filter((m) => m.userId !== memberId);

        // Re-rank remaining members
        updatedMembers.sort((a, b) => b.totalPoints - a.totalPoints);
        updatedMembers.forEach((member, index) => {
          member.rank = index + 1;
        });

        // Update member count in league
        if (currentLeague) {
          const updatedLeague = { ...currentLeague, memberCount: updatedMembers.length };
          const updatedLeagues = leagues.map((l) =>
            l.id === leagueId ? updatedLeague : l
          );
          set({
            members: updatedMembers,
            currentLeague: updatedLeague,
            leagues: updatedLeagues,
            isLoading: false,
          });
        } else {
          set({ members: updatedMembers, isLoading: false });
        }
        return;
      }

      await leagueService.removeMember(leagueId, memberId);
      // Reload members after removal
      await get().loadLeagueMembers(leagueId);
      set({ isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove member';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  inviteMemberByEmail: async (leagueId, email) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, simulate sending an invite
        // Just show success - in real app this would send an email
        await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate network delay
        set({ isLoading: false });
        return;
      }

      await leagueService.inviteMemberByEmail(leagueId, email);
      set({ isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send invitation';
      set({ error: message, isLoading: false });
      throw error;
    }
  },
}));
