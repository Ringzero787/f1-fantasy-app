import { describe, expect, it } from 'vitest';
import { aceChange, planSave, saleQuote, teamLineup, type MarketPrices, type RealTeam } from './team';

const D = (driverId: string, currentPrice: number, extra = {}) => ({ driverId, name: driverId.toUpperCase(), shortName: driverId.slice(0, 3).toUpperCase(), constructorId: 'car', purchasePrice: currentPrice, currentPrice, contractLength: 3, racesHeld: 1, ...extra });
const team: RealTeam = { id: 't1', name: 'Late Brakers', leagueId: 'L', budget: 50, isLocked: false, aceDriverId: 'a', totalPoints: 0, lockedPoints: 0, driverLockouts: { gone: 9 },
  drivers: [D('a', 100), D('b', 200, { racesHeld: 0 }), D('c', 150, { isReservePick: true })], constructor: { constructorId: 'x', name: 'X', purchasePrice: 300, currentPrice: 300, contractLength: 3, racesHeld: 1 } };
const market: MarketPrices = { drivers: { a: { price: 110, name: 'A' }, b: { price: 200, name: 'B' }, c: { price: 150, name: 'C' }, d: { price: 120, name: 'D' }, e: { price: 500, name: 'E' }, gone: { price: 50, name: 'GONE' }, dead: { price: 10, name: 'DEAD', isActive: false } }, constructors: { x: { price: 300, name: 'X' }, y: { price: 310, name: 'Y' } } };

describe('real team plan', () => {
  it('quotes a sale like the server: 3% per race left, waived in the grace period, for reserve picks and expired contracts', () => {
    expect(saleQuote({ currentPrice: 100, contractLength: 3, racesHeld: 1 })).toEqual({ marketPrice: 100, earlyTermFee: 6, saleReturn: 94, feeWaived: false });
    expect(saleQuote({ currentPrice: 100, contractLength: 3, racesHeld: 0 }).feeWaived).toBe(true);
    expect(saleQuote({ currentPrice: 100, contractLength: 3, racesHeld: 3 }).feeWaived).toBe(true);
    expect(saleQuote({ currentPrice: 100, isReservePick: true, racesHeld: 1 }).earlyTermFee).toBe(0);
    expect(saleQuote({ currentPrice: 100, racesHeld: 1 }, 200).saleReturn).toBe(200 - 12);
  });

  it('reads the lineup off the team and plans nothing when nothing changed', () => {
    const l = teamLineup(team);
    expect(l).toEqual({ drivers: ['a', 'b', 'c'], ctor: 'x', ace: 'a' });
    expect(planSave(team, l, market, 3, 10)).toEqual({ steps: [], bankAfter: 50, blocked: null, changed: false });
  });

  it('sells first at the market price, then changes the constructor, then buys, and checks the bank at the end', () => {
    const plan = planSave(team, { drivers: ['b', 'c', 'd'], ctor: 'y', ace: 'b' }, market, 2, 10);
    expect(plan.steps.map((s) => s.op)).toEqual(['sellDriver', 'removeConstructor', 'setConstructor', 'addDriver']);
    expect(plan.steps[0]).toMatchObject({ id: 'a', returns: 110 - Math.floor(110 * 0.03 * 2), fee: 6 });
    expect(plan.steps[3]).toMatchObject({ id: 'd', cost: 120, contractLength: 2 });
    // sell a: 110 market less 3% x 2 races left = 104; sell x: 300 less 18; buy y 310; buy d 120
    expect(plan.bankAfter).toBe(50 + 104 + (300 - 18) - 310 - 120);
    expect(plan.blocked).toBeNull();
  });

  it('blocks a locked team, an over-budget lineup, a lockout, an inactive driver, and too many drivers', () => {
    expect(planSave({ ...team, isLocked: true }, teamLineup(team), market, 3, 10).blocked).toMatch(/locked/);
    expect(planSave(team, { drivers: ['a', 'b', 'c', 'e'], ctor: 'x', ace: 'a' }, market, 3, 10).blocked).toMatch(/over your bank/);
    expect(planSave(team, { drivers: ['a', 'b', 'c', 'gone'], ctor: 'x', ace: 'a' }, market, 3, 8).blocked).toMatch(/cannot come back/);
    expect(planSave(team, { drivers: ['a', 'b', 'c', 'gone'], ctor: 'x', ace: 'a' }, market, 3, 9).blocked).toBeNull();
    expect(planSave(team, { drivers: ['a', 'b', 'c', 'dead'], ctor: 'x', ace: 'a' }, market, 3, 10).blocked).toMatch(/not active/);
    expect(planSave(team, { drivers: ['a', 'b', 'c', 'd', 'e', 'gone'], ctor: 'x', ace: 'a' }, market, 3, 10).blocked).toMatch(/at most 5/);
  });

  it('allows an Ace only on the lineup and under the price cap', () => {
    expect(aceChange(team, { drivers: ['a', 'b'], ctor: 'x', ace: 'a' }, market)).toEqual({ to: null, blocked: null });
    expect(aceChange(team, { drivers: ['a', 'd'], ctor: 'x', ace: 'd' }, market)).toEqual({ to: 'd', blocked: null });
    expect(aceChange(team, { drivers: ['a', 'b'], ctor: 'x', ace: 'e' }, market).blocked).toMatch(/must be on your lineup/);
    expect(aceChange(team, { drivers: ['a', 'e'], ctor: 'x', ace: 'e' }, market).blocked).toMatch(/\$200 or less/);
    expect(aceChange(team, { drivers: ['a'], ctor: 'x', ace: '' }, market)).toEqual({ to: '', blocked: null });
  });
});
