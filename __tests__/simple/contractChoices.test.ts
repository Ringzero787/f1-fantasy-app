// F-169: the picker offers only the contract lengths the server will give.
import { contractChoices, contractLimit, priorStreak, seasonClock } from '../../src/simple/grid/contractChoices';
import { rowAvailability } from '../../src/simple/grid/pickerArithmetic';

const race = (seasonId: string, status: 'upcoming' | 'completed' | 'cancelled' | 'in_progress', iso: string) =>
  ({ seasonId, status, schedule: { race: new Date(iso) } });

// Late 2026 as production has it: Vegas done, Qatar and Abu Dhabi to run, Saudi cancelled; 2027 seeded.
const CAL = [
  race('2026', 'completed', '2026-11-22T06:00:00Z'),
  race('2026', 'completed', '2026-11-08T17:00:00Z'),
  race('2026', 'cancelled', '2026-04-19T17:00:00Z'),
  race('2026', 'upcoming', '2026-11-29T16:00:00Z'),
  race('2026', 'upcoming', '2026-12-06T13:00:00Z'),
  race('2027', 'upcoming', '2027-03-07T05:00:00Z'),
];

describe('seasonClock', () => {
  it('counts this season only: the 2027 opener is not a race left in 2026', () => {
    expect(seasonClock(CAL, Date.parse('2026-11-23T00:00:00Z'))).toEqual({ season: '2026', completed: 2, racesLeft: 2 });
  });
  it('before any race has started, the season of the next one', () => {
    expect(seasonClock([race('2027', 'upcoming', '2027-03-07T05:00:00Z')], Date.parse('2027-01-01T00:00:00Z'))?.racesLeft).toBe(1);
  });
  it('the season the rollover pinned wins over the calendar (off-season after the rollover)', () => {
    // Abu Dhabi done, 2027 pinned, the opener not yet run: 2027 with its races left, not 2026 with none
    const cal = [...CAL.slice(0, 3), race('2026', 'completed', '2026-11-29T16:00:00Z'), race('2026', 'completed', '2026-12-06T13:00:00Z'), CAL[5], race('2027', 'upcoming', '2027-03-14T05:00:00Z')];
    expect(seasonClock(cal, Date.parse('2027-01-10T00:00:00Z'))).toEqual({ season: '2026', completed: 4, racesLeft: 0 });
    expect(seasonClock(cal, Date.parse('2027-01-10T00:00:00Z'), '2027')).toEqual({ season: '2027', completed: 0, racesLeft: 2 });
    expect(seasonClock(cal, Date.parse('2027-01-10T00:00:00Z'), 'junk')?.season).toBe('2026');
  });
  it('no dated races: null (the sheet then offers up to six)', () => {
    expect(seasonClock([], Date.now())).toBeNull();
  });
});

describe('contractLimit', () => {
  it('two races left: at most two, and says why', () => {
    expect(contractLimit(2)).toEqual({ max: 2, why: '2 RACES LEFT THIS SEASON' });
    expect(contractLimit(1)).toEqual({ max: 1, why: '1 RACE LEFT THIS SEASON' });
  });
  it('mid-season: six, no note', () => {
    expect(contractLimit(14)).toEqual({ max: 6, why: null });
    expect(contractLimit(null)).toEqual({ max: 6, why: null });
  });
  it('a re-bought driver keeps the run', () => {
    expect(contractLimit(14, 4)).toEqual({ max: 2, why: 'ON YOUR TEAM 4 RACES IN A ROW · 2 MORE AT MOST' });
    expect(contractLimit(14, 6)).toEqual({ max: 0, why: '6 RACES IN A ROW · BACK AFTER THE NEXT RACE' });
  });
  it('whichever is tighter wins', () => {
    expect(contractLimit(1, 4).max).toBe(1);
    expect(contractLimit(1, 4).why).toBe('1 RACE LEFT THIS SEASON');
  });
});

describe('contractChoices', () => {
  it('lists 1..max and starts on the default when it fits', () => {
    expect(contractChoices({ max: 6, why: null }, 3)).toEqual({ choices: [1, 2, 3, 4, 5, 6], initial: 3 });
  });
  it('starts on the longest allowed when the default does not fit', () => {
    expect(contractChoices({ max: 2, why: 'x' }, 3)).toEqual({ choices: [1, 2], initial: 2 });
  });
});

describe('priorStreak', () => {
  it('carries only within the window it was sold in', () => {
    const s = { verstappen: { held: 4, atRace: 21 } };
    expect(priorStreak(s, 'verstappen', 21)).toBe(4);
    expect(priorStreak(s, 'verstappen', 22)).toBe(0);
    expect(priorStreak(undefined, 'verstappen', 21)).toBe(0);
    expect(priorStreak({}, 'toString', 21)).toBe(0);
  });
});

describe('rowAvailability: the six-in-a-row lock-out', () => {
  it('blocks the row with its own reason', () => {
    const a = rowAvailability({ kind: 'driver', price: 10, bank: 100, reserve: 0, selected: false, owned: false, streakFull: true });
    expect(a.blocked).toBe(true);
    expect(a.reason).toBe('6 RACES IN A ROW ON YOUR TEAM · BACK AFTER THE NEXT RACE');
  });
});
