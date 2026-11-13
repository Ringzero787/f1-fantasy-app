// F-145: Pit Wall strategies read from the first picks, and their plans for the open seats.
import { detectStrategy, planStrategy, priceTier } from '../../src/pitwall/strategies';
import type { Projection } from '../../src/pitwall/projections';

const proj = (m: Record<string, number>) =>
  Object.fromEntries(Object.entries(m).map(([id, med]) => [id, { id, med } as Projection]));

// a small market: three stars, three mids, three budget cars
const MARKET = [
  { id: 'star1', price: 300 }, { id: 'star2', price: 280 }, { id: 'star3', price: 250 },
  { id: 'mid1', price: 150 }, { id: 'mid2', price: 140 }, { id: 'mid3', price: 130 },
  { id: 'cheap1', price: 40 }, { id: 'cheap2', price: 30 }, { id: 'cheap3', price: 20 },
];
const PRICES = MARKET.map((d) => d.price);
const BY = proj({ star1: 60, star2: 52, star3: 45, mid1: 30, mid2: 28, mid3: 27, cheap1: 14, cheap2: 12, cheap3: 6 });

describe('detectStrategy', () => {
  it('nothing tapped yet: no strategy', () => {
    expect(detectStrategy([], PRICES)).toBeNull();
  });
  it('a star among the first picks reads as stars and scrubs', () => {
    expect(detectStrategy([300], PRICES)).toBe('STARS');
    expect(detectStrategy([30, 280], PRICES)).toBe('STARS');
  });
  it('only budget cars reads as value', () => {
    expect(detectStrategy([20, 30], PRICES)).toBe('VALUE');
  });
  it('mid-priced (or mid plus budget) reads as balanced', () => {
    expect(detectStrategy([140], PRICES)).toBe('BALANCED');
    expect(detectStrategy([140, 20], PRICES)).toBe('BALANCED');
  });
  it('tiers by thirds of the market', () => {
    expect(priceTier(300, PRICES)).toBe('star');
    expect(priceTier(140, PRICES)).toBe('mid');
    expect(priceTier(20, PRICES)).toBe('budget');
  });
});

describe('planStrategy', () => {
  it('stars and scrubs: the strongest driver the bank allows, filled cheaply', () => {
    const p = planStrategy('STARS', MARKET, BY, 3, 400)!;
    expect(p.ids).toContain('star1');
    expect(p.cost).toBeLessThanOrEqual(400);
  });
  it('balanced: every seat near the even share, most points', () => {
    const p = planStrategy('BALANCED', MARKET, BY, 3, 450)!;
    expect(p.ids.sort()).toEqual(['mid1', 'mid2', 'mid3']);
  });
  it('value: the most points per dollar', () => {
    const p = planStrategy('VALUE', MARKET, BY, 2, 400)!;
    // cheap1 0.35/$ and cheap2 0.40/$ beat everything else
    expect(p.ids.sort()).toEqual(['cheap1', 'cheap2']);
  });
  it('never over the bank, never a driver without a projection', () => {
    const byWithHole = { ...BY };
    delete (byWithHole as Record<string, Projection>).star1;
    for (const s of ['STARS', 'BALANCED', 'VALUE'] as const) {
      const p = planStrategy(s, MARKET, byWithHole, 2, 330);
      expect(p).not.toBeNull();
      expect(p!.cost).toBeLessThanOrEqual(330);
      expect(p!.ids).not.toContain('star1');
    }
  });
  it('balanced with no set inside the band falls back to the most points', () => {
    // 2 seats, bank 600 → band 150..450: only star1 is inside it, so no balanced pair exists
    const two = [{ id: 'star1', price: 300 }, { id: 'cheap3', price: 20 }, { id: 'cheap2', price: 30 }];
    const p = planStrategy('BALANCED', two, BY, 2, 600)!;
    expect(p.strategy).toBe('BALANCED');
    expect(p.ids.sort()).toEqual(['cheap2', 'star1']);
  });
  it('an unpriced pick is ignored when reading the strategy', () => {
    expect(detectStrategy([0], PRICES)).toBeNull();
    expect(detectStrategy([0, 300], PRICES)).toBe('STARS');
  });
  it('nothing fits, or nothing to fill: null', () => {
    expect(planStrategy('STARS', MARKET, BY, 3, 50)).toBeNull();
    expect(planStrategy('STARS', MARKET, BY, 0, 500)).toBeNull();
  });
});
