/**
 * Page payload shapes. Today they are filled by data/example.ts; the forge worker will publish
 * the same shapes to pw_public / pw_pages (F-070, F-072), so pages never change when real data lands.
 */
export interface Team { id: string; name: string; color: string }

export interface Driver {
  id: string; num: number; name: string; team: string; price: number;
  med: number; floor: number; ceil: number;
  /** points per scored round, oldest first */
  form: number[];
  dnf: number; own: number; pm: number; cons: number; dprice: number;
  /** circuit fit 1..5 for the next six rounds */
  fit: number[];
  win: number; pod: number; t10: number;
  /** price model: points needed to rise, points needed to avoid a fall, and the two chances */
  ptsRise: number; ptsHold: number; pRise: number; pFall: number;
  /** qualifying and race pace gaps (timing-derived: free frames only, ADR-001) */
  q: number; r: number;
  val: number;
  lev?: number;
}

export interface Constructor { id: string; name: string; team: string; price: number; med: number; floor: number; ceil: number; val: number; ctor: true }
export type Entity = Driver | Constructor;
export const isCtor = (e: Entity): e is Constructor => (e as Constructor).ctor === true;

export type NewsKind = 'PENALTY' | 'UPGRADE' | 'WEATHER' | 'RELIABILITY' | 'CONTRACT' | 'REGULATION' | 'PRACTICE' | 'QUALIFYING' | 'RACE' | 'NEWS';
export interface NewsItem {
  kind: NewsKind; entity: string | null; tone: '+' | '-' | '•'; text: string; sources: string;
  /** the body; empty in the free document, which carries headlines only */
  detail: string;
  /** the story at its source; empty for the example set */
  url: string;
  publishedAt: string;
}
export interface Rival { name: string; rank: number; gap: number; lineup: string[]; bank: number; activity: number }

/** One frame of the forecast grid around the circuit: rain per cell, row-major from the north-west. */
export interface MapFrame { offsetH: number; at: string; rainMm: Array<number | null>; windFromDeg: number | null; windKph: number | null }
export interface SessionMap { key: string; label: string; at: string; frames: MapFrame[] }
export interface WeatherMap { center: { lat: number; lon: number }; radius: number; spacingKm: number; sessions: SessionMap[] }

/** One session's forecast. Amounts, not chances: the source measures rainfall, so that is what is shown. */
export interface SessionWeather { key: string; label: string; at: string; tempC: number | null; rainMm: number | null; sky: string | null; windKph: number | null }

/** The circuit report (F-072 first cut): the venue's characteristics and this season's results at circuits like it. */
export interface CircuitReport {
  id: string; name: string; kind: string; speed: string; classes: string[];
  laps: number; lapKm: number; pitLossS: number; strategy: string;
  /** five-point ratings from our characteristics table */
  profile: Array<{ label: string; v: number }>;
  /** constructors by fit at this venue's classes; empty in the free document */
  fitRanking: Array<{ id: string; fit: number; n: number }>;
  /** each driver at circuits of the same class this season */
  likeThis: Array<{ id: string; n: number; avgPts: number; avgFinish: number }>;
  racesInClass: number;
}
/** Where a driver starts and finishes, averaged over this season's classifications. */
export interface PaceRow { id: string; starts: number; avgGrid: number; avgFinish: number; gained: number; finishRate: number; dnfs: number }
/** Points so far and where the season is heading on today's projections; `projected` is 0 in the free document. */
export interface SeasonRow { id: string; points: number; projected: number; starts: number; dnfs: number }

export interface Payload {
  example: boolean;
  asOf: string;
  round: { number: number; name: string; firstSession: string; locksIn: string; circuit: string };
  rounds: string[];
  budget: number;
  teams: Record<string, Team>;
  drivers: Driver[];
  constructors: Constructor[];
  news: NewsItem[];
  rivals: Rival[];
  league: { name: string; size: number; myRank: number };
  /** session forecast for this round; empty until one is published */
  weather: SessionWeather[];
  /** who the forecast came from, which their terms require us to print */
  weatherSource: string | null;
  /** the forecast grid around the circuit, when one was fetched */
  weatherMap: WeatherMap | null;
  /** the circuit report, null until the venue has characteristics */
  circuit: CircuitReport | null;
  /** classification pace rows; empty until published */
  pace: PaceRow[];
  /** the season table; empty until published */
  season: SeasonRow[];
}

export interface Lineup { drivers: string[]; ctor: string; ace: string }
