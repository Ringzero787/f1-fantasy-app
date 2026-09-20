import { raceOptions, raceResultRows, shortRaceName, teamLineWithWins } from '../../src/simple/grid/raceLeaderboard';

const R = (id: string, round: number, name: string, status: string, seasonId = '2026') => ({ id, round, name, status, seasonId });

describe('race leaderboard', () => {
  it('lists the latest season\'s completed races, newest first, with short labels', () => {
    const opts = raceOptions([R('a', 1, 'Northern Grand Prix', 'completed'), R('c', 3, 'Coastal Grand Prix', 'upcoming'), R('b', 2, 'Harbour GRAND PRIX', 'completed'), R('old', 9, 'Old Grand Prix', 'completed', '2025')]);
    expect(opts).toEqual([{ raceId: 'b', round: 2, label: 'RD 2 · HARBOUR' }, { raceId: 'a', round: 1, label: 'RD 1 · NORTHERN' }]);
    expect(shortRaceName('Grand Prix')).toBe('Grand Prix');
    // with the league's raceResultIds, only races that have a leaderboard are offered
    expect(raceOptions([R('a', 1, 'Northern Grand Prix', 'completed'), R('b', 2, 'Harbour Grand Prix', 'completed')], ['a']).map((o) => o.raceId)).toEqual(['a']);
    expect(raceOptions([R('a', 1, 'Northern Grand Prix', 'completed')], [])).toEqual([]);
  });

  it('turns a result into table rows: winners marked, gaps to the top, my row flagged', () => {
    const rows = raceResultRows({ raceId: 'b', winners: ['u1', 'u2'], entries: [
      { userId: 'u1', displayName: 'Avery', teamName: 'Box Box', points: 88, rank: 1 },
      { userId: 'u2', displayName: null, teamName: null, points: 88, rank: 1 },
      { userId: 'u3', displayName: 'Casey', points: -4, rank: 3 },
    ] }, 'u3');
    expect(rows.map((r) => [r.rankLabel, r.name, r.shown, r.delta, r.isLeader, r.isMe])).toEqual([
      ['01', 'Avery', '+88', 'WINNER', true, false],
      ['01', 'Player', '+88', 'WINNER', true, false],
      ['03', 'Casey', '-4', '-92', false, true],
    ]);
    expect(rows.every((r) => r.movement === '—')).toBe(true);
  });

  it('a weekend with no winner shows no WINNER tag, and missing data gives no rows', () => {
    const rows = raceResultRows({ raceId: 'x', winners: [], entries: [{ userId: 'u1', points: 0, rank: 1 }, { userId: 'u2', points: 0, rank: 1 }] }, null);
    expect(rows.map((r) => r.delta)).toEqual(['—', '—']);
    expect(raceResultRows(null, 'u1')).toEqual([]);
    expect(raceResultRows({ raceId: 'x', winners: [], entries: undefined as never }, 'u1')).toEqual([]);
  });

  it('adds race wins to the team line only when there are some', () => {
    expect(teamLineWithWins('Late Brakers', 2)).toBe('Late Brakers · 2 WINS');
    expect(teamLineWithWins('Late Brakers', 1)).toBe('Late Brakers · 1 WIN');
    expect(teamLineWithWins('', 3)).toBe('3 WINS');
    expect(teamLineWithWins('Late Brakers', 0)).toBe('Late Brakers');
    expect(teamLineWithWins('Late Brakers', undefined)).toBe('Late Brakers');
  });
});
