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
  promoteToCoAdmin: (leagueId: string, userId: string) => Promise<void>;
  demoteFromCoAdmin: (leagueId: string, userId: string) => Promise<void>;
  isUserAdmin: (userId: string) => boolean;

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
        // In demo mode, find all teams assigned to this league
        const user = useAuthStore.getState().user;
        const { leagues } = get();
        const league = leagues.find(l => l.id === leagueId);

        if (user && league) {
          // Get all teams for this league from team store
          const teamState = useTeamStore.getState();
          const { userTeams, currentTeam } = teamState;

          // Build a comprehensive list of all teams, prioritizing currentTeam
          const teamMap = new Map<string, typeof currentTeam>();

          // Add all userTeams
          userTeams.forEach(team => {
            if (team) teamMap.set(team.id, team);
          });

          // Add/update with currentTeam (ensures latest state is used)
          if (currentTeam) {
            teamMap.set(currentTeam.id, currentTeam);
          }

          // Filter teams that belong to this league
          const teamsInLeague = Array.from(teamMap.values()).filter(
            team => team && team.leagueId === leagueId
          );

          // Create member entries for each team in the league
          const members: LeagueMember[] = teamsInLeague.map((team, index) => ({
            id: team.id,
            leagueId,
            userId: team.userId,
            displayName: team.userId === user.id ? (user.displayName || 'Demo User') : 'League Member',
            teamName: team.name,
            teamAvatarUrl: team.avatarUrl,
            role: team.userId === league.ownerId ? 'owner' as const : 'member' as const,
            totalPoints: team.totalPoints || 0,
            rank: index + 1,
            joinedAt: team.createdAt,
          }));

          // Sort by points and assign ranks
          members.sort((a, b) => b.totalPoints - a.totalPoints);
          members.forEach((member, index) => {
            member.rank = index + 1;
          });

          // If no teams found but user is the owner, check if currentTeam should be associated
          if (members.length === 0 && league.ownerId === user.id) {
            // Try to find user's team that might not have leagueId set yet
            const userTeam = currentTeam?.userId === user.id ? currentTeam :
                            userTeams.find(t => t.userId === user.id);

            members.push({
              id: user.id,
              leagueId,
              userId: user.id,
              displayName: user.displayName || 'Demo User',
              teamName: userTeam?.name || undefined,
              teamAvatarUrl: userTeam?.avatarUrl,
              role: 'owner',
              totalPoints: userTeam?.totalPoints || 0,
              rank: 1,
              joinedAt: new Date(),
            });
          }

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

  promoteToCoAdmin: async (leagueId, userId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, update local state
        const { currentLeague, leagues, members } = get();
        if (currentLeague) {
          const coAdminIds = currentLeague.coAdminIds || [];
          const updatedLeague = {
            ...currentLeague,
            coAdminIds: [...coAdminIds, userId],
          };
          const updatedLeagues = leagues.map((l) =>
            l.id === leagueId ? updatedLeague : l
          );
          const updatedMembers = members.map((m) =>
            m.userId === userId ? { ...m, role: 'admin' as const } : m
          );
          set({
            currentLeague: updatedLeague,
            leagues: updatedLeagues,
            members: updatedMembers,
            isLoading: false,
          });
        } else {
          set({ isLoading: false });
        }
        return;
      }

      await leagueService.promoteToCoAdmin(leagueId, userId);
      // Reload league and members after promotion
      await get().loadLeague(leagueId);
      await get().loadLeagueMembers(leagueId);
      set({ isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to promote member';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  demoteFromCoAdmin: async (leagueId, userId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, update local state
        const { currentLeague, leagues, members } = get();
        if (currentLeague) {
          const coAdminIds = currentLeague.coAdminIds || [];
          const updatedLeague = {
            ...currentLeague,
            coAdminIds: coAdminIds.filter(id => id !== userId),
          };
          const updatedLeagues = leagues.map((l) =>
            l.id === leagueId ? updatedLeague : l
          );
          const updatedMembers = members.map((m) =>
            m.userId === userId ? { ...m, role: 'member' as const } : m
          );
          set({
            currentLeague: updatedLeague,
            leagues: updatedLeagues,
            members: updatedMembers,
            isLoading: false,
          });
        } else {
          set({ isLoading: false });
        }
        return;
      }

      await leagueService.demoteFromCoAdmin(leagueId, userId);
      // Reload league and members after demotion
      await get().loadLeague(leagueId);
      await get().loadLeagueMembers(leagueId);
      set({ isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to demote co-admin';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  isUserAdmin: (userId) => {
    const { currentLeague } = get();
    if (!currentLeague) return false;
    if (currentLeague.ownerId === userId) return true;
    return currentLeague.coAdminIds?.includes(userId) || false;
  },
}));
