import { describe, expect, it } from 'vitest';
import { applySwap, bank, briefRecs, compareRows, projected, projectedLineup, rateMyTeam, rivalMove, sameLineup, shortName, shortTeamName, spent, swapPool, swapRecs, topPickRec } from './logic';
import type { Constructor, Driver, Lineup, Payload } from './types';

const D = (id: string, price: number, med: number, extra: Partial<Driver> = {}): Driver => ({ id, num: 1, name: id.toUpperCase(), team: 'T', price, med, floor: med - 5, ceil: med + 5, form: [], dnf: 5, own: 10, pm: 0, cons: 50, dprice: 0, fit: [3], win: 0, pod: 0, t10: 0, ptsRise: Math.ceil(price * 0.011), ptsHold: Math.ceil(price * 0.006), pRise: 50, pFall: 50, q: 0, r: 0, val: +((med / price) * 100).toFixed(1), ...extra });
const C = (id: string, price: number, med: number): Constructor => ({ id, name: id.toUpperCase(), team: id, price, med, floor: med, ceil: med, val: 1, ctor: true });
const payload = (drivers: Driver[], ctors: Constructor[], budget: number): Payload => ({ example: true, asOf: '', round: { number: 1, name: 'Harbour', firstSession: '', locksIn: '', circuit: '' }, rounds: [], budget, teams: { T: { id: 'T', name: 'T', color: '#fff' } }, drivers, constructors: ctors, news: [], rivals: [], league: { name: 'L', size: 2, myRank: 1 } });

const p = payload([D('a', 100, 30), D('b', 100, 20, { dnf: 18 }), D('c', 120, 28), D('d', 300, 60), D('e', 90, 10)], [C('x', 200, 40), C('y', 210, 55), C('z', 900, 99)], 500);
const mine: Lineup = { drivers: ['a', 'b'], ctor: 'x', ace: 'b' };

describe('pit wall lineup logic', () => {
  it('totals the lineup with the Ace doubled, and derives bank and rating', () => {
    expect(projected(p, mine)).toBe(30 + 20 * 2 + 40);
    expect(spent(p, mine)).toBe(400);
    expect(bank(p, mine)).toBe(100);
    expect(rateMyTeam(p, mine)).toBe(Math.round(110 / 3.6));
    expect(sameLineup(mine, { ...mine, drivers: [...mine.drivers] })).toBe(true);
    expect(sameLineup(mine, { ...mine, ace: 'a' })).toBe(false);
  });

  it('recommends only affordable swaps, doubles gains on the Ace slot, best first', () => {
    // d costs 200 more than either driver: outside the 100 bank. c is +20 over a/b.
    expect(swapRecs(p, mine)).toEqual([{ out: 'b', in: 'c', gain: 16, cost: 20 }]);
    expect(swapRecs(payload(p.drivers, p.constructors, 700), mine)[0]).toEqual({ out: 'b', in: 'd', gain: 80, cost: 200 });
  });

  it('builds the briefing list: swap, Ace move, best-value hold, biggest risk, constructor', () => {
    const recs = briefRecs(p, mine);
    expect(recs.map((r) => r.kind)).toEqual(['SWAP', 'ACE', 'HOLD', 'RISK', 'TEAM']);
    expect(recs[1]).toMatchObject({ title: 'Move ace to A', ace: 'a', good: true });
    expect(recs[3]).toMatchObject({ a: 'b', bad: true, tag: '18% DNF' });
    expect(recs[4]).toMatchObject({ act: 'CTOR:y', tag: '+15 PTS' });
    const held = briefRecs(p, { ...mine, ace: 'a', ctor: 'y' });
    expect(held.find((r) => r.kind === 'ACE')?.tag).toBe('HOLD');
    expect(held.find((r) => r.kind === 'TEAM')?.title).toBe('Keep Y');
  });

  it('marks the better value per comparison row, lower is better for risk and price', () => {
    const rows = Object.fromEntries(compareRows(p, 'b', 'c').map((r) => [r.label, r]));
    expect(rows.Projection.winner).toBe('b'); // c (the right-hand side) projects higher
    expect(rows['DNF risk %'].winner).toBe('b');
    expect(rows.Price).toMatchObject({ a: '$100', b: '$120', winner: 'a' });
    expect(rows['League owned %'].winner).toBeNull();
    // constructors have no fit, price-move, risk or ownership rows
    expect(compareRows(p, 'x', 'y').map((r) => r.label)).toEqual(['Projection', 'Floor', 'Ceiling', 'Pts per $100', 'Price']);
  });

  it('predicts a rival\'s best affordable move and tags it against my lineup', () => {
    const active = rivalMove(p, mine, { name: 'R', rank: 1, gap: 5, lineup: ['e'], bank: 40, activity: 0.9 });
    expect(active).toMatchObject({ gain: 20, likely: 90, tag: 'COPIES YOU' });
    expect(active?.in.id).toBe('a');
    const lazy = rivalMove(p, { ...mine, drivers: ['d'] }, { name: 'R', rank: 1, gap: 5, lineup: ['e'], bank: 40, activity: 0.1 });
    expect(lazy).toMatchObject({ likely: 10, tag: 'LOW RISK' });
    expect(rivalMove(p, mine, { name: 'R', rank: 1, gap: 0, lineup: ['nobody'], bank: 0, activity: 1 })).toBeNull();
  });

  it('lists the swap pool for a slot, applies swaps, and the Ace follows the driver', () => {
    expect(swapPool(p, mine, 'b').map((o) => [o.e.id, o.gain])).toEqual([['c', 16], ['e', -20]]);
    expect(swapPool(p, mine, 'CTOR').map((o) => o.e.id)).toEqual(['y']);
    expect(applySwap(mine, 'b:c')).toEqual({ drivers: ['a', 'c'], ctor: 'x', ace: 'c' });
    expect(applySwap(mine, 'CTOR:y').ctor).toBe('y');
    expect(applySwap(mine, 'garbage')).toBe(mine);
    expect(topPickRec(p, mine, 'b')).toMatchObject({ kind: 'TOP PICK', act: 'b:c', good: true });
    expect(topPickRec(p, { ...mine, drivers: ['a', 'c'], ace: 'c' }, 'c')).toMatchObject({ kind: 'BEST ALTERNATIVE', tag: 'HOLD' });
  });
});

describe('a lineup the payload does not fully carry', () => {
  // A real team can hold someone the payload leaves out, and a free-look document publishes a
  // median of zero for everyone outside the top ten. Neither may be added up as a real zero.
  const known = [D('a', 300, 50), D('b', 200, 30)];
  const ctor = C('T', 400, 60);
  const p = payload(known, [ctor], 1000);

  it('reports what it cannot know instead of returning a smaller number', () => {
    const complete = projectedLineup(p, { drivers: ['a', 'b'], ctor: 'T', ace: 'a' });
    expect(complete).toEqual({ points: 50 * 2 + 30 + 60, missing: 0, complete: true });

    const withUnknown = projectedLineup(p, { drivers: ['a', 'ghost'], ctor: 'T', ace: 'a' });
    expect(withUnknown.missing).toBe(1);
    expect(withUnknown.complete).toBe(false);

    const stripped = projectedLineup(payload([D('a', 300, 50), D('b', 200, 0)], [ctor], 1000), { drivers: ['a', 'b'], ctor: 'T', ace: 'a' });
    expect(stripped.missing).toBe(1);
    expect(stripped.complete).toBe(false);
  });

  it('still recommends around the picks it does know, rather than throwing', () => {
    const l = { drivers: ['a', 'ghost'], ctor: 'T', ace: 'a' };
    expect(() => briefRecs(p, l)).not.toThrow();
    expect(() => spent(p, l)).not.toThrow();
    expect(() => swapPool(p, l, 'ghost')).not.toThrow();
    expect(swapPool(p, l, 'ghost')).toEqual([]);
  });

  it('says nothing at all when even the constructor is missing', () => {
    expect(briefRecs(p, { drivers: ['a'], ctor: 'gone', ace: 'a' }).every((r) => r.kind !== 'TEAM')).toBe(true);
  });
});

describe('display names for the real team', () => {
  it('shortens a full driver name to the surname and strips sponsor words from a team', () => {
    expect(shortName('Pierre Gasly')).toBe('Gasly');
    expect(shortName('Gasly')).toBe('Gasly');
    expect(shortTeamName('Aston Martin Aramco Formula One Team')).toBe('Aston Martin');
    expect(shortTeamName('Mercedes-AMG Petronas F1 Team')).toBe('Mercedes');
    // the id wins where we know it: stripping sponsor words alone turns this one into "Bulls"
    expect(shortTeamName('Racing Bulls', 'racing_bulls')).toBe('RB');
    // and the fallback alone no longer mangles it, because Racing only goes from the end
    expect(shortTeamName('Racing Bulls')).toBe('Racing Bulls');
    expect(shortTeamName('Oracle Red Bull Racing')).toBe('Red Bull');
    expect(shortTeamName('Visa Cash App Racing Bulls', 'racing_bulls')).toBe('RB');
    expect(shortTeamName('Aston Martin Aramco F1 Team', 'aston_martin')).toBe('Aston Martin');
  });
});
