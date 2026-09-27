import { describe, expect, it } from 'vitest';
import { withLeague, type LeagueDoc } from './league';
import { examplePayload } from './example';

const doc: LeagueDoc = { leagueId: 'L', round: 17, name: 'Sunday Drivers', size: 3, ownership: { norris: 67, verstappen: 33 },
  teams: [{ id: 't2', name: 'Turn One', rank: 1, points: 300, bank: 120, activity: 0.9, lineup: { drivers: ['verstappen'], ctor: 'x', ace: '' } },
          { id: 'me', name: 'Late Brakers', rank: 2, points: 267, bank: 50, activity: 1, lineup: { drivers: ['norris'], ctor: 'x', ace: 'norris' } },
          { id: 't3', name: 'Backmarkers', rank: 3, points: 200, bank: 90, activity: 0.3, lineup: { drivers: ['norris'], ctor: 'y', ace: '' } }] };

describe('withLeague', () => {
  const real = { ...examplePayload(), example: false };
  it('fills the league line, the rivals with their gap to me, and ownership', () => {
    const p = withLeague(real, doc, 'me');
    expect(p.league).toEqual({ name: 'Sunday Drivers', size: 3, myRank: 2 });
    expect(p.rivals.map((r) => [r.name, r.gap])).toEqual([['Turn One', 33], ['Backmarkers', -67]]);
    expect(p.drivers.find((d) => d.id === 'norris')?.own).toBe(67);
    expect(p.drivers.find((d) => d.id === 'hamilton')?.own).toBe(0);
  });
  it('ignores a document for another round, and never touches the example set', () => {
    expect(withLeague(real, { ...doc, round: 16 }, 'me')).toBe(real);
    const ex = examplePayload();
    expect(withLeague(ex, doc, 'me')).toBe(ex);
  });
});
