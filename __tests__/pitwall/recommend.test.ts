import { bestPick, bestValuePick, valueOf } from '../../src/pitwall/recommend';
import { passFromClaims, NO_PASS } from '../../src/pitwall/pass';
import { toProjectionSet } from '../../src/pitwall/projections';
import type { Projection } from '../../src/pitwall/projections';

const P = (id: string, med: number): Projection => ({ id, med, floor: med - 8, ceil: med + 12, dnf: 12, ptsRise: 4 });
const byId = (...ps: Projection[]): Record<string, Projection> => Object.fromEntries(ps.map((p) => [p.id, p]));

describe('bestPick', () => {
  const projections = byId(P('a', 58), P('b', 52), P('c', 30));

  it('picks the highest projection the team can actually take', () => {
    const pick = bestPick([
      { id: 'a', price: 400, selected: false, blocked: true }, // cannot afford
      { id: 'b', price: 300, selected: false, blocked: false },
      { id: 'c', price: 100, selected: false, blocked: false },
    ], projections);
    expect(pick).toEqual({ id: 'b', med: 52, value: 17.3 });
  });

  it('never suggests someone already in the lineup', () => {
    const pick = bestPick([
      { id: 'b', price: 300, selected: true, blocked: false },
      { id: 'c', price: 100, selected: false, blocked: false },
    ], projections);
    expect(pick?.id).toBe('c');
  });

  it('returns nothing when no candidate has a projection', () => {
    expect(bestPick([{ id: 'zz', price: 100, selected: false, blocked: false }], projections)).toBeNull();
    expect(bestPick([], projections)).toBeNull();
  });

  it('breaks a tie towards the cheaper option so the mark does not move between renders', () => {
    const tie = byId(P('x', 40), P('y', 40));
    const rows = [
      { id: 'y', price: 300, selected: false, blocked: false },
      { id: 'x', price: 200, selected: false, blocked: false },
    ];
    expect(bestPick(rows, tie)?.id).toBe('x');
    expect(bestPick([...rows].reverse(), tie)?.id).toBe('x');
  });

  it('ignores a stripped free-look projection of zero', () => {
    expect(bestPick([{ id: 'z', price: 100, selected: false, blocked: false }], byId(P('z', 0)))).toBeNull();
  });
});

describe('bestValuePick', () => {
  it('offers the best points per $100 when it differs from the best projection', () => {
    const projections = byId(P('rich', 60), P('cheap', 30));
    const rows = [
      { id: 'rich', price: 400, selected: false, blocked: false },
      { id: 'cheap', price: 100, selected: false, blocked: false },
    ];
    expect(bestPick(rows, projections)?.id).toBe('rich');
    expect(bestValuePick(rows, projections)).toEqual({ id: 'cheap', med: 30, value: 30 });
  });

  it('stays quiet when the same row is both, so one row never carries two marks', () => {
    const projections = byId(P('a', 60), P('b', 20));
    const rows = [
      { id: 'a', price: 100, selected: false, blocked: false },
      { id: 'b', price: 300, selected: false, blocked: false },
    ];
    expect(bestValuePick(rows, projections)).toBeNull();
  });
});

describe('valueOf', () => {
  it('is points per $100, to one decimal, and safe at a zero price', () => {
    expect(valueOf(58, 400)).toBe(14.5);
    expect(valueOf(58, 0)).toBe(0);
  });
});

describe('passFromClaims', () => {
  const now = Date.UTC(2026, 8, 24);

  it('reads the same claim the rules read', () => {
    expect(passFromClaims({ pw: Math.floor((now + 86400000) / 1000) }, now)).toEqual({ active: true, expiresAt: expect.any(Number) });
  });

  it('treats an expired or absent claim as no pass', () => {
    expect(passFromClaims({ pw: Math.floor((now - 1000) / 1000) }, now)).toEqual(NO_PASS);
    expect(passFromClaims({}, now)).toEqual(NO_PASS);
    expect(passFromClaims(undefined, now)).toEqual(NO_PASS);
    expect(passFromClaims({ pw: 'soon' } as never, now)).toEqual(NO_PASS);
  });
});

describe('toProjectionSet', () => {
  it('keeps drivers and constructors together and records the round', () => {
    const set = toProjectionSet({
      asOf: '2026-09-24T19:00:00.000Z',
      round: { number: 17 },
      drivers: [{ id: 'stone', med: 58, floor: 46, ceil: 73, dnf: 13, ptsRise: 5 }],
      constructors: [{ id: 'car_a', med: 106, floor: 67, ceil: 130 }],
    });
    expect(set?.round).toBe(17);
    expect(set?.byId.stone.med).toBe(58);
    expect(set?.byId.car_a.med).toBe(106);
  });

  it('returns nothing for a document with no usable projection, such as the free look', () => {
    expect(toProjectionSet({ drivers: [{ id: 'a', med: 0 }] })).toBeNull();
    expect(toProjectionSet({})).toBeNull();
    expect(toProjectionSet(null)).toBeNull();
  });
});

describe('handoffUrl', () => {
  const { handoffUrl, PORTAL_URL } = require('../../src/pitwall/openPortal');

  it('puts the code in the fragment, where a browser never sends it to a server', () => {
    const url = handoffUrl('a'.repeat(43), 'profile');
    expect(url).toBe(`${PORTAL_URL}/h#${'a'.repeat(43)}&src=profile`);
    expect(url.split('#')[0]).not.toContain('a'.repeat(43));
  });
});
