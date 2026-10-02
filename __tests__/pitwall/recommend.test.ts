import { bestPick, bestValuePick, valueOf } from '../../src/pitwall/recommend';
import { passFromClaims, NO_PASS } from '../../src/pitwall/pass';
import { toProjectionSet } from '../../src/pitwall/projections';
import type { Projection } from '../../src/pitwall/projections';

const P = (id: string, med: number, over: Partial<Projection> = {}): Projection => ({
  id, med, floor: med - 8, ceil: med + 12, dnf: 12,
  win: 0, pod: 0, t10: 0, val: 0, price: 0, dprice: 0,
  ptsRise: 4, ptsHold: 0, pRise: 0, pFall: 0, own: 0,
  form: [], fit: [], mix: null, splits: [], ...over,
});
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

describe('marksFor', () => {
  const { marksFor } = require('../../src/pitwall/recommend');

  it('marks one pick and, separately, one best value', () => {
    const projections = byId(P('rich', 60), P('cheap', 30), P('mid', 40));
    const rows = [
      { id: 'rich', price: 400, selected: false, blocked: false },
      { id: 'mid', price: 300, selected: false, blocked: false },
      { id: 'cheap', price: 100, selected: false, blocked: false },
    ];
    expect(marksFor(rows, projections)).toEqual({ rich: 'pick', cheap: 'value' });
  });

  it('never puts two marks on one row', () => {
    const projections = byId(P('a', 60), P('b', 20));
    const rows = [
      { id: 'a', price: 100, selected: false, blocked: false },
      { id: 'b', price: 300, selected: false, blocked: false },
    ];
    expect(marksFor(rows, projections)).toEqual({ a: 'pick' });
  });

  it('marks nothing when every row is blocked or already picked', () => {
    const projections = byId(P('a', 60));
    expect(marksFor([{ id: 'a', price: 100, selected: true, blocked: false }], projections)).toEqual({});
    expect(marksFor([{ id: 'a', price: 100, selected: false, blocked: true }], projections)).toEqual({});
  });
});

describe('what the payload carries through', () => {
  // The app was already downloading the whole published document and keeping six fields of it, so
  // someone who had paid got one number on a picker row here and a full driver panel on the web.
  // These assert the fields survive the parse, because the gap was never a fetch.
  const raw = {
    round: { number: 17 },
    asOf: '2026-10-02T06:00:00.000Z',
    rounds: [{ name: 'SINGAPORE' }, { name: 'AUSTIN' }, { name: 'MEXICO' }],
    drivers: [{
      id: 'nor', med: 58, floor: 41, ceil: 77, dnf: 9,
      win: 22, pod: 54, t10: 91, val: 19.4, price: 29.8, dprice: 0.4,
      ptsRise: 46, ptsHold: 31, pRise: 61, pFall: 12, own: 73,
      form: [41, 52, 18, 63], fit: [4, 5, 3, 2, 4, 1],
      mix: { race: 180, quali: 44, sprint: 12, fl: 3 },
      splits: [{ cls: 'street-high', label: 'Street · high speed', n: 4, avg: 46.5 }],
    }],
    constructors: [],
  };

  it('keeps the numbers a driver panel is made of', () => {
    const set = toProjectionSet(raw)!;
    const d = set.byId.nor;
    expect(d.floor).toBe(41);
    expect(d.ceil).toBe(77);
    expect([d.win, d.pod, d.t10]).toEqual([22, 54, 91]);
    expect([d.val, d.price, d.dprice]).toEqual([19.4, 29.8, 0.4]);
    expect([d.ptsRise, d.ptsHold, d.pRise, d.pFall]).toEqual([46, 31, 61, 12]);
    expect(d.own).toBe(73);
    expect(d.form).toEqual([41, 52, 18, 63]);
    expect(d.fit).toEqual([4, 5, 3, 2, 4, 1]);
    expect(d.mix).toEqual({ race: 180, quali: 44, sprint: 12, fl: 3 });
    expect(d.splits).toEqual([{ cls: 'street-high', label: 'Street · high speed', n: 4, avg: 46.5 }]);
  });

  it('keeps the round names, so a fit score can say which round it is for', () => {
    expect(toProjectionSet(raw)!.rounds).toEqual(['SINGAPORE', 'AUSTIN', 'MEXICO']);
  });

  it('treats an all-zero mix as nothing published rather than a driver who scored nothing', () => {
    const set = toProjectionSet({ ...raw, drivers: [{ ...raw.drivers[0], mix: { race: 0, quali: 0, sprint: 0, fl: 0 } }] })!;
    expect(set.byId.nor.mix).toBeNull();
  });

  it('drops a split with no label or no races behind it', () => {
    const splits = [{ cls: 'a', label: '', n: 4, avg: 1 }, { cls: 'b', label: 'Permanent', n: 0, avg: 2 }, { cls: 'c', label: 'Street', n: 3, avg: 9 }];
    const set = toProjectionSet({ ...raw, drivers: [{ ...raw.drivers[0], splits }] })!;
    expect(set.byId.nor.splits.map((s) => s.label)).toEqual(['Street']);
  });

  it('survives a document missing every optional field', () => {
    const set = toProjectionSet({ round: { number: 1 }, drivers: [{ id: 'x', med: 10 }], constructors: [] })!;
    const d = set.byId.x;
    expect(d.form).toEqual([]);
    expect(d.fit).toEqual([]);
    expect(d.mix).toBeNull();
    expect(d.splits).toEqual([]);
    expect(d.win).toBe(0);
    expect(set.rounds).toEqual([]);
  });
});
