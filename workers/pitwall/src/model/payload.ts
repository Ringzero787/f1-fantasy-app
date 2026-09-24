/**
 * Turns a projection run into the documents the portal reads (F-070 → F-072). The shape mirrors
 * `web/pitwall/src/data/types.ts` Payload exactly, so a page never changes when real data replaces
 * the example data. Pure: the CLI supplies inputs and does the writing.
 *
 * Two documents per round:
 *   pw_pages/{season}_{round}   full payload, read with the pass claim
 *   pw_public/{season}_{round}  the free look: same shape, but only the top 10 medians, no floor/ceiling,
 *                               no price model, no rivals, headlines only
 */
import { blendPriceChange } from './priceRules';
import type { Projection } from './types';

export interface DriverMeta { id: string; number: number; name: string; constructorId: string; price: number; isActive: boolean }
export interface ConstructorMeta { id: string; name: string; price: number; colors?: { primary?: string } }
export interface RoundMeta { season: string; round: number; raceId: string; name: string; city: string; circuit: string; firstSession: Date | null; lockAt: Date | null; hasSprint: boolean }

/** Pricing points per past round per entity, so the price direction shown matches the backtest. */
export type PricingHistory = Map<string, number[]>;

export interface PayloadInputs {
  round: RoundMeta;
  nextRounds: Array<{ round: number; label: string; hasSprint: boolean }>;
  drivers: DriverMeta[];
  constructors: ConstructorMeta[];
  projections: Projection[];
  /** neutral points per driver id per past round, oldest first (from raceScores) */
  form: Map<string, number[]>;
  /** share of league lineups holding each driver, 0..100, when known */
  ownership: Map<string, number>;
  /** the average of the last three rounds' points, for the "plus/minus vs price-implied" line */
  priceImplied: (price: number) => number;
  /** pricing points per entity per past round; without it the simulation's raw expectation is used */
  pricingHistory?: PricingHistory;
  asOf: Date;
  budget: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const shortName = (name: string) => name.trim().split(/\s+/).pop() ?? name;

export function buildPayload(i: PayloadInputs) {
  const byId = new Map(i.projections.map((p) => [p.entityId, p]));
  const teams = Object.fromEntries(i.constructors.map((c) => [c.id, { id: c.id, name: shortTeamName(c.name), color: c.colors?.primary ?? '#7A7A7A' }]));
  const drivers = i.drivers.filter((d) => d.isActive).map((d) => {
    const p = byId.get(d.id);
    const med = p ? Math.round(p.median) : 0;
    const hist = i.form.get(d.id) ?? [];
    const implied = i.priceImplied(d.price);
    const hits = hist.filter((v) => v >= implied).length;
    return {
      id: d.id, num: d.number, name: shortName(d.name), team: d.constructorId, price: d.price,
      med, floor: p ? Math.round(p.floor) : 0, ceil: p ? Math.round(p.ceiling) : 0,
      form: hist, dnf: p ? Math.round(p.pDnf * 100) : 0, own: Math.round(i.ownership.get(d.id) ?? 0),
      pm: r1(med - implied), cons: hist.length ? Math.round((hits / hist.length) * 100) : 0,
      dprice: p ? Math.round(blendPriceChange(p.expectedPriceChange, i.pricingHistory?.get(d.id) ?? [], d.price)) : 0,
      // circuit fit needs the characteristics table (F-070 "inputs that do not exist"); neutral until then
      fit: i.nextRounds.map(() => 3),
      win: p ? Math.round(p.pWin * 100) : 0, pod: p ? Math.round(p.pPodium * 100) : 0, t10: p ? Math.round(p.pTop10 * 100) : 0,
      // timing-derived gaps are free-only frames (ADR-001) and come from another job; 0 = unknown here
      q: 0, r: 0,
      val: d.price > 0 ? r1((med / d.price) * 100) : 0,
    };
  }).sort((a, b) => b.med - a.med);
  const constructors = i.constructors.map((c) => {
    const p = byId.get(c.id); const med = p ? Math.round(p.median) : 0;
    return { id: c.id, name: shortTeamName(c.name), team: c.id, price: c.price, med, floor: p ? Math.round(p.floor) : 0, ceil: p ? Math.round(p.ceiling) : 0, val: c.price > 0 ? r1((med / c.price) * 100) : 0, ctor: true as const };
  }).sort((a, b) => b.med - a.med);

  const full = {
    example: false,
    asOf: i.asOf.toISOString(),
    round: { number: i.round.round, name: i.round.city || i.round.name, firstSession: i.round.firstSession ? i.round.firstSession.toISOString() : '', locksIn: i.round.lockAt ? i.round.lockAt.toISOString() : '', circuit: i.round.circuit },
    rounds: i.nextRounds.map((r) => r.label),
    budget: i.budget,
    teams, drivers, constructors,
    news: [] as never[], rivals: [] as never[],
    league: { name: '', size: 0, myRank: 0 },
    model: { runs: 10000, band: 'central 70% of finishing runs', pDnfSeparate: true },
  };
  // free look: top-10 medians, nothing else that only the pass buys
  const free = {
    ...full,
    drivers: drivers.slice(0, 10).map((d) => ({ ...d, floor: 0, ceil: 0, dnf: 0, own: 0, pm: 0, cons: 0, dprice: 0, win: 0, pod: 0, t10: 0, val: 0, form: [] })),
    constructors: constructors.slice(0, 3).map((c) => ({ ...c, floor: 0, ceil: 0, val: 0 })),
  };
  return { full, free };
}

export function shortTeamName(name: string): string {
  // "Oracle Red Bull Racing" -> "Red Bull", "Mercedes-AMG Petronas F1 Team" -> "Mercedes": strip sponsors and series words
  const words = name.replace(/\b(F1|Formula\s*1|Team|Racing|Scuderia|Petronas|Oracle|Aramco|MoneyGram|BWT|AMG|Motorsport)\b/gi, ' ').replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
  return words || name;
}
