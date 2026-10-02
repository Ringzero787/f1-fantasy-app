/**
 * What a pass holder sees on a driver, shaped from the published projection.
 *
 * The judgement being tested is mostly about absence. The worker does not publish every field for
 * every driver, and a figure the model never gave is not zero — a driver with no retirement risk
 * and a driver the model said nothing about must not look the same. Getting that wrong invents
 * numbers on a screen somebody paid for, which is worse than showing less.
 */
import { driverDetail, hasDetail } from '../../src/pitwall/driverDetail';
import type { Projection } from '../../src/pitwall/projections';

const P = (over: Partial<Projection> = {}): Projection => ({
  id: 'nor', med: 58, floor: 41, ceil: 77, dnf: 9,
  win: 22, pod: 54, t10: 91, val: 19.4, price: 29.8, dprice: 0.4,
  ptsRise: 46, ptsHold: 31, pRise: 61, pFall: 12, own: 73,
  form: [41, 52, 18, 63], fit: [4, 5, 3], mix: { race: 180, quali: 44, sprint: 12, fl: 4 },
  splits: [{ cls: 'street-high', label: 'Street · high speed', n: 4, avg: 46.5 }], ...over,
});

describe('the range', () => {
  it('places the median between floor and ceiling', () => {
    const r = driverDetail(P())!.range!;
    expect([r.floor, r.med, r.ceil]).toEqual([41, 58, 77]);
    expect(r.at).toBeCloseTo((58 - 41) / (77 - 41));
  });

  it('is absent when there is no spread, rather than a bar drawn from one number', () => {
    expect(driverDetail(P({ floor: 0, ceil: 0 }))!.range).toBeNull();
    expect(driverDetail(P({ ceil: 41, floor: 41 }))!.range).toBeNull();
  });

  it('cannot place the median outside the bar', () => {
    expect(driverDetail(P({ med: 999 }))!.range!.at).toBe(1);
    expect(driverDetail(P({ med: -999 }))!.range!.at).toBe(0);
  });
});

describe('chances', () => {
  it('reads as whole percentages, in the order a reader cares about', () => {
    expect(driverDetail(P())!.chances).toEqual([
      { label: 'WIN', value: '22%' },
      { label: 'PODIUM', value: '54%' },
      { label: 'TOP TEN', value: '91%' },
      { label: 'RETIREMENT', value: '9%' },
    ]);
  });

  it('omits what the model did not publish instead of printing zero', () => {
    // A driver with no published win chance must not read as "0% WIN", which is a claim.
    const d = driverDetail(P({ win: 0, pod: 0, t10: 0 }))!;
    expect(d.chances.map((c) => c.label)).toEqual(['RETIREMENT']);
  });
});

describe('money', () => {
  it('says what the points cost and what the price is about to do', () => {
    const m = driverDetail(P())!.money;
    expect(m).toContainEqual({ label: 'PER $100', value: '19', note: 'PROJECTED POINTS' });
    expect(m).toContainEqual({ label: 'NEXT PRICE', value: '▲ $0.4', note: 'PREDICTED' });
    expect(m).toContainEqual({ label: 'OWNED BY', value: '73%', note: 'OF LEAGUES' });
  });

  it('carries the chance beside the threshold, because the threshold alone means nothing', () => {
    // 46 points to rise is a different proposition at 61% than at 9%.
    expect(driverDetail(P())!.money).toContainEqual({ label: 'TO RISE', value: '46 PTS', note: '61% CHANCE' });
    expect(driverDetail(P({ pRise: 0 }))!.money).toContainEqual({ label: 'TO RISE', value: '46 PTS', note: undefined });
  });

  it('shows a falling price as falling', () => {
    expect(driverDetail(P({ dprice: -1.25 }))!.money).toContainEqual({ label: 'NEXT PRICE', value: '▼ $1.3', note: 'PREDICTED' });
  });

  it('says nothing about a price the model expects to hold', () => {
    expect(driverDetail(P({ dprice: 0 }))!.money.map((m) => m.label)).not.toContain('NEXT PRICE');
  });
});

describe('fit', () => {
  it('labels each score with the round it belongs to', () => {
    expect(driverDetail(P(), ['SINGAPORE', 'AUSTIN', 'MEXICO'])!.fit).toEqual([
      { round: 'SINGAPORE', score: 4 }, { round: 'AUSTIN', score: 5 }, { round: 'MEXICO', score: 3 },
    ]);
  });

  it('drops a score with no round to put it against', () => {
    // An unlabelled 1-to-5 on its own tells a reader nothing about which race it is for.
    expect(driverDetail(P(), ['SINGAPORE'])!.fit).toEqual([{ round: 'SINGAPORE', score: 4 }]);
    expect(driverDetail(P(), [])!.fit).toEqual([]);
  });
});

describe('points mix', () => {
  it('is a share of the season, largest first', () => {
    const mix = driverDetail(P())!.mix;
    expect(mix[0].label).toBe('RACE');
    expect(mix.map((m) => m.label)).toEqual(['RACE', 'QUALI', 'SPRINT', 'FASTEST LAP']);
    expect(mix.reduce((n, m) => n + m.pct, 0)).toBeGreaterThan(97);
  });

  it('leaves out a category they never scored in', () => {
    expect(driverDetail(P({ mix: { race: 100, quali: 20, sprint: 0, fl: 0 } }))!.mix.map((m) => m.label)).toEqual(['RACE', 'QUALI']);
  });

  it('is empty when nothing was published', () => {
    expect(driverDetail(P({ mix: null }))!.mix).toEqual([]);
  });
});

describe('whether to show the section at all', () => {
  it('is worth showing when the model said anything', () => {
    expect(hasDetail(driverDetail(P()))).toBe(true);
  });

  it('is not worth showing when it said nothing', () => {
    const empty = P({ floor: 0, ceil: 0, win: 0, pod: 0, t10: 0, dnf: 0, val: 0, ptsRise: 0, dprice: 0, own: 0, fit: [], mix: null, splits: [] });
    expect(hasDetail(driverDetail(empty))).toBe(false);
    expect(hasDetail(driverDetail(null))).toBe(false);
  });

  it('has nothing to say about a driver with no projection', () => {
    expect(driverDetail(null)).toBeNull();
    expect(driverDetail(undefined)).toBeNull();
  });
});
