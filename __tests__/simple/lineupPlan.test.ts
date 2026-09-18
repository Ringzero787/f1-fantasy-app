import { planLineup, pendingFromCurrent, canAffordAdd, constructorSwapBudget, saveLabel } from '../../src/simple/grid/lineupPlan';

const market = {
  drivers: {
    norris: { id: 'norris', name: 'Lando Norris', price: 400 },
    piastri: { id: 'piastri', name: 'Oscar Piastri', price: 380 },
    hadjar: { id: 'hadjar', name: 'Isack Hadjar', price: 90 },
  },
  constructors: {
    mclaren: { id: 'mclaren', name: 'McLaren', price: 200 },
    ferrari: { id: 'ferrari', name: 'Ferrari', price: 150 },
  },
};
const opts = { teamSize: 5, defaultContract: 3 };
const current = {
  budget: 100,
  drivers: [
    { id: 'norris', name: 'Lando Norris', currentPrice: 400, contractLength: 4, racesHeld: 1 },
    { id: 'hadjar', name: 'Isack Hadjar', currentPrice: 90, contractLength: 3, racesHeld: 0 },
  ],
  constructor: { id: 'mclaren', name: 'McLaren', currentPrice: 200, contractLength: 3, racesHeld: 2 },
};

describe('planLineup', () => {
  it('is a no-op when pending equals current', () => {
    const plan = planLineup(current, pendingFromCurrent(current), market, opts);
    expect(plan.changed).toBe(false);
    expect(plan.budgetAfter).toBe(100);
    expect(plan.complete).toBe(false);
    expect(plan.missingDrivers).toBe(3);
    expect(saveLabel(plan, false)).toEqual({ label: 'PICK 3 MORE', ready: false });
  });
  it('sells with the early-termination fee and buys with the chosen contract', () => {
    const pending = { driverIds: ['hadjar', 'piastri'], constructorId: 'mclaren', contracts: { piastri: 5 } };
    const plan = planLineup(current, pending, market, opts);
    expect(plan.sells).toHaveLength(1);
    expect(plan.sells[0]).toMatchObject({ id: 'norris', marketPrice: 400 });
    expect(plan.sells[0].fee).toBeGreaterThan(0);          // 1 of 4 races held → fee applies
    expect(plan.buys).toEqual([{ kind: 'driver', id: 'piastri', name: 'Oscar Piastri', price: 380, contract: 5 }]);
    expect(plan.budgetAfter).toBe(100 + plan.sells[0].saleReturn - 380);
    expect(plan.changed).toBe(true);
  });
  it('waives the fee in the grace period', () => {
    const pending = { driverIds: ['norris'], constructorId: 'mclaren', contracts: {} };
    const plan = planLineup(current, pending, market, opts);
    expect(plan.sells[0]).toMatchObject({ id: 'hadjar', fee: 0, saleReturn: 90 });
  });
  it('swaps the constructor as a sell plus a buy', () => {
    const pending = { driverIds: ['norris', 'hadjar'], constructorId: 'ferrari', contracts: {} };
    const plan = planLineup(current, pending, market, opts);
    expect(plan.sells.map((s) => s.id)).toEqual(['mclaren']);
    expect(plan.buys).toEqual([{ kind: 'constructor', id: 'ferrari', name: 'Ferrari', price: 150, contract: 3 }]);
  });
  it('flags a complete lineup and the save state', () => {
    const full = { budget: 2000, drivers: [], constructor: null };
    const pending = { driverIds: ['norris', 'piastri', 'hadjar', 'a', 'b'], constructorId: 'ferrari', contracts: {} };
    const plan = planLineup(full, pending, { ...market, drivers: { ...market.drivers, a: { id: 'a', name: 'A', price: 10 }, b: { id: 'b', name: 'B', price: 10 } } }, opts);
    expect(plan.complete).toBe(true);
    expect(plan.budgetAfter).toBe(2000 - 400 - 380 - 90 - 20 - 150);
    expect(saveLabel(plan, false)).toEqual({ label: 'SAVE LINEUP', ready: true });
    expect(saveLabel(plan, true)).toEqual({ label: 'LOCKED · AUTO-FILL ON', ready: false });
    expect(saveLabel(planLineup(current, pendingFromCurrent({ ...current, drivers: [...current.drivers, ...['a', 'b', 'c'].map((id) => ({ id, name: id, currentPrice: 1 }))] }), market, opts), false)).toEqual({ label: 'LINEUP SAVED', ready: false });
  });
  it('gates adds on the pending budget and refunds the pending constructor on swap', () => {
    const plan = planLineup(current, pendingFromCurrent(current), market, opts);
    expect(canAffordAdd(plan, 90)).toBe(true);
    expect(canAffordAdd(plan, 380)).toBe(false);
    // keeping McLaren: swapping means selling it (2 of 3 held → fee) first
    const swapBudget = constructorSwapBudget(plan, current, pendingFromCurrent(current), market.constructors);
    expect(swapBudget).toBeGreaterThan(100);
    expect(swapBudget).toBeLessThan(300);
    // pending Ferrari as a new buy: dropping it refunds the full price
    const p2 = { driverIds: ['norris', 'hadjar'], constructorId: 'ferrari', contracts: {} };
    const plan2 = planLineup(current, p2, market, opts);
    expect(constructorSwapBudget(plan2, current, p2, market.constructors)).toBe(plan2.budgetAfter + 150);
  });
});
