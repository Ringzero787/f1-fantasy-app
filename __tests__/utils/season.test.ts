/**
 * F-157: the season the app is in. Same rule as the server (functions/src/season/current.ts):
 * the pinned config/app.currentSeason, else the season of the most recent race that has started,
 * else of the next one, else the documented last resort.
 */
import { currentSeasonId, resolveSeasonId, seasonFromRaces, parseSeasonId, rowSeasonId, seasonShape, LAST_RESORT_SEASON_ID } from '../../src/utils/season';

const race = (seasonId: string, iso: string, status = 'upcoming') => ({ seasonId, status, schedule: { race: new Date(iso) } });
const at = (iso: string) => new Date(iso).getTime();

// 2026 ends at Abu Dhabi on 12-06; the 2027 calendar is seeded before the rollover runs.
const CAL = [
  race('2026', '2026-11-22T04:00:00Z', 'completed'),
  race('2026', '2026-12-06T13:00:00Z', 'completed'),
  race('2027', '2027-03-14T05:00:00Z'),
  race('2027', '2027-03-21T07:00:00Z'),
];

describe('parseSeasonId', () => {
  it('accepts a 4-digit string or an integer year, nothing else', () => {
    expect(parseSeasonId('2027')).toBe('2027');
    expect(parseSeasonId(2027)).toBe('2027');
    for (const junk of ['27', '2027a', ' 2027', '', null, undefined, 2027.5, {}, true]) expect(parseSeasonId(junk)).toBeNull();
  });
});

describe('currentSeasonId', () => {
  it('a valid pinned season wins over the calendar', () => {
    expect(currentSeasonId(CAL, at('2026-12-20T00:00:00Z'), '2027')).toBe('2027');
    expect(currentSeasonId([], at('2026-12-20T00:00:00Z'), '2027')).toBe('2027');
  });

  it('a junk pin is ignored and the calendar decides', () => {
    expect(currentSeasonId(CAL, at('2026-11-30T00:00:00Z'), '27')).toBe('2026');
    expect(currentSeasonId(CAL, at('2026-11-30T00:00:00Z'), { year: 2027 })).toBe('2026');
  });

  it('mid-season: the season of the most recent race that has started', () => {
    expect(currentSeasonId(CAL, at('2026-11-30T00:00:00Z'))).toBe('2026');
  });

  it('off-season before the rollover: still the finished season, not the next opener', () => {
    // the next race to run is 2027's, but the game is still in 2026 until the rollover pins 2027
    expect(currentSeasonId(CAL, at('2027-01-15T00:00:00Z'))).toBe('2026');
  });

  it('off-season after the rollover: the pin says 2027 before any 2027 race has run', () => {
    expect(currentSeasonId(CAL, at('2027-01-15T00:00:00Z'), '2027')).toBe('2027');
  });

  it('once 2027 has started the calendar alone says 2027', () => {
    expect(currentSeasonId(CAL, at('2027-03-15T00:00:00Z'))).toBe('2027');
  });

  it('before any race has started: the season of the earliest race to come', () => {
    expect(seasonFromRaces(CAL.slice(2), at('2027-01-01T00:00:00Z'))).toBe('2027');
  });

  it('cancelled and undated races and junk season ids do not count', () => {
    const cal = [
      { seasonId: '2027', status: 'cancelled', schedule: { race: new Date('2027-03-01T00:00:00Z') } },
      { seasonId: '2028', status: 'upcoming', schedule: null },
      { seasonId: 'x', status: 'completed', schedule: { race: new Date('2027-03-02T00:00:00Z') } },
      race('2026', '2026-12-06T13:00:00Z', 'completed'),
    ];
    expect(currentSeasonId(cal, at('2027-03-10T00:00:00Z'))).toBe('2026');
  });

  it('reads Firestore Timestamps and ISO strings', () => {
    const ts = { seasonId: '2027', status: 'completed', schedule: { race: { toMillis: () => at('2027-03-14T05:00:00Z') } } };
    const iso = { seasonId: '2026', status: 'completed', schedule: { race: '2026-12-06T13:00:00Z' } };
    expect(currentSeasonId([iso, ts], at('2027-03-20T00:00:00Z'))).toBe('2027');
  });

  it('nothing available: null, so callers can tell', () => {
    expect(currentSeasonId([], Date.now())).toBeNull();
    expect(currentSeasonId([], Date.now(), null)).toBeNull();
  });
});

describe('resolveSeasonId (never null)', () => {
  it('nothing available: the one documented last resort', () => {
    expect(resolveSeasonId([], Date.now())).toBe(LAST_RESORT_SEASON_ID);
    expect(resolveSeasonId([], Date.now(), 'junk')).toBe(LAST_RESORT_SEASON_ID);
    expect(LAST_RESORT_SEASON_ID).toMatch(/^\d{4}$/);
  });

  it('otherwise the same answer as currentSeasonId', () => {
    expect(resolveSeasonId(CAL, at('2027-01-15T00:00:00Z'), '2027')).toBe('2027');
    expect(resolveSeasonId(CAL, at('2027-01-15T00:00:00Z'))).toBe('2026');
  });
});

describe('rowSeasonId', () => {
  it('its own seasonId, else the race list, else the year in the race id', () => {
    expect(rowSeasonId({ seasonId: '2027', raceId: 'abu_dhabi_2026' })).toBe('2027');
    expect(rowSeasonId({ raceId: 'odd' }, new Map([['odd', '2026']]))).toBe('2026');
    expect(rowSeasonId({ raceId: 'abu_dhabi_2026' })).toBe('2026');
    expect(rowSeasonId({ raceId: '2027_australia' })).toBe('2027');
    expect(rowSeasonId({ raceId: 'r20270' })).toBeNull();
    expect(rowSeasonId({})).toBeNull();
  });
});

describe('seasonShape (no bundled round count or sprint list)', () => {
  const r = (seasonId: string, round: number, hasSprint = false, status = 'upcoming') => ({ seasonId, round, hasSprint, status });
  it("reads the season's highest round, races that run and sprint rounds off the calendar", () => {
    const cal = [r('2026', 25), r('2026', 4, false, 'cancelled'), r('2026', 2, true), r('2027', 1), r('2027', 3, true), r('2027', 2, true), r('2027', 0, true)];
    expect(seasonShape(cal, '2027')).toEqual({ totalRounds: 3, raceCount: 3, sprintRounds: [2, 3] });
    expect(seasonShape(cal, '2026')).toEqual({ totalRounds: 25, raceCount: 2, sprintRounds: [2] });
    expect(seasonShape([], '2027')).toEqual({ totalRounds: 0, raceCount: 0, sprintRounds: [] });
  });
});
