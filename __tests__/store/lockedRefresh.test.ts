/**
 * F-136: a team whose stored copy says locked is re-read from the server on My Team focus.
 *
 * The store is local-first: once teams exist, focus does not call loadUserTeams, so a copy
 * taken during a race weekend kept `canModify: false` until a cold start, a pull-to-refresh
 * or a roster write. refreshTeamIfLocked asks the server only while the copy says locked,
 * adopts what comes back, and never flips isLoading (a full-screen spinner on My Team).
 */

import type { FantasyTeam } from '../../src/types';

const getTeamById = jest.fn();
const logError = jest.fn();
let demoMode = false;

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
jest.mock('../../src/services/team.service', () => ({
  teamService: { getTeamById: (...a: unknown[]) => getTeamById(...a) },
}));
jest.mock('../../src/services/errorLog.service', () => ({
  errorLogService: { logError: (...a: unknown[]) => logError(...a) },
}));
jest.mock('../../src/store/auth.store', () => ({
  useAuthStore: { getState: () => ({ isDemoMode: demoMode, user: { id: 'u1' } }) },
}));
jest.mock('../../src/store/admin.store', () => ({
  useAdminStore: { getState: () => ({ raceResults: {}, driverPrices: {}, constructorPrices: {}, getCompletedRaceCount: () => 21 }) },
}));
jest.mock('../../src/store/remoteConfig.store', () => ({
  useRemoteConfigStore: { getState: () => ({ races: [{ id: 'brazil_2026', round: 22, status: 'upcoming' }] }) },
}));

import { useTeamStore } from '../../src/store/team.store';

// `constructor` as a key makes Partial<FantasyTeam> collide with Object's own, hence the loose type.
const team = (over: Record<string, unknown> = {}): FantasyTeam =>
  ({
    id: 'T1', userId: 'u1', leagueId: 'L1', name: 'Team',
    drivers: [], constructor: null, budget: 13, totalSpent: 0, totalPoints: 100, lockedPoints: 0,
    aceDriverId: null, racesSinceTransfer: 0,
    isLocked: true,
    lockStatus: { isSeasonLocked: false, seasonLockRacesRemaining: 0, canModify: false, lockReason: 'Results processed — unlocking soon' },
    createdAt: new Date('2026-03-01T00:00:00Z'), updatedAt: new Date('2026-11-01T18:00:00Z'),
    ...over,
  }) as unknown as FantasyTeam;

const seed = (t: FantasyTeam | null) => useTeamStore.setState({ currentTeam: t, userTeams: t ? [t] : [], isLoading: false, error: null });

beforeEach(() => { getTeamById.mockReset(); logError.mockReset(); demoMode = false; });

describe('refreshTeamIfLocked', () => {
  it('adopts the unlocked server copy when the stored one says locked', async () => {
    seed(team());
    const unlocked = team({ isLocked: false, lockStatus: { isSeasonLocked: false, seasonLockRacesRemaining: 0, canModify: true }, updatedAt: new Date('2026-11-02T05:30:00Z') });
    getTeamById.mockResolvedValue(unlocked);
    const loading: boolean[] = [];
    const unsub = useTeamStore.subscribe((s) => loading.push(s.isLoading));

    await useTeamStore.getState().refreshTeamIfLocked();
    unsub();

    expect(getTeamById).toHaveBeenCalledWith('T1');
    const s = useTeamStore.getState();
    expect(s.currentTeam?.isLocked).toBe(false);
    expect(s.currentTeam?.lockStatus.canModify).toBe(true);
    expect(s.userTeams[0].lockStatus.canModify).toBe(true);
    expect(loading.every((v) => v === false)).toBe(true);
  });
  it('asks when only canModify says locked', async () => {
    seed(team({ isLocked: false }));
    getTeamById.mockResolvedValue(team({ isLocked: false, lockStatus: { isSeasonLocked: false, seasonLockRacesRemaining: 0, canModify: true } }));
    await useTeamStore.getState().refreshTeamIfLocked();
    expect(getTeamById).toHaveBeenCalledTimes(1);
    expect(useTeamStore.getState().currentTeam?.lockStatus.canModify).toBe(true);
  });
  it('does not read an open team, a season-locked team, a missing team or a demo team', async () => {
    seed(team({ isLocked: false, lockStatus: { isSeasonLocked: false, seasonLockRacesRemaining: 0, canModify: true } }));
    await useTeamStore.getState().refreshTeamIfLocked();
    seed(team({ lockStatus: { isSeasonLocked: true, seasonLockRacesRemaining: 3, canModify: false } }));
    await useTeamStore.getState().refreshTeamIfLocked();
    seed(null);
    await useTeamStore.getState().refreshTeamIfLocked();
    demoMode = true;
    seed(team());
    await useTeamStore.getState().refreshTeamIfLocked();
    expect(getTeamById).not.toHaveBeenCalled();
  });
  it('keeps the stored copy when the server still says locked or the read fails', async () => {
    seed(team());
    getTeamById.mockResolvedValue(team());
    await useTeamStore.getState().refreshTeamIfLocked();
    expect(useTeamStore.getState().currentTeam?.lockStatus.canModify).toBe(false);

    getTeamById.mockRejectedValue(new Error('offline'));
    await expect(useTeamStore.getState().refreshTeamIfLocked()).resolves.toBeUndefined();
    expect(useTeamStore.getState().currentTeam?.lockStatus.canModify).toBe(false);
    expect(logError).toHaveBeenCalledWith('refreshTeamIfLocked', expect.any(Error), { teamId: 'T1' });
  });
});
