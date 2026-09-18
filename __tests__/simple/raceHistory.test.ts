import { teamRaceHistory, historyStats } from '../../src/simple/grid/raceHistory';

const races = [
  { id: 'r1', round: 1, name: 'Opener' },
  { id: 'r2', round: 2, name: 'Second' },
  { id: 'r3', round: 3, name: 'Third' },
];
const results = {
  r3: { isComplete: true, driverResults: [{ driverId: 'a', points: 30 }, { driverId: 'b', points: 12 }], constructorResults: [{ constructorId: 'apex', points: 20 }] },
  r1: { isComplete: true, driverResults: [{ driverId: 'a', points: 10 }], sprintResults: [{ driverId: 'a', points: 5 }], constructorResults: [{ constructorId: 'apex', points: 8 }] },
  r2: { isComplete: false, driverResults: [{ driverId: 'a', points: 99 }] },
};
const team = {
  joinedAtRace: 0,
  drivers: [{ driverId: 'a', shortName: 'AAA' }, { driverId: 'b', shortName: 'BBB', addedAtRace: 2 }],
  constructor: { constructorId: 'apex', name: 'Apex' },
};

describe('teamRaceHistory', () => {
  it('orders completed races by round and applies the tenure gate', () => {
    const h = teamRaceHistory(team, results, races);
    expect(h.map((x) => x.name)).toEqual(['Opener', 'Third']);
    expect(h[0]).toMatchObject({ total: 10 + 5 + 8, drivers: [{ shortName: 'AAA', pts: 15 }], constructor: { name: 'Apex', pts: 8 } });
    // b was added after race 2, so counts in race 3 only
    expect(h[1].drivers).toEqual([{ shortName: 'AAA', pts: 30 }, { shortName: 'BBB', pts: 12 }]);
    expect(h[1].total).toBe(30 + 12 + 20);
  });
  it('handles no team and unknown races', () => {
    expect(teamRaceHistory(null, results, races)).toEqual([]);
    const h = teamRaceHistory({ drivers: [], constructor: null }, { mystery_gp: { isComplete: true } }, []);
    expect(h[0]).toMatchObject({ name: 'mystery gp', total: 0, constructor: null });
  });
  it('derives the stat cards', () => {
    const h = teamRaceHistory(team, results, races);
    expect(historyStats(h, 85)).toEqual({ races: 2, avg: 42.5, best: 62 });
    expect(historyStats(h, 85, 70).best).toBe(70);
    expect(historyStats([], 0)).toEqual({ races: 0, avg: null, best: null });
  });
});
