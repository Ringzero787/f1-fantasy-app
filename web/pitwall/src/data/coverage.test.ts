import { describe, expect, it } from 'vitest';
import { coverage } from './coverage';
import { examplePayload } from './example';
import { toPayload } from '../lib/payloadApi';

// What the worker publishes today: projections and the price model, nothing else.
const PUBLISHED = {
  example: false,
  asOf: '2026-09-24T19:00:00.000Z',
  round: { number: 17, name: 'Baku', firstSession: '', locksIn: '', circuit: 'Baku City' },
  rounds: ['BAK', 'SIN', 'USA'],
  budget: 1000,
  teams: { mercedes: { id: 'mercedes', name: 'Mercedes', color: '#00A19C' } },
  drivers: [
    { id: 'antonelli', num: 12, name: 'Antonelli', team: 'mercedes', price: 400, med: 58, floor: 46, ceil: 73, form: [40, 52], dnf: 13, own: 0, pm: 4, cons: 50, dprice: 6, fit: [3, 3, 3], win: 25, pod: 57, t10: 87, ptsRise: 5, ptsHold: 3, pRise: 62, pFall: 38, q: 0, r: 0, val: 14.5 },
    { id: 'norris', num: 4, name: 'Norris', team: 'mercedes', price: 420, med: 52, floor: 41, ceil: 72, form: [], dnf: 15, own: 0, pm: 0, cons: 0, dprice: 0, fit: [3, 3, 3], win: 15, pod: 43, t10: 84, ptsRise: 5, ptsHold: 3, pRise: 50, pFall: 50, q: 0, r: 0, val: 12.4 },
  ],
  constructors: [{ id: 'mercedes', name: 'Mercedes', team: 'mercedes', price: 500, med: 106, floor: 67, ceil: 130, val: 21.2, ctor: true }],
  news: [],
  rivals: [],
  league: { name: '', size: 0, myRank: 0 },
};

describe('coverage', () => {
  it('reports the example payload as complete, so the design preview is unchanged', () => {
    const has = coverage(examplePayload());
    expect(has).toEqual({ timing: true, ownership: true, fit: true, news: true, rivals: true, league: true, form: true, priceModel: true, mock: true });
  });

  it('separates "published as zero" from "not published at all"', () => {
    const has = coverage(toPayload(PUBLISHED));
    // these the worker does publish
    expect(has.priceModel).toBe(true);
    expect(has.form).toBe(true);
    // and these it does not, so no page may present them as measured
    expect(has.timing).toBe(false);
    expect(has.ownership).toBe(false);
    expect(has.fit).toBe(false);
    expect(has.news).toBe(false);
    expect(has.rivals).toBe(false);
    expect(has.league).toBe(false);
    expect(has.mock).toBe(false);
  });

  it('counts a flat fit of 3 for every driver as unpublished, not as a judgement', () => {
    const varied = { ...PUBLISHED, drivers: PUBLISHED.drivers.map((d, i) => ({ ...d, fit: [i === 0 ? 5 : 2, 3, 3] })) };
    expect(coverage(toPayload(varied)).fit).toBe(true);
  });
});

describe('toPayload', () => {
  it('keeps the published values and fills nothing in', () => {
    const p = toPayload(PUBLISHED);
    expect(p.example).toBe(false);
    expect(p.drivers[0].med).toBe(58);
    expect(p.drivers[0].ptsRise).toBe(5);
    expect(p.constructors[0].ctor).toBe(true);
    expect(p.news).toEqual([]);
  });

  it('survives a document missing every optional part', () => {
    const p = toPayload({ drivers: [{ id: 'x' }] });
    expect(p.drivers).toHaveLength(1);
    expect(p.drivers[0].name).toBe('x');
    expect(p.drivers[0].med).toBe(0);
    expect(p.budget).toBe(1000);
    expect(p.round.number).toBe(0);
    expect(p.rivals).toEqual([]);
  });

  it('drops entries that are not usable rather than rendering blanks', () => {
    const p = toPayload({ drivers: [{ id: '' }, { id: 'ok' }], news: [{ kind: 'NONSENSE', text: 'x' }, { kind: 'PENALTY', text: 'real', tone: '-' }], rivals: [{ name: '' }] });
    expect(p.drivers.map((d) => d.id)).toEqual(['ok']);
    expect(p.news.map((n) => n.kind)).toEqual(['PENALTY']);
    expect(p.rivals).toEqual([]);
  });
});
