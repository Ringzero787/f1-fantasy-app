/**
 * F-157: the last-race view and the ▲/▼ trend are scoped to the current season. Before, the latest
 * round across every season won, so in 2027 the view would have sat on Abu Dhabi 2026 (round 25).
 * Rows written before F-168 carry no seasonId; the race id (or the live race list) still says the year.
 */
const getDocs = jest.fn();
const where = jest.fn((field: string, op: string, value: unknown) => ({ where: [field, op, value] }));

jest.mock('../../src/config/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  query: jest.fn((_c: unknown, ...clauses: unknown[]) => ({ clauses })),
  where: (...a: [string, string, unknown]) => where(...a),
  orderBy: jest.fn((f: string, d: string) => ({ orderBy: [f, d] })),
  limit: jest.fn((n: number) => ({ limit: n })),
  getDocs: (...a: unknown[]) => getDocs(...a),
}));

import { raceScoresService, pickSeasonRow } from '../../src/services/raceScores.service';

type Row = { raceId: string; round: number; seasonId?: string | null; entityType?: string; entityId?: string };
const snap = (rows: Row[]) => ({ empty: rows.length === 0, docs: rows.map((r) => ({ data: () => r })) });
type Q = { clauses: Array<{ where?: [string, string, unknown] }> };
const isScoped = (q: Q) => q.clauses.some((c) => c.where?.[0] === 'seasonId');

/** Answer the scoped and unscoped queries separately; `scoped` may be an Error (index not deployed). */
function answer(scoped: Row[] | Error, unscoped: Row[]) {
  getDocs.mockImplementation(async (q: Q) => {
    if (q.clauses.some((c) => c.where?.[0] === 'raceId')) return snap([{ raceId: String(q.clauses[0].where?.[2]), round: 0 }]);
    if (isScoped(q)) { if (scoped instanceof Error) throw scoped; return snap(scoped); }
    return snap(unscoped);
  });
}

beforeEach(() => { jest.clearAllMocks(); });

describe('pickSeasonRow', () => {
  it('takes the highest round of the season and drops other seasons', () => {
    expect(pickSeasonRow([{ raceId: 'abu_dhabi_2026', round: 25 }, { raceId: 'china_2027', round: 2, seasonId: '2027' }], '2027')).toEqual({ raceId: 'china_2027', round: 2, seasonId: '2027' });
    expect(pickSeasonRow([{ raceId: 'abu_dhabi_2026', round: 25 }, null], '2027')).toBeNull();
    expect(pickSeasonRow([null, undefined], '2026')).toBeNull();
  });

  it('reads a row without seasonId by the live race list first, then the race id', () => {
    const odd = { raceId: 'sepang_reinstated', round: 18 };
    expect(pickSeasonRow([odd], '2026')).toBeNull();
    expect(pickSeasonRow([odd], '2026', new Map([['sepang_reinstated', '2026']]))).toBe(odd);
  });
});

describe('getLatestRound (season-scoped)', () => {
  it('in 2027 it does not sit on Abu Dhabi 2026', async () => {
    answer([{ raceId: 'australia_2027', round: 1, seasonId: '2027' }], [{ raceId: 'abu_dhabi_2026', round: 25 }]);
    await expect(raceScoresService.getLatestRound('2027')).resolves.toEqual({ raceId: 'australia_2027', round: 1 });
  });

  it('before 2027 has a scored race it is null, not last season', async () => {
    answer([], [{ raceId: 'abu_dhabi_2026', round: 25, seasonId: '2026' }]);
    await expect(raceScoresService.getLatestRound('2027')).resolves.toBeNull();
  });

  it('in 2026 it still finds rows written before seasonId existed', async () => {
    answer([], [{ raceId: 'qatar_2026', round: 24 }]);
    await expect(raceScoresService.getLatestRound('2026')).resolves.toEqual({ raceId: 'qatar_2026', round: 24 });
  });

  it('a newer unstamped row beats an older stamped one in the same season', async () => {
    answer([{ raceId: 'las_vegas_2026', round: 23, seasonId: '2026' }], [{ raceId: 'qatar_2026', round: 24 }]);
    await expect(raceScoresService.getLatestRound('2026')).resolves.toEqual({ raceId: 'qatar_2026', round: 24 });
  });

  it('works before the season index is deployed (the scoped query fails)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    answer(new Error('FAILED_PRECONDITION: The query requires an index'), [{ raceId: 'qatar_2026', round: 24 }]);
    await expect(raceScoresService.getLatestRound('2026')).resolves.toEqual({ raceId: 'qatar_2026', round: 24 });
    warn.mockRestore();
  });

  it('the scoped query filters on seasonId and orders by round', async () => {
    answer([], []);
    await raceScoresService.getLatestRound('2027');
    expect(where).toHaveBeenCalledWith('seasonId', '==', '2027');
    expect(where).toHaveBeenCalledWith('entityType', '==', 'driver');
  });
});

describe('getPreviousRaceScores (season-scoped)', () => {
  it('the round before round 1 of 2027 is nothing, not Abu Dhabi 2026', async () => {
    answer([], [{ raceId: 'abu_dhabi_2026', round: 25 }]);
    await expect(raceScoresService.getPreviousRaceScores(1, '2027')).resolves.toEqual([]);
  });

  it('finds the previous round of the same season', async () => {
    answer([{ raceId: 'australia_2027', round: 1, seasonId: '2027' }], [{ raceId: 'australia_2026', round: 1 }]);
    const rows = await raceScoresService.getPreviousRaceScores(2, '2027');
    expect(rows[0].raceId).toBe('australia_2027');
    expect(where).toHaveBeenCalledWith('round', '<', 2);
  });
});

describe('getScoresForEntity (season-scoped)', () => {
  it('keeps only the season asked for', async () => {
    getDocs.mockResolvedValue(snap([
      { raceId: 'abu_dhabi_2026', round: 25, entityId: 'norris' },
      { raceId: 'australia_2027', round: 1, entityId: 'norris', seasonId: '2027' },
    ]));
    const rows = await raceScoresService.getScoresForEntity('norris', '2027');
    expect(rows.map((r) => r.raceId)).toEqual(['australia_2027']);
    expect((await raceScoresService.getScoresForEntity('norris')).length).toBe(2);
  });
});
