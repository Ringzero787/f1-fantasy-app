/**
 * Standings cache behaviour in league.store.
 *
 * The screen used to sit blank for 2-3s on every open because members were
 * fetched cold each time. These cover the stale-while-revalidate path that
 * replaced it, and the cross-league leak that caching introduces if the
 * visible list isn't keyed to the league being loaded.
 */

import type { LeagueMember } from '../../src/types';

const getLeagueMembers = jest.fn();

// jest.config.js sets no setupFiles, so the AsyncStorage mock in jest.setup.js
// never loads and the real module reaches for window.localStorage. Mock it here
// rather than rewiring the global config under the existing suites.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => void store.set(k, v)),
      removeItem: jest.fn(async (k: string) => void store.delete(k)),
    },
  };
});

jest.mock('../../src/services/league.service', () => ({
  leagueService: {
    getLeagueMembers: (...args: unknown[]) => getLeagueMembers(...args),
    subscribeToLeagueMembers: jest.fn(() => jest.fn()),
  },
}));
jest.mock('../../src/services/errorLog.service', () => ({
  errorLogService: { logError: jest.fn() },
}));
jest.mock('../../src/store/auth.store', () => ({
  useAuthStore: { getState: () => ({ isDemoMode: false, user: null }) },
}));
jest.mock('../../src/store/team.store', () => ({
  useTeamStore: { getState: () => ({ userTeams: [], currentTeam: null }) },
}));

import { useLeagueStore } from '../../src/store/league.store';

const member = (id: string, points: number): LeagueMember =>
  ({
    id,
    leagueId: 'L',
    userId: `u_${id}`,
    displayName: id,
    teamName: `${id} team`,
    role: 'member',
    totalPoints: points,
    rank: 1,
    joinedAt: new Date('2026-03-01T00:00:00Z'),
    racesPlayed: 1,
    pprAverage: points,
    recentFormPoints: points,
    raceWins: 0,
  }) as LeagueMember;

const reset = () =>
  useLeagueStore.setState({
    members: [],
    membersByLeague: {},
    membersLastFetched: {},
    isLoading: false,
    isRefreshingMembers: false,
    error: null,
    currentLeague: null,
  });

beforeEach(() => {
  getLeagueMembers.mockReset();
  reset();
});

describe('standings cache', () => {
  it('shows a blocking spinner only on the very first load of a league', async () => {
    let seenLoading = false;
    getLeagueMembers.mockImplementation(async () => {
      seenLoading = useLeagueStore.getState().isLoading;
      return [member('a', 10)];
    });

    await useLeagueStore.getState().loadLeagueMembers('L1');

    expect(seenLoading).toBe(true); // nothing to show yet -> spinner is correct
    expect(useLeagueStore.getState().members).toHaveLength(1);
    expect(useLeagueStore.getState().membersByLeague.L1).toHaveLength(1);
  });

  it('keeps the previous rows on screen while refreshing (never blanks)', async () => {
    getLeagueMembers.mockResolvedValueOnce([member('a', 10)]);
    await useLeagueStore.getState().loadLeagueMembers('L1');

    const duringRefresh: Array<{ rows: number; isLoading: boolean; refreshing: boolean }> = [];
    getLeagueMembers.mockImplementation(async () => {
      const s = useLeagueStore.getState();
      duringRefresh.push({
        rows: s.members.length,
        isLoading: s.isLoading,
        refreshing: s.isRefreshingMembers,
      });
      return [member('a', 10), member('b', 20)];
    });

    await useLeagueStore.getState().loadLeagueMembers('L1', true);

    expect(duringRefresh[0].rows).toBe(1);        // stale rows still rendered
    expect(duringRefresh[0].isLoading).toBe(false); // so no blocking spinner
    expect(duringRefresh[0].refreshing).toBe(true); // background refresh instead
    expect(useLeagueStore.getState().members).toHaveLength(2);
  });

  it('does not show one league\'s standings under another league', async () => {
    getLeagueMembers.mockResolvedValueOnce([member('a', 10)]);
    await useLeagueStore.getState().loadLeagueMembers('L1');
    expect(useLeagueStore.getState().members).toHaveLength(1);

    const rowsWhileLoadingL2: number[] = [];
    getLeagueMembers.mockImplementation(async () => {
      rowsWhileLoadingL2.push(useLeagueStore.getState().members.length);
      return [member('z', 99)];
    });

    await useLeagueStore.getState().loadLeagueMembers('L2');

    expect(rowsWhileLoadingL2[0]).toBe(0); // L1's table must be cleared, not shown
    expect(useLeagueStore.getState().members[0].id).toBe('z');
  });

  it('serves a cached league from the TTL path without refetching', async () => {
    getLeagueMembers.mockResolvedValueOnce([member('a', 10)]);
    await useLeagueStore.getState().loadLeagueMembers('L1');

    getLeagueMembers.mockResolvedValueOnce([member('b', 20)]);
    await useLeagueStore.getState().loadLeagueMembers('L2'); // switch away
    getLeagueMembers.mockClear();

    await useLeagueStore.getState().loadLeagueMembers('L1'); // back, within TTL

    expect(getLeagueMembers).not.toHaveBeenCalled();  // served from cache
    expect(useLeagueStore.getState().members[0].id).toBe('a'); // and it's L1's rows
  });

  it('keeps stale rows and stays silent when a refresh fails', async () => {
    getLeagueMembers.mockResolvedValueOnce([member('a', 10)]);
    await useLeagueStore.getState().loadLeagueMembers('L1');

    getLeagueMembers.mockRejectedValueOnce(new Error('offline'));
    await useLeagueStore.getState().loadLeagueMembers('L1', true);

    expect(useLeagueStore.getState().members).toHaveLength(1); // still readable
    expect(useLeagueStore.getState().error).toBeNull();        // no scary banner
  });

  it('surfaces the error when a first load fails with nothing cached', async () => {
    getLeagueMembers.mockRejectedValueOnce(new Error('offline'));
    await useLeagueStore.getState().loadLeagueMembers('L9');

    expect(useLeagueStore.getState().members).toHaveLength(0);
    expect(useLeagueStore.getState().error).toBe('offline');
  });
});
