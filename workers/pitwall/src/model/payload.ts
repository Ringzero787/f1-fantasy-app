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
import { blendPriceChange, pointsToRise, pointsToSoftFall } from './priceRules';
import type { SessionWeather } from './weather';
import type { WeatherMap } from './weatherMap';
import { headlineOnly, type WireItem } from './wire';
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
  /** session forecast for this round, empty when there is none to be had */
  weather?: SessionWeather[];
  /** who the forecast came from, which their terms require us to print */
  weatherSource?: string | null;
  /** the forecast grid around the circuit, when one could be fetched */
  weatherMap?: WeatherMap | null;
  /** headlines for the round from the app's own feeds */
  news?: WireItem[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const shortName = (name: string) => name.trim().split(/\s+/).pop() ?? name;

export function buildPayload(i: PayloadInputs) {
  const byId = new Map(i.projections.map((p) => [p.entityId, p]));
  const teams = Object.fromEntries(i.constructors.map((c) => [c.id, { id: c.id, name: shortTeamName(c.name, c.id), color: c.colors?.primary ?? '#7A7A7A' }]));
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
      // The price model, from the same rules production scores with, so the portal states it
      // rather than deriving a plausible-looking number from the price.
      ptsRise: pointsToRise(d.price), ptsHold: pointsToSoftFall(d.price),
      pRise: p ? Math.round(p.pRise * 100) : 0, pFall: p ? Math.round(p.pFall * 100) : 0,
      // timing-derived gaps are free-only frames (ADR-001) and come from another job; 0 = unknown here
      q: 0, r: 0,
      val: d.price > 0 ? r1((med / d.price) * 100) : 0,
    };
  }).sort((a, b) => b.med - a.med);
  const constructors = i.constructors.map((c) => {
    const p = byId.get(c.id); const med = p ? Math.round(p.median) : 0;
    return { id: c.id, name: shortTeamName(c.name, c.id), team: c.id, price: c.price, med, floor: p ? Math.round(p.floor) : 0, ceil: p ? Math.round(p.ceiling) : 0, val: c.price > 0 ? r1((med / c.price) * 100) : 0, ctor: true as const };
  }).sort((a, b) => b.med - a.med);

  const full = {
    example: false,
    asOf: i.asOf.toISOString(),
    round: { number: i.round.round, name: i.round.city || i.round.name, firstSession: i.round.firstSession ? i.round.firstSession.toISOString() : '', locksIn: i.round.lockAt ? i.round.lockAt.toISOString() : '', circuit: i.round.circuit },
    rounds: i.nextRounds.map((r) => r.label),
    budget: i.budget,
    teams, drivers, constructors,
    news: i.news ?? [], rivals: [] as never[],
    league: { name: '', size: 0, myRank: 0 },
    // Conditions are not analysis and are never sold (ADR-001), so they ride in both documents.
    weather: i.weather ?? [],
    weatherSource: i.weatherSource ?? null,
    weatherMap: i.weatherMap ?? null,
    model: { runs: 10000, band: 'central 70% of finishing runs', pDnfSeparate: true },
  };
  // Free look: the projection itself is free for the whole grid, and the analysis built on it is
  // what the pass buys. Holding back medians past the top ten made a reader's own lineup impossible
  // to total, which is worse than useless: it produced a number that was simply wrong.
  const stripped = { floor: 0, ceil: 0, dnf: 0, own: 0, pm: 0, cons: 0, dprice: 0, win: 0, pod: 0, t10: 0, val: 0, form: [] as number[], ptsRise: 0, ptsHold: 0, pRise: 0, pFall: 0 };
  // Built field by field rather than spread from `full`: a spread would hand the free document
  // every field added to the paid one later, so the next thing published (tagged news, rival
  // lineups) would leak the day it lands. Adding something paid here has to be deliberate.
  const free = {
    example: full.example,
    asOf: full.asOf,
    round: full.round,
    rounds: full.rounds,
    budget: full.budget,
    teams: full.teams,
    drivers: drivers.map((d) => ({ ...d, ...stripped })),
    constructors: constructors.map((c) => ({ ...c, floor: 0, ceil: 0, val: 0 })),
    // Headlines are free and link to their source; the body is the pass (ADR-001).
    news: full.news.map(headlineOnly),
    rivals: [] as never[],
    league: { name: '', size: 0, myRank: 0 },
    weather: full.weather,
    weatherSource: full.weatherSource,
    weatherMap: full.weatherMap,
    model: full.model,
  };
  return { full, free };
}

/**
 * Short constructor names by id, the same list the app uses in `src/simple/grid/entityNames.ts`,
 * so a team reads the same in the app and the portal.
 */
const TEAM_NAMES: Record<string, string> = {
  mclaren: 'McLaren', ferrari: 'Ferrari', mercedes: 'Mercedes', red_bull: 'Red Bull',
  williams: 'Williams', haas: 'Haas', aston_martin: 'Aston Martin', alpine: 'Alpine',
  rb: 'RB', racing_bulls: 'RB', audi: 'Audi', cadillac: 'Cadillac',
};

export function shortTeamName(name: string, id?: string): string {
  if (id && TEAM_NAMES[id]) return TEAM_NAMES[id];
  // Fallback for an id we do not know: strip sponsors and series words. Note it cannot be trusted
  // on its own — "Racing Bulls" comes out of it as "Bulls", which is why the map above exists.
  const stripped = name.replace(/\b(F1|Formula\s*(?:1|One)|Team|Scuderia|Petronas|Oracle|Aramco|MoneyGram|BWT|AMG|Motorsport)\b/gi, ' ').replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
  // "Racing" only ever goes from the end: "Oracle Red Bull Racing" is Red Bull, and "Racing Bulls"
  // is not "Bulls".
  const words = stripped.replace(/\s+Racing$/i, '').trim();
  return words || name;
}
