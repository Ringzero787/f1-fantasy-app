/**
 * F-045: standings follow a live listener and the league list loads
 * stale-while-revalidate.
 *
 * The leagues tab used to run loadUserLeagues (isLoading: true, one pending
 * check per league in series) and then loadLeagueMembers before anything fresh
 * appeared. These cover the seams that replaced it: the listener keys the
 * visible list to its own league before the first snapshot, every snapshot
 * lands in the per-league cache, and a cached league list never flips the
 * spinner on.
 */

import type { LeagueMember } from '../../src/types';

const getLeagueMembers = jest.fn();
const getUserLeagues = jest.fn();
const getPendingMembers = jest.fn();
const subscribeToLeagueMembers = jest.fn();

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
    getUserLeagues: (...args: unknown[]) => getUserLeagues(...args),
    getPendingMembers: (...args: unknown[]) => getPendingMembers(...args),
    subscribeToLeagueMembers: (...args: unknown[]) => subscribeToLeagueMembers(...args),
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

const member = (id: string, points: number, leagueId = 'L'): LeagueMember =>
  ({
    id,
    leagueId,
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

const league = (id: string) => ({ id, name: id, ownerId: 'owner', memberCount: 1 }) as any;

const reset = () =>
  useLeagueStore.setState({
    leagues: [],
    members: [],
    membersByLeague: {},
    membersLastFetched: {},
    pendingLeagueIds: [],
    isLoading: false,
    isRefreshingMembers: false,
    error: null,
    currentLeague: null,
  });

beforeEach(() => {
  getLeagueMembers.mockReset();
  getUserLeagues.mockReset();
  getPendingMembers.mockReset();
  subscribeToLeagueMembers.mockReset();
  reset();
});

describe('live standings listener', () => {
  it('keys the visible table to its own league before the first snapshot (no cross-league leak)', () => {
    const unsub = jest.fn();
    subscribeToLeagueMembers.mockReturnValue(unsub);
    useLeagueStore.setState({
      members: [member('other', 99, 'L2')],
      membersByLeague: { L1: [member('a', 10, 'L1')], L2: [member('other', 99, 'L2')] },
    });

    const stop = useLeagueStore.getState().subscribeToLeagueMembers('L1');

    const s = useLeagueStore.getState();
    expect(s.members.map((m) => m.id)).toEqual(['a']); // the persisted L1 rows, instantly
    expect(s.isRefreshingMembers).toBe(true); // and a refresh is in flight
    expect(subscribeToLeagueMembers).toHaveBeenCalledWith('L1', expect.any(Function), expect.any(Function));
    expect(stop).toBe(unsub);
  });

  it('shows an empty list, never another league, when there is no cache for the league', () => {
    subscribeToLeagueMembers.mockReturnValue(jest.fn());
    useLeagueStore.setState({ members: [member('other', 99, 'L2')], membersByLeague: { L2: [member('other', 99, 'L2')] } });

    useLeagueStore.getState().subscribeToLeagueMembers('L1');

    expect(useLeagueStore.getState().members).toEqual([]);
  });

  it('every snapshot lands in the per-league cache and clears the loading flags', () => {
    let onUpdate: ((rows: LeagueMember[]) => void) | null = null;
    subscribeToLeagueMembers.mockImplementation((_id: string, cb: (rows: LeagueMember[]) => void) => {
      onUpdate = cb;
      return jest.fn();
    });
    useLeagueStore.setState({ isLoading: true });

    useLeagueStore.getState().subscribeToLeagueMembers('L1');
    onUpdate!([member('a', 10, 'L1'), member('b', 20, 'L1')]);

    const s = useLeagueStore.getState();
    expect(s.members.map((m) => m.id)).toEqual(['a', 'b']);
    expect(s.membersByLeague.L1).toHaveLength(2);
    expect(s.membersLastFetched.L1).toBeGreaterThan(0);
    expect(s.isLoading).toBe(false);
    expect(s.isRefreshingMembers).toBe(false);
  });

  it('a fresh snapshot makes the next TTL-guarded fetch a no-op', async () => {
    let onUpdate: ((rows: LeagueMember[]) => void) | null = null;
    subscribeToLeagueMembers.mockImplementation((_id: string, cb: (rows: LeagueMember[]) => void) => {
      onUpdate = cb;
      return jest.fn();
    });
    useLeagueStore.getState().subscribeToLeagueMembers('L1');
    onUpdate!([member('a', 10, 'L1')]);

    await useLeagueStore.getState().loadLeagueMembers('L1');

    expect(getLeagueMembers).not.toHaveBeenCalled();
  });

  it('replaces the previous listener when the league changes', () => {
    const first = jest.fn();
    const second = jest.fn();
    subscribeToLeagueMembers.mockReturnValueOnce(first).mockReturnValueOnce(second);

    useLeagueStore.getState().subscribeToLeagueMembers('L1');
    useLeagueStore.getState().subscribeToLeagueMembers('L2');

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});

describe('league list stale-while-revalidate', () => {
  it('does not flip the spinner on when a league list is already cached', async () => {
    useLeagueStore.setState({ leagues: [league('L1')] });
    let seenLoading: boolean | null = null;
    getUserLeagues.mockImplementation(async () => {
      seenLoading = useLeagueStore.getState().isLoading;
      return [league('L1'), league('L2')];
    });
    getPendingMembers.mockResolvedValue([]);

    await useLeagueStore.getState().loadUserLeagues('u1');

    expect(seenLoading).toBe(false);
    expect(useLeagueStore.getState().leagues.map((l) => l.id)).toEqual(['L1', 'L2']);
  });

  it('still shows the spinner on a cold start with nothing cached', async () => {
    let seenLoading: boolean | null = null;
    getUserLeagues.mockImplementation(async () => {
      seenLoading = useLeagueStore.getState().isLoading;
      return [league('L1')];
    });
    getPendingMembers.mockResolvedValue([]);

    await useLeagueStore.getState().loadUserLeagues('u1');

    expect(seenLoading).toBe(true);
    expect(useLeagueStore.getState().isLoading).toBe(false);
  });

  it('checks pending status for all leagues in parallel, not one after another', async () => {
    getUserLeagues.mockResolvedValue([league('L1'), league('L2'), league('L3')]);
    let inFlight = 0;
    let maxInFlight = 0;
    getPendingMembers.mockImplementation(async (id: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return id === 'L2' ? [{ userId: 'u1' }] : [];
    });

    await useLeagueStore.getState().loadUserLeagues('u1');

    expect(maxInFlight).toBe(3);
    expect(useLeagueStore.getState().pendingLeagueIds).toEqual(['L2']);
  });
});
