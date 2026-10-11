/**
 * The cache the round report and the League tab's race table share (F-120). What it must not do
 * is remember an answer that is about to change: a failed read, or a leaderboard that does not
 * exist yet because the recap asked minutes before scoring wrote it.
 */
jest.mock('../../src/services/leagueRaceResults.service', () => ({ getLeagueRaceResult: jest.fn() }));
jest.mock('../../src/services/moonshot.service', () => ({ moonshotService: { leagueActivityForRace: jest.fn() } }));
jest.mock('../../src/store/auth.store', () => ({ useAuthStore: jest.fn() }));
jest.mock('../../src/store/remoteConfig.store', () => ({ useRemoteConfigStore: jest.fn() }));
jest.mock('../../src/store/moonshot.store', () => ({ useMoonshotStore: jest.fn() }));

import { cached, clearRoundReportCache, readLeagueRaceResult } from '../../src/simple/hooks/useRoundReport';
import { getLeagueRaceResult } from '../../src/services/leagueRaceResults.service';

const read = getLeagueRaceResult as jest.Mock;
const board = { raceId: 'r19', entries: [], winners: [] };

beforeEach(() => { read.mockReset(); clearRoundReportCache(); });

describe('one read per league and race', () => {
  it('serves a leaderboard from the first read', async () => {
    read.mockResolvedValue(board);
    expect(await readLeagueRaceResult('L', 'r19')).toBe(board);
    expect(await readLeagueRaceResult('L', 'r19')).toBe(board);
    expect(read).toHaveBeenCalledTimes(1);
    await readLeagueRaceResult('L', 'r18');
    await readLeagueRaceResult('M', 'r19');
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('does not remember that a leaderboard was missing', async () => {
    read.mockResolvedValueOnce(null).mockResolvedValueOnce(board);
    expect(await readLeagueRaceResult('L', 'r19')).toBeNull();
    expect(await readLeagueRaceResult('L', 'r19')).toBe(board);   // scoring wrote it in between
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not remember a failed read, and answers it as nothing rather than throwing', async () => {
    read.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(board);
    expect(await readLeagueRaceResult('L', 'r19')).toBeNull();
    expect(await readLeagueRaceResult('L', 'r19')).toBe(board);
  });

  it('is emptied by a refresh or a sign-out', async () => {
    read.mockResolvedValue(board);
    await readLeagueRaceResult('L', 'r19');
    clearRoundReportCache();
    await readLeagueRaceResult('L', 'r19');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a slow failure does not evict the newer attempt made after a refresh', async () => {
    const store = new Map<string, Promise<string>>();
    let failOld: (e: Error) => void = () => {};
    const old = cached(store, 'k', () => new Promise<string>((_, reject) => { failOld = reject; }), 'none');
    store.clear();                                             // pull to refresh
    const fresh = cached(store, 'k', () => Promise.resolve('new'), 'none');
    failOld(new Error('late'));
    expect(await old).toBe('none');
    expect(await fresh).toBe('new');
    expect(store.get('k')).toBe(fresh);
  });
});
