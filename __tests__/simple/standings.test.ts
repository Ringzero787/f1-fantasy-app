import { rankStandings, playersCaption, profileStatusLine } from '../../src/simple/grid/standings';

const members = [
  { userId: 'u1', displayName: 'Marco V.', teamName: 'Apex Predators', totalPoints: 1284, lastRacePoints: 86, rank: 1, previousRank: 2 },
  { userId: 'u2', displayName: 'Sonia R.', teamName: 'Late Brakers', totalPoints: 1251, lastRacePoints: 71, rank: 2, previousRank: 1 },
  { userId: 'u3', displayName: 'Dev K.', teamName: 'DRS Enjoyers', totalPoints: 1190, lastRacePoints: 94, rank: 3 },
  { userId: 'u4', displayName: 'Gone', teamName: 'Old', totalPoints: 9999, lastRacePoints: 0, isWithdrawn: true },
];

describe('rankStandings', () => {
  it('ranks by season points with leader gap, own row and movement', () => {
    const rows = rankStandings(members, 'season', 'u1');
    expect(rows.map((r) => r.userId)).toEqual(['u1', 'u2', 'u3']);
    expect(rows[0]).toMatchObject({ rankLabel: '01', shown: '1,284', delta: 'LEADER', isLeader: true, isMe: true, movement: '▲ 1', movementDir: 'up' });
    expect(rows[1]).toMatchObject({ rankLabel: '02', delta: '-33', isMe: false, movement: '▼ 1', movementDir: 'down' });
    expect(rows[2]).toMatchObject({ movement: '—', movementDir: 'flat' });
  });
  it('re-ranks by the last race and hides movement', () => {
    const rows = rankStandings(members, 'last', 'u1');
    expect(rows.map((r) => r.userId)).toEqual(['u3', 'u1', 'u2']);
    expect(rows[0]).toMatchObject({ shown: '+94', delta: 'LEADER', movement: '—' });
    expect(rows[1]).toMatchObject({ shown: '+86', delta: '-8' });
  });
  it('uses server ranks for movement so a withdrawn member above you adds no phantom arrow', () => {
    const rows = rankStandings([
      { userId: 'gone', displayName: 'Gone', totalPoints: 900, lastRacePoints: 0, rank: 1, previousRank: 1, isWithdrawn: true },
      { userId: 'me', displayName: 'Me', totalPoints: 800, lastRacePoints: 10, rank: 2, previousRank: 2 },
    ], 'season', 'me');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rank: 1, movement: '—', movementDir: 'flat' });
  });
  it('breaks ties by last race then user id', () => {
    const rows = rankStandings([
      { userId: 'b', displayName: 'B', totalPoints: 10, lastRacePoints: 5 },
      { userId: 'a', displayName: 'A', totalPoints: 10, lastRacePoints: 5 },
      { userId: 'c', displayName: 'C', totalPoints: 10, lastRacePoints: 9 },
    ], 'season', null);
    expect(rows.map((r) => r.userId)).toEqual(['c', 'a', 'b']);
    expect(rows.every((r) => !r.isMe)).toBe(true);
  });
  it('captions and status lines', () => {
    expect(playersCaption(6)).toBe('6 PLAYERS');
    expect(playersCaption(1)).toBe('1 PLAYER');
    expect(playersCaption(3, 22)).toBe('3 / 22 PLAYERS');
    expect(profileStatusLine(1, 'Paddock Pals')).toBe('P1 · PADDOCK PALS');
    expect(profileStatusLine(null, 'Paddock Pals')).toBe('PADDOCK PALS');
    expect(profileStatusLine(3, null)).toBe('RACING SOLO');
  });
});
