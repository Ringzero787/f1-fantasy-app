import { describe, expect, it } from 'vitest';
import { bestLineup, hindsightRow, type Scored } from './hindsight';

const D = (id: string, points: number, price: number, ctor = false): Scored => ({ id, ctor, points, price });
const grid = [D('a', 60, 500), D('b', 50, 400), D('c', 40, 300), D('d', 30, 150), D('e', 20, 100), D('f', 10, 80), D('g', 5, 60), D('x', 80, 300, true), D('y', 40, 150, true)];

describe('bestLineup', () => {
  it('spends no more than the roster did, and puts the ace on the best pick under the cap', () => {
    const best = bestLineup(grid, 1100)!;
    // within $1100: not a+b (900) plus three more; the search finds the best affordable five and a constructor
    expect(best.drivers.reduce((s, id) => s + grid.find((g) => g.id === id)!.price, 0) + grid.find((g) => g.id === best.ctor)!.price).toBeLessThanOrEqual(1100);
    expect(best.ace === null || grid.find((g) => g.id === best.ace)!.price <= 200).toBe(true);
    expect(best.points).toBeGreaterThan(0);
  });
  it('an unaffordable grid gives nothing rather than a lineup nobody could buy', () => {
    expect(bestLineup(grid, 100)).toBeNull();
  });
  it('the ace bonus can change which lineup is best', () => {
    // with the ace, d (30 pts, $150) doubles: a lineup holding d beats one that swaps d for a dearer driver worth a little more
    const best = bestLineup(grid, 1500)!;
    expect(best.ace).toBe('d');
  });
});

describe('hindsightRow', () => {
  it('is the share of the best affordable lineup that the roster scored', () => {
    const snap = { raceId: 'r', round: 17, points: 130, roster: { drivers: [{ driverId: 'a', currentPrice: 500 }, { driverId: 'b', currentPrice: 400 }, { driverId: 'e', currentPrice: 100 }, { driverId: 'f', currentPrice: 80 }, { driverId: 'g', currentPrice: 60 }], constructor: { constructorId: 'y', currentPrice: 150 }, aceDriverId: 'e' } };
    const row = hindsightRow(snap, grid.map(({ id, ctor, points }) => ({ id, ctor, points })), (id) => grid.find((g) => g.id === id)?.price)!;
    expect(row.spend).toBe(1290);
    expect(row.actual).toBe(130);
    expect(row.best).toBeGreaterThanOrEqual(130);
    expect(row.share).toBe(Math.round((130 / row.best) * 100));
  });
  it('gives nothing when a price is missing for everyone, rather than a best of zero', () => {
    expect(hindsightRow({ raceId: 'r', round: 1, points: 10, roster: { drivers: [], constructor: null, aceDriverId: null } }, [], () => undefined)).toBeNull();
  });
});
