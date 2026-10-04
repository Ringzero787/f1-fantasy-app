import { describe, expect, it } from 'vitest';
import { aceChange, aceFrozen, planSave, saleQuote, teamLineup, type MarketPrices, type RealTeam } from './team';

const D = (driverId: string, currentPrice: number, extra = {}) => ({ driverId, name: driverId.toUpperCase(), shortName: driverId.slice(0, 3).toUpperCase(), constructorId: 'car', purchasePrice: currentPrice, currentPrice, contractLength: 3, racesHeld: 1, ...extra });
const team: RealTeam = { id: 't1', name: 'Late Brakers', leagueId: 'L', budget: 50, isLocked: false, aceFreezeFrom: null, aceLockTime: null, aceLockUntil: null, aceQualiKey: null, aceSprintKey: null, scoredRaces: [], aceDriverId: 'a', totalPoints: 0, lockedPoints: 0, driverLockouts: { gone: 9 },
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
    expect(planSave({ ...team, isLocked: true }, { drivers: ['a', 'd'], ctor: 'x', ace: 'a' }, market, 3, 10).blocked).toMatch(/locked/);
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

describe('the lock refuses a roster change, not an ace change (F-095)', () => {
  // The window between the qualifying lock and lights out is the whole point of the ace.
  // planSave used to return blocked on isLocked before it looked at anything, so every
  // portal ace move from Saturday on died there — and the relaxation in state.tsx and
  // Compare.tsx would have shipped as a change that did nothing at all.
  it('lets an ace-only save through on a locked team, and still refuses the roster', () => {
    const locked = { ...team, isLocked: true };
    const sameRoster = teamLineup(team);
    expect(planSave(locked, sameRoster, market, 3, 10).blocked).toBeNull();
    expect(planSave(locked, { ...sameRoster, ace: 'b' }, market, 3, 10).blocked).toBeNull();
    expect(planSave(locked, { ...sameRoster, ace: 'b' }, market, 3, 10).steps).toEqual([]);
    // a driver swap on the same locked team is still refused
    expect(planSave(locked, { ...sameRoster, drivers: ['a', 'd'] }, market, 3, 10).blocked).toMatch(/locked/);
    // so is a constructor swap on its own
    expect(planSave(locked, { ...sameRoster, ctor: 'y' }, market, 3, 10).blocked).toMatch(/locked/);
  });
});

describe('aceFrozen (F-095 / F-098)', () => {
  const HOUR = 60 * 60 * 1000;
  const race = Date.parse('2026-03-08T14:00:00Z');
  const quali = Date.parse('2026-03-07T14:00:00Z');
  const QUALI_MARK = 'quali_bahrain_2026';
  const SPRINT_MARK = 'sprint_bahrain_2026';
  const frozen = {
    ...team, isLocked: true,
    aceFreezeFrom: quali, aceLockTime: race, aceLockUntil: race + 24 * HOUR, aceQualiKey: QUALI_MARK,
  };

  it('is free before the first scoring session, and frozen from it', () => {
    expect(aceFrozen(frozen, quali - 1)).toBe(false);
    expect(aceFrozen(frozen, quali)).toBe(true);
    expect(aceFrozen(frozen, race - 2 * HOUR)).toBe(true);
  });

  it('opens the gap on the qualifying key, not on a clock, and shuts it at lights out', () => {
    const scored = { ...frozen, scoredRaces: [QUALI_MARK] };
    expect(aceFrozen(scored, race - 2 * HOUR)).toBe(false);
    expect(aceFrozen(scored, race - 1)).toBe(false);
    expect(aceFrozen(scored, race)).toBe(true);
    // another race's key is not this one's
    expect(aceFrozen({ ...frozen, scoredRaces: ['quali_singapore_2026'] }, race - 2 * HOUR)).toBe(true);
  });

  it('needs the sprint settled too, on a weekend that has one', () => {
    const sprint = { ...frozen, aceSprintKey: SPRINT_MARK };
    expect(aceFrozen({ ...sprint, scoredRaces: [QUALI_MARK] }, race - 2 * HOUR)).toBe(true);
    expect(aceFrozen({ ...sprint, scoredRaces: [QUALI_MARK, SPRINT_MARK] }, race - 2 * HOUR)).toBe(false);
    // a weekend with no sprint asks nothing of the marker
    expect(aceFrozen({ ...frozen, scoredRaces: [QUALI_MARK] }, race - 2 * HOUR)).toBe(false);
  });

  it('expires, so a freeze nobody cleared cannot hold the ace for ever', () => {
    expect(aceFrozen(frozen, race + 24 * HOUR - 1)).toBe(true);
    expect(aceFrozen(frozen, race + 24 * HOUR)).toBe(false);
  });

  it('does not consult isLocked — clearing the lock mid-race buys nothing', () => {
    expect(aceFrozen({ ...frozen, isLocked: false }, race + HOUR)).toBe(true);
  });

  it('falls back to the race start on a weekend stamped before aceFreezeFrom existed', () => {
    const f095 = { ...team, isLocked: true, aceLockTime: race, aceLockUntil: race + 24 * HOUR };
    expect(aceFrozen(f095, race - HOUR)).toBe(false);
    expect(aceFrozen(f095, race)).toBe(true);
  });

  it('freezes nothing without a window, or with half of one', () => {
    expect(aceFrozen({ ...team, isLocked: true }, race)).toBe(false);
    expect(aceFrozen({ ...frozen, aceLockUntil: null }, race)).toBe(false);
    expect(aceFrozen({ ...frozen, aceFreezeFrom: null, aceLockTime: null }, race)).toBe(false);
  });
});
