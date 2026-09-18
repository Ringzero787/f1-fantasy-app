/**
 * Race scores store: the Team grid needs the last two scored rounds, and
 * mounting the screen repeatedly must not re-read Firestore every time.
 */
const getLatestRound = jest.fn();
const getScoresForRace = jest.fn();
const getPreviousRaceScores = jest.fn();

jest.mock('../../src/services/raceScores.service', () => ({
  raceScoresService: {
    getLatestRound: (...a: unknown[]) => getLatestRound(...a),
    getScoresForRace: (...a: unknown[]) => getScoresForRace(...a),
    getPreviousRaceScores: (...a: unknown[]) => getPreviousRaceScores(...a),
    getScoresForEntity: jest.fn(),
  },
}));

import { useRaceScoresStore } from '../../src/store/raceScores.store';

const score = (raceId: string, round: number, entityId: string, totalPoints: number) => ({
  raceId, round, entityId, entityType: 'driver', racePoints: totalPoints, sprintPoints: 0, qualiPoints: 0, totalPoints,
});

beforeEach(() => {
  jest.clearAllMocks();
  useRaceScoresStore.setState({ lastRaceScores: {}, prevRaceScores: {}, lastRaceId: null, prevRaceId: null, lastFetched: null, isLoading: false });
});

describe('fetchLastRaceScores', () => {
  it('maps the last and previous rounds by entity', async () => {
    getLatestRound.mockResolvedValue({ raceId: 'baku_2026', round: 17 });
    getScoresForRace.mockResolvedValue([score('baku_2026', 17, 'norris', 25), score('baku_2026', 17, 'mclaren', 43)]);
    getPreviousRaceScores.mockResolvedValue([score('monza_2026', 16, 'norris', 18)]);

    await useRaceScoresStore.getState().fetchLastRaceScores();

    const s = useRaceScoresStore.getState();
    expect(s.lastRaceId).toBe('baku_2026');
    expect(s.prevRaceId).toBe('monza_2026');
    expect(s.lastRaceScores.norris.totalPoints).toBe(25);
    expect(s.lastRaceScores.mclaren.totalPoints).toBe(43);
    expect(s.prevRaceScores.norris.totalPoints).toBe(18);
    expect(getPreviousRaceScores).toHaveBeenCalledWith(17);
    expect(s.isLoading).toBe(false);
  });

  it('skips the read inside the freshness window unless forced', async () => {
    getLatestRound.mockResolvedValue({ raceId: 'baku_2026', round: 17 });
    getScoresForRace.mockResolvedValue([]);
    getPreviousRaceScores.mockResolvedValue([]);

    await useRaceScoresStore.getState().fetchLastRaceScores();
    await useRaceScoresStore.getState().fetchLastRaceScores();
    expect(getLatestRound).toHaveBeenCalledTimes(1);

    await useRaceScoresStore.getState().fetchLastRaceScores(true);
    expect(getLatestRound).toHaveBeenCalledTimes(2);
  });

  it('clears everything when nothing has been scored yet', async () => {
    useRaceScoresStore.setState({ lastRaceScores: { x: score('a', 1, 'x', 1) as never }, lastRaceId: 'a' });
    getLatestRound.mockResolvedValue(null);
    await useRaceScoresStore.getState().fetchLastRaceScores();
    const s = useRaceScoresStore.getState();
    expect(s.lastRaceId).toBeNull();
    expect(s.lastRaceScores).toEqual({});
    expect(getScoresForRace).not.toHaveBeenCalled();
  });

  it('recovers from a failed read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    getLatestRound.mockRejectedValue(new Error('offline'));
    await useRaceScoresStore.getState().fetchLastRaceScores();
    expect(useRaceScoresStore.getState().isLoading).toBe(false);
    expect(useRaceScoresStore.getState().lastFetched).toBeNull();
    warn.mockRestore();
  });
});
