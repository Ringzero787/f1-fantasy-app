/**
 * Confidence in a projection (F-096).
 *
 * The bug this exists for: the Briefing offered a swap out of a front-runner into the midfield and
 * called it an upgrade, because it compared medians and nothing else. The reader lost 34 points of
 * weekend potential by taking two such swaps.
 */
import { describe, expect, it } from 'vitest';
import { confidenceOf, edgeOf, zoneOf, FRONT_T10, BACK_T10 } from './confidence';
import type { Constructor, Driver } from './types';

const D = (over: Partial<Driver>): Driver => ({
  id: 'd', num: 1, name: 'D', team: 'T', price: 100, med: 40, floor: 35, ceil: 45, form: [],
  dnf: 5, own: 10, pm: 0, cons: 50, dprice: 0, fit: [3], win: 0, pod: 0, t10: 50,
  ptsRise: 0, ptsHold: 0, pRise: 0, pFall: 0, q: 0, r: 0, val: 0, splits: [],
  mix: { quali: 0, race: 0, sprint: 0, fl: 0 }, ...over,
});

describe('zoneOf', () => {
  it('splits the grid the way the model does: sharp end, midfield blob, backmarkers', () => {
    expect(zoneOf(90)).toBe('front');
    expect(zoneOf(FRONT_T10)).toBe('front');        // the boundary belongs to the tighter side
    expect(zoneOf(50)).toBe('midfield');
    expect(zoneOf(BACK_T10)).toBe('back');
    expect(zoneOf(5)).toBe('back');
  });

  it('calls the coin-flip zone what it is', () => {
    // P8–P14 in the source model: "16 drivers fight for 14 finishing positions".
    expect(confidenceOf(D({ t10: 50 })).label).toBe('wide');
    expect(confidenceOf(D({ t10: 95 })).label).toBe('tight');
  });
});

describe('confidenceOf', () => {
  it('a band as wide as the projection halves a point; no band leaves it whole', () => {
    expect(confidenceOf(D({ med: 40, floor: 20, ceil: 60 })).weight).toBe(0.5);
    expect(confidenceOf(D({ med: 40, floor: 40, ceil: 40 })).weight).toBe(1);
  });

  it('is monotone: a wider band is never worth more', () => {
    const tight = confidenceOf(D({ med: 50, floor: 45, ceil: 55 })).weight;
    const wide = confidenceOf(D({ med: 50, floor: 25, ceil: 75 })).weight;
    expect(wide).toBeLessThan(tight);
  });

  it('never reaches zero — a wide projection is worth less, not nothing', () => {
    expect(confidenceOf(D({ med: 10, floor: 0, ceil: 200 })).weight).toBeGreaterThan(0);
  });

  it('a projection of nothing is worth nothing, without dividing by zero', () => {
    expect(confidenceOf(D({ med: 0, floor: 0, ceil: 0 })).weight).toBe(0);
    expect(Number.isFinite(confidenceOf(D({ med: 0, floor: 0, ceil: 30 })).weight)).toBe(true);
  });

  it('reads a constructor as tight: it is two drivers summed, so it moves less than either', () => {
    const c: Constructor = { id: 'c', name: 'C', team: 'C', price: 200, med: 60, floor: 55, ceil: 65, val: 1, ctor: true };
    expect(confidenceOf(c).zone).toBe('front');
  });
});

describe('edgeOf', () => {
  it('discounts a gain by the pick that has to deliver it', () => {
    const steady = D({ med: 40, floor: 36, ceil: 44, t10: 90 });
    const erratic = D({ med: 40, floor: 10, ceil: 70, t10: 50 });
    expect(edgeOf(10, steady)).toBeGreaterThan(edgeOf(10, erratic));
  });

  it('the reported case: the same delta is worth less bought in the midfield', () => {
    // Hamilton-shaped: predicted at the sharp end, narrow band. Gasly-shaped: midfield, wide.
    const sharp = D({ med: 50, floor: 40, ceil: 67, t10: 88 });
    const blob = D({ med: 50, floor: 20, ceil: 85, t10: 48 });
    expect(edgeOf(6, blob)).toBeLessThan(edgeOf(6, sharp));
  });

  it('keeps the sign: a loss discounted is still a loss', () => {
    expect(edgeOf(-10, D({}))).toBeLessThan(0);
  });
});

describe('rangeLabel, which is not the grid zone', () => {
  // The first draft used one word for both and produced "their range is tight (27 points between
  // floor and ceiling)" for a sharp-end driver with a wide band — the adjective and the number
  // disagreeing in the same sentence, with the number being the one that drove the discount.
  it('describes the band, not where the driver runs', () => {
    const sharpButWide = D({ t10: 88, med: 50, floor: 40, ceil: 67 });
    const c = confidenceOf(sharpButWide);
    expect(c.zone).toBe('front');          // where they run
    expect(c.label).toBe('tight');         // …which is about the grid
    expect(c.rangeLabel).toBe('moderate'); // …and says nothing about the band
  });

  it('tracks the ratio the weight uses', () => {
    expect(confidenceOf(D({ med: 50, floor: 45, ceil: 55 })).rangeLabel).toBe('narrow');
    expect(confidenceOf(D({ med: 50, floor: 30, ceil: 70 })).rangeLabel).toBe('moderate');
    expect(confidenceOf(D({ med: 50, floor: 10, ceil: 90 })).rangeLabel).toBe('wide');
  });

  it('says unpublished rather than inventing a word for a band that is not there', () => {
    // The free payload publishes floor, ceil and t10 as zero.
    expect(confidenceOf(D({ med: 0, floor: 0, ceil: 0 })).rangeLabel).toBe('unpublished');
  });
});

describe('an unpublished band is unknown, not certain', () => {
  // The free document keeps med and zeroes floor and ceil — exactly as the worker writes it. Run
  // that through the weight and spread 0 gives weight 1, the formula's maximum: "fully trust this",
  // asserted from an absence of data. That is the inversion this guards.
  const free = D({ med: 44, floor: 0, ceil: 0, t10: 0 });

  it('is marked unpublished rather than narrow', () => {
    expect(confidenceOf(free).published).toBe(false);
    expect(confidenceOf(free).rangeLabel).toBe('unpublished');
  });

  it('still weights 1, because there is nothing to discount by — and so does everyone else', () => {
    // Uniform, so the ordering degrades to raw gain instead of favouring whoever happens to have a
    // zero band. The weight is not a claim here; `published` is what a caller must read.
    const other = D({ id: 'o', med: 80, floor: 0, ceil: 0, t10: 0 });
    expect(confidenceOf(free).weight).toBe(1);
    expect(confidenceOf(other).weight).toBe(1);
  });

  it('a real band of zero width is still published, because med and the band agree', () => {
    expect(confidenceOf(D({ med: 0, floor: 0, ceil: 0 })).published).toBe(true);
  });
});
