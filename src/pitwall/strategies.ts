/**
 * F-145: Pit Wall strategies. Once the player has tapped their first driver or two, Pit Wall reads
 * which way they are building and plans the rest of the lineup that way:
 *
 *   STARS    — stars and scrubs: the strongest driver the bank allows, the rest as cheap as works
 *   BALANCED — the most projected points with every seat in a sensible price band
 *   VALUE    — the most projected points per dollar spent, leaving bank in hand
 *
 * Which one is read from the drivers added this session (the first taps): a top-third price means
 * stars, every pick from the bottom third means value, anything else balanced. The player can
 * switch. Pure: the picker supplies the market, the projections and the bank.
 */
import type { Projection } from './projections';

export type StrategyId = 'STARS' | 'BALANCED' | 'VALUE';

export const STRATEGIES: { id: StrategyId; label: string; blurb: string }[] = [
  { id: 'STARS', label: 'STARS', blurb: 'STARS & SCRUBS · ONE BIG NAME, THE REST CHEAP' },
  { id: 'BALANCED', label: 'BALANCED', blurb: 'MID-PRICED ACROSS THE BOARD' },
  { id: 'VALUE', label: 'VALUE', blurb: 'MOST POINTS PER DOLLAR' },
];

export interface StrategyDriver { id: string; price: number }

/** Price tier against the whole driver market: top third star, bottom third budget. */
export function priceTier(price: number, marketPrices: number[]): 'star' | 'mid' | 'budget' {
  const sorted = [...marketPrices].filter((p) => p > 0).sort((a, b) => a - b);
  if (sorted.length < 3) return 'mid';
  const lo = sorted[Math.floor(sorted.length / 3)];
  const hi = sorted[Math.floor((sorted.length * 2) / 3)];
  if (price >= hi) return 'star';
  if (price < lo) return 'budget';
  return 'mid';
}

/** The strategy the first taps point to; null before any. */
export function detectStrategy(addedPrices: number[], marketPrices: number[]): StrategyId | null {
  // an unpriced pick says nothing about the build (and would read as budget)
  addedPrices = addedPrices.filter((p) => p > 0);
  if (addedPrices.length === 0) return null;
  const tiers = addedPrices.map((p) => priceTier(p, marketPrices));
  if (tiers.includes('star')) return 'STARS';
  if (tiers.every((t) => t === 'budget')) return 'VALUE';
  return 'BALANCED';
}

export interface StrategyPlan {
  strategy: StrategyId;
  ids: string[];
  cost: number;
  med: number;
}


/**
 * The drivers that fill `seats` under `bank` for the strategy, or null when nothing fits (or there
 * is nothing to fill). Candidates must have a positive projection. Exhaustive over combinations —
 * at most four open seats once a first driver is picked, about 7,000 sets on a 22-car grid (and
 * 26,000 for five). Pruned only by the bank; no cap, so a plan is never cut short and biased cheap.
 */
export function planStrategy(
  strategy: StrategyId,
  candidates: StrategyDriver[],
  byId: Record<string, Projection>,
  seats: number,
  bank: number,
): StrategyPlan | null {
  const plan = search(strategy, candidates, byId, seats, bank)
    // BALANCED with no set inside the band (a lopsided bank): fall back to the most points.
    ?? (strategy === 'BALANCED' ? search('POINTS', candidates, byId, seats, bank) : null);
  return plan ? { strategy, ...plan } : null;
}

function search(
  objective: StrategyId | 'POINTS',
  candidates: StrategyDriver[],
  byId: Record<string, Projection>,
  seats: number,
  bank: number,
): Omit<StrategyPlan, 'strategy'> | null {
  if (seats <= 0 || bank <= 0) return null;
  const pool = candidates
    .map((c) => ({ id: c.id, price: c.price, med: byId[c.id]?.med ?? 0 }))
    .filter((c) => c.med > 0 && c.price > 0 && c.price <= bank)
    // stable order so ties resolve the same way every render
    .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
  if (pool.length < seats) return null;

  const band = bank / seats;
  type Best = { ids: string[]; cost: number; med: number; key: number[] };
  let best: Best | null = null;
  const pick: number[] = [];

  const score = (cost: number, med: number, prices: number[], meds: number[]): number[] | null => {
    if (objective === 'STARS') return [Math.max(...meds), med, -cost];
    if (objective === 'VALUE') return [med / cost, med];
    if (objective === 'POINTS') return [med, -cost];
    // BALANCED: every seat within half to one-and-a-half times the even share of the bank
    if (prices.some((p) => p < band * 0.5 || p > band * 1.5)) return null;
    return [med, -cost];
  };
  const better = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
    return false;
  };

  const walk = (start: number, cost: number) => {
    if (pick.length === seats) {
      const chosen = pick.map((i) => pool[i]);
      const med = chosen.reduce((s, c) => s + c.med, 0);
      const key = score(cost, med, chosen.map((c) => c.price), chosen.map((c) => c.med));
      if (key && (!best || better(key, best.key))) best = { ids: chosen.map((c) => c.id), cost, med, key };
      return;
    }
    for (let i = start; i < pool.length; i++) {
      const c = cost + pool[i].price;
      if (c > bank) break; // sorted by price: nothing further fits either
      pick.push(i);
      walk(i + 1, c);
      pick.pop();
    }
  };
  walk(0, 0);

  const b = best as Best | null;
  return b ? { ids: b.ids, cost: b.cost, med: Math.round(b.med * 10) / 10 } : null;
}
