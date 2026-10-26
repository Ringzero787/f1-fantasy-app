// F-129: the running score as the Team screen shows it — one number per tile, Ace doubled, summed for the stat row.
import { rosterLiveScore, signedScore, tileLiveScore } from '../../src/simple/grid/liveScore';
import type { GridTile } from '../../src/simple/grid/tileState';

const trend = { trend: 'flat' as const, glyph: '–', last: null, delta: null } as GridTile extends { trend: infer T } ? T : never;
const dots = { dots: [] } as unknown as Extract<GridTile, { kind: 'driver' }>['dots'];
const driver = (id: string, over: Partial<Extract<GridTile, { kind: 'driver' }>> = {}): GridTile =>
  ({ kind: 'driver', id, name: id, nameSize: 19, tag: '', constructorId: 'mclaren', pts: 0, auto: false, ace: false, aceEligible: true, dots, trend, ...over });
const ctor = (id: string, over: Partial<Extract<GridTile, { kind: 'constructor' }>> = {}): GridTile =>
  ({ kind: 'constructor', id, name: id, nameSize: 19, constructorId: id, pts: 0, auto: false, ace: false, aceEligible: true, dots, trend, ...over });

const running = { drivers: { norris: 69, hadjar: -3 }, constructors: { mclaren: 125 } };

describe('tileLiveScore', () => {
  it('reads a driver from drivers and a constructor from constructors, and keeps a negative', () => {
    expect(tileLiveScore(driver('norris'), running)).toBe(69);
    expect(tileLiveScore(driver('hadjar'), running)).toBe(-3);
    expect(tileLiveScore(ctor('mclaren'), running)).toBe(125);
  });
  it('doubles the Ace only when the pick may be Ace', () => {
    expect(tileLiveScore(driver('norris', { ace: true }), running)).toBe(138);
    expect(tileLiveScore(driver('norris', { ace: true, aceEligible: false }), running)).toBe(69);   // over the cap: the server would refuse the Ace too
    expect(tileLiveScore(ctor('mclaren', { ace: true }), running)).toBe(250);
  });
  it('is null for an open slot, a pick the sweep has not seen, or no running score yet', () => {
    expect(tileLiveScore({ kind: 'empty', slot: 'driver' }, running)).toBeNull();
    expect(tileLiveScore(driver('ghost'), running)).toBeNull();
    expect(tileLiveScore(driver('norris'), null)).toBeNull();
  });
});

describe('rosterLiveScore', () => {
  it('sums what the tiles show, so the stat row and the tiles never disagree', () => {
    const tiles = [driver('norris', { ace: true }), driver('hadjar'), ctor('mclaren'), { kind: 'empty', slot: 'driver' } as GridTile];
    expect(rosterLiveScore(tiles, running)).toBe(138 - 3 + 125);
  });
  it('is null until one pick has a number', () => {
    expect(rosterLiveScore([driver('ghost')], running)).toBeNull();
    expect(rosterLiveScore([driver('norris')], null)).toBeNull();
    expect(rosterLiveScore([], running)).toBeNull();
  });
});

it('signedScore writes a race score the way the stat row does', () => {
  expect([signedScore(34), signedScore(-3), signedScore(0)]).toEqual(['+34', '-3', '0']);
});
