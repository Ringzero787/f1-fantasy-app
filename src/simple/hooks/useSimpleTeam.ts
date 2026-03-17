import { useMemo } from 'react';
import { useTeamStore } from '../../store/team.store';
import { useAuthStore } from '../../store/auth.store';
import { BUDGET, TEAM_SIZE } from '../../config/constants';
import type { FantasyTeam } from '../../types';

const MAX_TEAMS = 2;

/**
 * Simplified team hook for Undercut Simple.
 * Supports up to 2 teams with a toggle.
 */
export function useSimpleTeam() {
  const user = useAuthStore((s) => s.user);
  const userTeams = useTeamStore((s) => s.userTeams);
  const currentTeam = useTeamStore((s) => s.currentTeam);
  const selectTeam = useTeamStore((s) => s.selectTeam);
  const createTeamStore = useTeamStore((s) => s.createTeam);
  const addDriver = useTeamStore((s) => s.addDriver);
  const removeDriver = useTeamStore((s) => s.removeDriver);
  const setConstructor = useTeamStore((s) => s.setConstructor);
  const removeConstructor = useTeamStore((s) => s.removeConstructor);
  const setAce = useTeamStore((s) => s.setAce);
  const setAceConstructor = useTeamStore((s) => s.setAceConstructor);
  const clearAce = useTeamStore((s) => s.clearAce);
  const loadUserTeams = useTeamStore((s) => s.loadUserTeams);
  const syncToFirebase = useTeamStore((s) => s.syncToFirebase);
  const assignTeamToLeague = useTeamStore((s) => s.assignTeamToLeague);
  const updateTeamName = useTeamStore((s) => s.updateTeamName);

  // Always use the current team, or fall back to first team
  const team: FantasyTeam | null = useMemo(() => {
    if (currentTeam) return currentTeam;
    if (userTeams.length > 0) {
      selectTeam(userTeams[0].id);
      return userTeams[0];
    }
    return null;
  }, [currentTeam, userTeams]);

  const teamConstructor = useMemo(() => {
    if (!team) return null;
    const c = (team as Record<string, any>)['constructor'];
    return typeof c === 'object' && c !== null ? c : null;
  }, [team]);

  const driversCount = team?.drivers?.length ?? 0;
  const isFull = driversCount === TEAM_SIZE && !!teamConstructor;
  const budget = team?.budget ?? BUDGET;

  // Multi-team support (max 2)
  const teamCount = userTeams.length;
  const canCreateSecondTeam = teamCount < MAX_TEAMS;
  const activeTeamIndex = useMemo(() => {
    if (!team) return 0;
    const idx = userTeams.findIndex(t => t.id === team.id);
    return idx >= 0 ? idx : 0;
  }, [team, userTeams]);

  return {
    team,
    teamConstructor,
    driversCount,
    isFull,
    budget,
    hasTeam: !!team,
    userId: user?.id ?? null,

    // Multi-team
    teamCount,
    activeTeamIndex,
    canCreateSecondTeam,
    maxTeams: MAX_TEAMS,
    switchTeam: (index: number) => {
      if (index >= 0 && index < userTeams.length) {
        selectTeam(userTeams[index].id);
      }
    },

    // Team creation
    createTeam: async (name: string, leagueCode?: string) => {
      if (!user) throw new Error('Not authenticated');
      if (userTeams.length >= MAX_TEAMS) throw new Error('Maximum 2 teams');
      const newTeam = await createTeamStore(user.id, null, name);
      await syncToFirebase();
      return newTeam;
    },

    // Driver management
    addDriver,
    removeDriver,
    setConstructor,
    removeConstructor,

    // Ace management
    setAce,
    setAceConstructor,
    clearAce,

    // Team management
    updateTeamName,

    // League
    assignTeamToLeague,

    // Sync
    loadUserTeams: () => user ? loadUserTeams(user.id) : Promise.resolve(),
    syncToFirebase,
  };
}
