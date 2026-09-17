import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { League, LeagueMember, CreateLeagueForm, LeagueSettings } from '../types';
import { leagueService } from '../services/league.service';
import { useAuthStore } from './auth.store';
import { useTeamStore } from './team.store';
import { errorLogService } from '../services/errorLog.service';
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

// Demo leagues for demo mode - use timestamp to avoid ID collisions across sessions
let demoLeagueIdCounter = Date.now();

interface LeagueState {
  leagues: League[];
  currentLeague: League | null;
  recentlyCreatedLeague: League | null; // Track league just created for team creation flow
  members: LeagueMember[];
  retiredMembers: LeagueMember[]; // Preserved scores from deleted teams
  pendingLeagueIds: string[]; // League IDs where user is pending approval
  pendingMembers: LeagueMember[]; // Pending members for admin view
  isLoading: boolean;
  // Last-known members per league, persisted to disk. Standings render from
  // this immediately on open while the network refresh runs behind it, so the
  // screen never shows an empty spinner for a league the user has seen before.
  membersByLeague: Record<string, LeagueMember[]>;
  // True only while a background refresh is in flight over already-visible
  // data. Distinct from isLoading, which means "nothing to show yet".
  isRefreshingMembers: boolean;
  error: string | null;
  membersLastFetched: Record<string, number>; // leagueId -> timestamp of last fetch

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
  loadLeagueMembers: (leagueId: string, force?: boolean) => Promise<void>;
  subscribeToLeagueMembers: (leagueId: string) => () => void;
  unsubscribeFromLeagueMembers: () => void;
  lookupLeagueByCode: (code: string) => Promise<League | null>;
  createLeague: (userId: string, userName: string, data: CreateLeagueForm, seasonId: string) => Promise<League>;
  joinLeague: (leagueId: string, userId: string, userName: string) => Promise<void>;
  joinLeagueByCode: (code: string, userId: string, userName: string) => Promise<void>;
  leaveLeague: (leagueId: string, userId: string) => Promise<void>;
  deleteLeague: (leagueId: string, userId: string) => Promise<void>;

  // Retired members
  addRetiredMember: (member: LeagueMember) => void;
  getRetiredMembers: (leagueId: string) => LeagueMember[];

  // Approval actions
  loadPendingMembers: (leagueId: string) => Promise<void>;
  approveMember: (leagueId: string, userId: string) => Promise<void>;
  rejectMember: (leagueId: string, userId: string) => Promise<void>;
  updateLeagueSettings: (leagueId: string, settings: Partial<LeagueSettings>) => Promise<void>;

  // Admin actions
  updateLeagueDetails: (leagueId: string, userId: string, updates: { name?: string; description?: string }) => Promise<void>;
  removeMember: (leagueId: string, memberId: string) => Promise<void>;
  inviteMemberByEmail: (leagueId: string, email: string) => Promise<void>;
  promoteToCoAdmin: (leagueId: string, userId: string) => Promise<void>;
  demoteFromCoAdmin: (leagueId: string, userId: string) => Promise<void>;
  isUserAdmin: (userId: string) => boolean;

  expandLeagueCapacity: (leagueId: string, additionalSlots: number) => Promise<void>;

  pendingCountsByLeague: Record<string, number>;
  loadPendingCountsForOwnedLeagues: (userId: string) => Promise<void>;

  demoInviteCounts: Record<string, number>;
  demoPendingMembers: LeagueMember[]; // Demo mode pending members
  clearError: () => void;
  clearRecentlyCreatedLeague: () => void;
}

// Module-level ref for the active Firestore listener (only one at a time)
let activeMembersUnsubscribe: (() => void) | null = null;

export const useLeagueStore = create<LeagueState>()(
  persist(
    (set, get) => ({
  leagues: [],
  currentLeague: null,
  recentlyCreatedLeague: null,
  members: [],
  retiredMembers: [],
  pendingLeagueIds: [],
  pendingMembers: [],
  isLoading: false,
  membersByLeague: {},
  isRefreshingMembers: false,
  membersLastFetched: {},
  error: null,
  pendingCountsByLeague: {},
  demoInviteCounts: {},
  demoPendingMembers: [],

  setLeagues: (leagues) => set({ leagues }),
  setCurrentLeague: (league) => set({ currentLeague: league }),
  setRecentlyCreatedLeague: (league) => set({ recentlyCreatedLeague: league }),
  setMembers: (members) => {
    const leagueId = get().currentLeague?.id;
    set({
      members,
      ...(leagueId ? { membersByLeague: { ...get().membersByLeague, [leagueId]: members } } : {}),
    });
  },
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  clearError: () => set({ error: null }),
  clearRecentlyCreatedLeague: () => set({ recentlyCreatedLeague: null }),

  addRetiredMember: (member) => {
    const { retiredMembers } = get();
    // Avoid duplicates
    if (retiredMembers.some(m => m.id === member.id && m.leagueId === member.leagueId)) return;
    set({ retiredMembers: [...retiredMembers, { ...member, isWithdrawn: true }] });
  },

  getRetiredMembers: (leagueId) => {
    return get().retiredMembers.filter(m => m.leagueId === leagueId);
  },

  loadUserLeagues: async (userId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    // Stale-while-revalidate: the persisted league list renders straight
    // away and refreshes underneath. isLoading (which gates the standings
    // spinner) only flips when there is nothing to show yet.
    const hasCached = get().leagues.length > 0;
    set({ isLoading: !hasCached, error: null });
    try {
      if (isDemoMode) {
        // In demo mode, just return the current leagues from store
        set({ isLoading: false });
        return;
      }

      const leagues = await leagueService.getUserLeagues(userId);

      // Detect which leagues the user is pending in — one parallel round-trip
      // for all leagues instead of one per league in series.
      const pendingChecks = await Promise.all(leagues.map(async (league) => {
        try {
          const pending = await leagueService.getPendingMembers(league.id);
          return pending.some(m => m.userId === userId) ? league.id : null;
        } catch {
          return null; // Ignore errors checking pending status
        }
      }));
      const pendingIds = pendingChecks.filter((id): id is string => !!id);

      set({ leagues, pendingLeagueIds: pendingIds, isLoading: false });

      // Load pending counts for leagues this user owns
      get().loadPendingCountsForOwnedLeagues(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load leagues';
      errorLogService.logError('loadUserLeagues', error);
      set({ error: message, isLoading: false });
    }
  },

  loadPendingCountsForOwnedLeagues: async (userId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    const { leagues } = get();
    const ownedLeagues = leagues.filter(l => l.ownerId === userId);

    if (ownedLeagues.length === 0) {
      set({ pendingCountsByLeague: {} });
      return;
    }

    if (isDemoMode) {
      const { demoPendingMembers } = get();
      const counts: Record<string, number> = {};
      for (const league of ownedLeagues) {
        const count = demoPendingMembers.filter(m => m.leagueId === league.id).length;
        if (count > 0) counts[league.id] = count;
      }
      set({ pendingCountsByLeague: counts });
      return;
    }

    try {
      const counts: Record<string, number> = {};
      await Promise.all(
        ownedLeagues.map(async (league) => {
          try {
            const pending = await leagueService.getPendingMembers(league.id);
            if (pending.length > 0) counts[league.id] = pending.length;
          } catch {
            // Ignore errors for individual leagues
          }
        }),
      );
      set({ pendingCountsByLeague: counts });
    } catch (error) {
      errorLogService.logError('loadPendingCountsForOwnedLeagues', error);
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
      errorLogService.logError('loadLeague', error);
      set({ error: message, isLoading: false });
    }
  },

  loadLeagueMembers: async (leagueId, force) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    // Short cache: skip re-fetch if loaded recently
    // Race weekend (Sat/Sun): 30s cache. Weekday: 60s cache.
    // Pull-to-refresh or force=true bypasses cache.
    if (!force) {
      const lastFetch = get().membersLastFetched[leagueId];
      const now = Date.now();
      const day = new Date().getDay();
      const isRaceWeekend = day === 0 || day === 6;
      const cacheTTL = isRaceWeekend ? 30_000 : 60_000;

      // Check THIS league's cache, not the ambient `members` array — that may
      // still hold the previously-viewed league, in which case the early return
      // would leave its standings on screen under the new league's name.
      const fresh = get().membersByLeague[leagueId];
      if (lastFetch && now - lastFetch < cacheTTL && fresh && fresh.length > 0) {
        if (get().members !== fresh) set({ members: fresh });
        return; // Use cached data
      }
    }

    // Stale-while-revalidate: paint the last-known standings for this league
    // immediately (from disk on a cold start), then refresh behind them. Only
    // block with a spinner when there is genuinely nothing to render — a
    // 2-3s blank screen over data we already have reads as a failure.
    const cached = get().membersByLeague[leagueId];
    const hasCache = !!cached && cached.length > 0;

    set({
      // Clearing when this league has no cache is deliberate: leaving the
      // previous league's rows up would show the wrong table under the right
      // name, which is worse than a spinner.
      members: hasCache ? cached : [],
      isLoading: !hasCache,
      isRefreshingMembers: hasCache,
      error: null,
    });
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
            (team): team is NonNullable<typeof team> => team != null && team.leagueId === leagueId
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
            racesPlayed: team.racesPlayed || 0,
            pprAverage: team.racesPlayed && team.racesPlayed > 0
              ? Math.round((team.totalPoints / team.racesPlayed) * 10) / 10
              : 0,
            recentFormPoints: (team.pointsHistory || []).slice(-5).reduce((a, b) => a + b, 0),
            raceWins: team.raceWins || 0,
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
              racesPlayed: userTeam?.racesPlayed || 0,
              pprAverage: userTeam && userTeam.racesPlayed > 0
                ? Math.round((userTeam.totalPoints / userTeam.racesPlayed) * 10) / 10
                : 0,
              recentFormPoints: userTeam ? (userTeam.pointsHistory || []).slice(-5).reduce((a, b) => a + b, 0) : 0,
              raceWins: userTeam?.raceWins || 0,
            });
          }

          set({ members, isLoading: false, isRefreshingMembers: false });
        } else {
          set({ members: [], isLoading: false, isRefreshingMembers: false });
        }
        return;
      }

      const members = await leagueService.getLeagueMembers(leagueId);
      set({
        members,
        isLoading: false,
        isRefreshingMembers: false,
        membersByLeague: { ...get().membersByLeague, [leagueId]: members },
        membersLastFetched: { ...get().membersLastFetched, [leagueId]: Date.now() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load members';
      errorLogService.logError('loadLeagueMembers', error);
      // Keep whatever is on screen. Surfacing an error over stale-but-valid
      // standings is worse than quietly leaving them up; the next refresh or a
      // pull-to-refresh will correct it.
      const stillHasRows = get().members.length > 0;
      set({
        error: stillHasRows ? null : message,
        isLoading: false,
        isRefreshingMembers: false,
      });
    }
  },

  // Real-time listener for league members (used after recent race completion)
  subscribeToLeagueMembers: (leagueId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;
    if (isDemoMode) {
      // No Firestore listener in demo mode — return no-op
      return () => {};
    }

    // Tear down any existing listener first
    if (activeMembersUnsubscribe) {
      activeMembersUnsubscribe();
      activeMembersUnsubscribe = null;
    }

    // Key the visible list to THIS league before the first snapshot lands:
    // the persisted copy if we have one, otherwise empty — never another
    // league's table under this league's name.
    set({ members: get().membersByLeague[leagueId] ?? [], isRefreshingMembers: true });

    const unsubscribe = leagueService.subscribeToLeagueMembers(
      leagueId,
      (members) => {
        set({
          members,
          isLoading: false,
          isRefreshingMembers: false,
          membersByLeague: { ...get().membersByLeague, [leagueId]: members },
          membersLastFetched: { ...get().membersLastFetched, [leagueId]: Date.now() },
        });
      },
      (error) => {
        console.error('League members subscription error:', error);
      },
    );

    activeMembersUnsubscribe = unsubscribe;
    return unsubscribe;
  },

  unsubscribeFromLeagueMembers: () => {
    if (activeMembersUnsubscribe) {
      activeMembersUnsubscribe();
      activeMembersUnsubscribe = null;
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
        // Check for duplicate league name
        if (get().leagues.some(l => l.name === data.name)) {
          throw new Error('A league with this name already exists');
        }
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
          settings: {
            ...DEFAULT_LEAGUE_SETTINGS,
            requireApproval: data.requireApproval ?? true,
          },
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
      errorLogService.logError('createLeague', error);
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

      const member = await leagueService.joinLeague(leagueId, userId, userName);
      if (member.status === 'pending') {
        // Add to pending league IDs, don't load full leagues
        const { pendingLeagueIds } = get();
        if (!pendingLeagueIds.includes(leagueId)) {
          set({ pendingLeagueIds: [...pendingLeagueIds, leagueId], isLoading: false });
        } else {
          set({ isLoading: false });
        }
      } else {
        await get().loadUserLeagues(userId);
        set({ isLoading: false });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join league';
      errorLogService.logError('joinLeague', error);
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  joinLeagueByCode: async (code, userId, userName) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        const { leagues, pendingLeagueIds } = get();
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
          settings: { ...DEFAULT_LEAGUE_SETTINGS, requireApproval: true },
        };

        // Simulated league always requires approval in demo (external league)
        if (newLeague.settings.requireApproval) {
          // Add as pending
          set({
            leagues: [...leagues, newLeague],
            currentLeague: newLeague,
            pendingLeagueIds: [...pendingLeagueIds, newLeague.id],
            isLoading: false
          });
          // Signal pending to caller by setting a flag on currentLeague
          return;
        }

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
      const member = await leagueService.joinLeague(league.id, userId, userName);

      if (member.status === 'pending') {
        const { pendingLeagueIds, leagues } = get();
        // Add league to store so it shows in the list
        const updatedLeagues = leagues.some(l => l.id === league.id)
          ? leagues : [...leagues, league];
        set({
          pendingLeagueIds: [...pendingLeagueIds, league.id],
          leagues: updatedLeagues,
          currentLeague: league,
          isLoading: false,
        });
      } else {
        await get().loadUserLeagues(userId);
        set({ currentLeague: league, isLoading: false });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join league';
      errorLogService.logError('joinLeagueByCode', error);
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
        const { leagues, pendingLeagueIds } = get();
        const league = leagues.find(l => l.id === leagueId);
        if (league && league.ownerId === userId) {
          throw new Error('Owner cannot leave the league. Delete it instead.');
        }
        set({
          leagues: leagues.filter((l) => l.id !== leagueId),
          pendingLeagueIds: pendingLeagueIds.filter(id => id !== leagueId),
          currentLeague: null,
          isLoading: false,
        });
      } else {
        await leagueService.leaveLeague(leagueId, userId);
        const { leagues, pendingLeagueIds } = get();
        set({
          leagues: leagues.filter((l) => l.id !== leagueId),
          pendingLeagueIds: pendingLeagueIds.filter(id => id !== leagueId),
          currentLeague: null,
          isLoading: false,
        });
      }

      // Clear announcements from the left league
      import('./announcement.store').then(({ useAnnouncementStore }) => {
        const annStore = useAnnouncementStore.getState();
        const filtered = annStore.activeAnnouncements.filter(a => a.leagueId !== leagueId);
        if (filtered.length !== annStore.activeAnnouncements.length) {
          useAnnouncementStore.setState({ activeAnnouncements: filtered });
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to leave league';
      errorLogService.logError('leaveLeague', error);
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
      errorLogService.logError('deleteLeague', error);
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  updateLeagueDetails: async (leagueId, userId, updates) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        const { currentLeague, leagues } = get();
        if (!currentLeague || currentLeague.id !== leagueId) {
          throw new Error('League not found');
        }
        if (currentLeague.ownerId !== userId) {
          throw new Error('Only the owner can edit league details');
        }
        // Check for duplicate name in demo mode
        if (updates.name && updates.name !== currentLeague.name) {
          if (leagues.some(l => l.name === updates.name && l.id !== leagueId)) {
            throw new Error('A league with this name already exists');
          }
        }
        const updatedLeague = {
          ...currentLeague,
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.description !== undefined && { description: updates.description || undefined }),
          updatedAt: new Date(),
        };
        const updatedLeagues = leagues.map(l => l.id === leagueId ? updatedLeague : l);
        set({ currentLeague: updatedLeague, leagues: updatedLeagues, isLoading: false });
        return;
      }

      await leagueService.updateLeagueDetails(leagueId, userId, updates);
      await get().loadLeague(leagueId);
      set({ isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update league details';
      errorLogService.logError('updateLeagueDetails', error);
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
      errorLogService.logError('removeMember', error);
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  inviteMemberByEmail: async (leagueId, email) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        const { currentLeague, demoInviteCounts } = get();
        const maxMembers = currentLeague?.maxMembers || 20;
        const maxInvites = 3 * maxMembers;
        const currentCount = demoInviteCounts[leagueId] || 0;
        if (currentCount >= maxInvites) {
          throw new Error(`Invite limit reached (${maxInvites}). You cannot send more than 3x your league's max members in invitations.`);
        }
        // Simulate sending an invite
        await new Promise((resolve) => setTimeout(resolve, 500));
        set({
          isLoading: false,
          demoInviteCounts: { ...demoInviteCounts, [leagueId]: currentCount + 1 },
        });
        return;
      }

      await leagueService.inviteMemberByEmail(leagueId, email);
      set({ isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send invitation';
      errorLogService.logError('inviteMemberByEmail', error);
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
      errorLogService.logError('promoteToCoAdmin', error);
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
      errorLogService.logError('demoteFromCoAdmin', error);
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  loadPendingMembers: async (leagueId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    try {
      if (isDemoMode) {
        const { demoPendingMembers } = get();
        set({ pendingMembers: demoPendingMembers.filter(m => m.leagueId === leagueId) });
        return;
      }

      const pending = await leagueService.getPendingMembers(leagueId);
      set({ pendingMembers: pending });
    } catch (error) {
      errorLogService.logError('loadPendingMembers', error);
    }
  },

  approveMember: async (leagueId, userId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    try {
      if (isDemoMode) {
        const { demoPendingMembers, currentLeague, leagues } = get();
        const member = demoPendingMembers.find(m => m.leagueId === leagueId && m.userId === userId);
        if (!member) throw new Error('Pending member not found');

        if (currentLeague && currentLeague.memberCount >= currentLeague.maxMembers) {
          throw new Error('League is full. Remove a member before approving.');
        }

        // Remove from demo pending, update member count
        const updatedPending = demoPendingMembers.filter(m => !(m.leagueId === leagueId && m.userId === userId));
        const updatedLeague = currentLeague && currentLeague.id === leagueId
          ? { ...currentLeague, memberCount: currentLeague.memberCount + 1 }
          : currentLeague;
        const updatedLeagues = leagues.map(l => l.id === leagueId && updatedLeague ? updatedLeague : l);

        set({
          demoPendingMembers: updatedPending,
          pendingMembers: updatedPending.filter(m => m.leagueId === leagueId),
          currentLeague: updatedLeague,
          leagues: updatedLeagues,
        });
        return;
      }

      await leagueService.approveMember(leagueId, userId);
      // Reload pending members and league data
      await get().loadPendingMembers(leagueId);
      await get().loadLeague(leagueId);
      await get().loadLeagueMembers(leagueId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve member';
      errorLogService.logError('approveMember', error);
      throw new Error(message);
    }
  },

  rejectMember: async (leagueId, userId) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    try {
      if (isDemoMode) {
        const { demoPendingMembers } = get();
        const updatedPending = demoPendingMembers.filter(m => !(m.leagueId === leagueId && m.userId === userId));
        set({
          demoPendingMembers: updatedPending,
          pendingMembers: updatedPending.filter(m => m.leagueId === leagueId),
        });
        return;
      }

      await leagueService.rejectMember(leagueId, userId);
      await get().loadPendingMembers(leagueId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reject member';
      errorLogService.logError('rejectMember', error);
      throw new Error(message);
    }
  },

  updateLeagueSettings: async (leagueId, settings) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    try {
      if (isDemoMode) {
        const { currentLeague, leagues } = get();
        if (currentLeague && currentLeague.id === leagueId) {
          const updatedLeague = {
            ...currentLeague,
            settings: { ...currentLeague.settings, ...settings },
            updatedAt: new Date(),
          };
          const updatedLeagues = leagues.map(l => l.id === leagueId ? updatedLeague : l);
          set({ currentLeague: updatedLeague, leagues: updatedLeagues });
        }
        return;
      }

      await leagueService.updateLeagueSettings(leagueId, settings);
      await get().loadLeague(leagueId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update settings';
      errorLogService.logError('updateLeagueSettings', error);
      throw new Error(message);
    }
  },

  expandLeagueCapacity: async (leagueId, additionalSlots) => {
    const isDemoMode = useAuthStore.getState().isDemoMode;

    set({ isLoading: true, error: null });
    try {
      if (isDemoMode) {
        const { currentLeague, leagues } = get();
        if (currentLeague && currentLeague.id === leagueId) {
          const updatedLeague = {
            ...currentLeague,
            maxMembers: currentLeague.maxMembers + additionalSlots,
            updatedAt: new Date(),
          };
          const updatedLeagues = leagues.map(l => l.id === leagueId ? updatedLeague : l);
          set({ currentLeague: updatedLeague, leagues: updatedLeagues, isLoading: false });
        } else {
          set({ isLoading: false });
        }
        return;
      }

      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not logged in');
      await leagueService.expandLeagueCapacity(leagueId, user.id, additionalSlots);
      await get().loadLeague(leagueId);
      set({ isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to expand league capacity';
      errorLogService.logError('expandLeagueCapacity', error);
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
    }),
    {
      name: 'league-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the parts worth surviving a restart: the league list and the
      // standings rows. Transient flags, errors and pending-approval state are
      // deliberately excluded so a stale error can't outlive the session, and
      // membersLastFetched is dropped so a fresh launch always revalidates
      // rather than trusting a TTL from a previous run.
      partialize: (state) => ({
        leagues: state.leagues,
        currentLeague: state.currentLeague,
        membersByLeague: state.membersByLeague,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Seed the visible list from the cache for whichever league was open,
        // so the very first paint after launch already has rows.
        const leagueId = state.currentLeague?.id;
        // JSON has no Date type — joinedAt comes back as a string. Restore it
        // so anything reading it gets what the LeagueMember type promises.
        const reviveMember = (m: LeagueMember): LeagueMember => ({
          ...m,
          joinedAt: m.joinedAt instanceof Date ? m.joinedAt : new Date(m.joinedAt as unknown as string),
        });
        state.membersByLeague = Object.fromEntries(
          Object.entries(state.membersByLeague || {}).map(([id, list]) => [
            id,
            (list || []).map(reviveMember),
          ]),
        );
        const cached = leagueId ? state.membersByLeague?.[leagueId] : undefined;
        if (cached && cached.length > 0) state.members = cached;
        state.isLoading = false;
        state.isRefreshingMembers = false;
        state.error = null;
      },
    },
  ),
);
