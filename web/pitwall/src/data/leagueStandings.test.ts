import { describe, expect, it } from 'vitest';
import { buildStandings, exampleStandings, moveLabel, standingsRows, visibleRows, type MemberDoc, type TeamInLeague } from './leagueStandings';

const members: MemberDoc[] = [
  // server ranks count the pending member too (rank 4 here), so movement must come from them, not from the row index
  { id: 'u-bob', displayName: 'Bob', totalPoints: 300, rank: 1, previousRank: 2, lastRacePoints: 40, raceWins: 2 },
  { id: 'u-me', displayName: 'Nathan', totalPoints: 267, rank: 3, previousRank: 1, lastRacePoints: 12, moonshotPoints: 30 },
  { id: 'u-cat', displayName: 'Cat', totalPoints: 267, rank: 2, lastRacePoints: 20 },
  { id: 'u-dan', displayName: 'Dan', totalPoints: 100, rank: 4, previousRank: 4, status: 'pending' },
  { id: 'u-gus', displayName: 'Gus', totalPoints: 95, rank: 5, previousRank: 5, lastRacePoints: 3 },
  { id: 'u-eve', displayName: 'Eve', totalPoints: 90, isWithdrawn: true },
  { id: 'u-fay', totalPoints: 'x' },
];
const teams: TeamInLeague[] = [
  { id: 't1', userId: 'u-bob', name: 'Turn One', moonshotPoints: 0 },
  { id: 't2', userId: 'u-me', name: 'Late Brakers', moonshotPoints: 30 },
];

describe('standingsRows', () => {
  it('orders like the server (total, then last race, then id), ranks by position, and reads movement from the two server ranks', () => {
    const rows = standingsRows(members, teams, 'u-me');
    expect(rows.map((r) => [r.rank, r.team, r.manager, r.points, r.move])).toEqual([
      [1, 'Turn One', 'Bob', 300, 1],          // was 2nd, now 1st
      [2, 'Team', 'Cat', 267, null],           // tied on points, ahead on last race; never ranked before → no arrow
      [3, 'Late Brakers', 'Nathan', 267, -2],  // was 1st
      [4, 'Team', 'Gus', 95, 0],               // shown 4th because the pending member is filtered, but the server has him 5th → 5 − 5 = held, not a fake ▲1
      [5, 'Team', 'Manager', 0, null],         // a malformed doc still gets a row, at the foot
    ]);
    expect(rows.find((r) => r.me)?.userId).toBe('u-me');
    expect(rows.map((r) => r.userId)).not.toContain('u-dan');   // pending
    expect(rows.map((r) => r.userId)).not.toContain('u-eve');   // withdrawn
    expect(rows[2].moonshot).toBe(30);
    expect(rows[0].wins).toBe(2);
    // equal total and equal last race: the id decides, as on the server
    const tied = standingsRows([{ id: 'u-zed', totalPoints: 50, lastRacePoints: 5 }, { id: 'u-amy', totalPoints: 50, lastRacePoints: 5 }], [], null);
    expect(tied.map((r) => r.userId)).toEqual(['u-amy', 'u-zed']);
  });
  it('buildStandings carries the league line and the viewer row', () => {
    const s = buildStandings({ id: 'L1', name: '', maxMembers: 12 }, members, teams, 'u-cat');
    expect([s.name, s.size, s.max, s.me?.rank]).toEqual(['League', 5, 12, 2]);
    expect(standingsRows(members, [...teams, { id: 't9', userId: 'u-bob', name: 'Second Car', moonshotPoints: 0 }], null)[0].team).toBe('Turn One');   // first-seen team for a two-team player
    expect(buildStandings({ id: 'L1', name: 'Sunday Drivers', maxMembers: null }, members, teams, null).me).toBeNull();
  });
});

describe('visibleRows', () => {
  const rows = standingsRows(Array.from({ length: 9 }, (_, i) => ({ id: `u${i}`, totalPoints: 900 - i * 100, rank: i + 1 })), [], 'u7');
  it('collapsed shows the top five plus the viewer when they sit lower; expanded shows all', () => {
    expect(visibleRows(rows, false).map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 8]);
    expect(visibleRows(rows, true).length).toBe(9);
    expect(visibleRows(rows.slice(0, 4), false).length).toBe(4);
    expect(visibleRows(standingsRows(rows.slice(0, 9).map((r) => ({ id: r.userId, totalPoints: r.points })), [], 'u2'), false).map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);   // viewer already in the top five
  });
  it('moveLabel', () => {
    expect([moveLabel(null), moveLabel(0), moveLabel(2), moveLabel(-1)]).toEqual(['', '—', '▲2', '▼1']);
  });
});

describe('exampleStandings', () => {
  it('is the ten-team example league the preview renders, with the viewer second and every name filled', () => {
    const ex = exampleStandings();
    expect([ex.name, ex.size, ex.max, ex.me?.rank, ex.me?.move]).toEqual(['Sunday Drivers', 10, 12, 2, -1]);
    expect(ex.rows.every((r) => r.team && r.manager && r.team !== 'Team' && r.manager !== 'Manager')).toBe(true);
    expect(ex.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
