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
  /** qualifying and race pace gaps (timing-derived: free frames only, ADR-001) */
  q: number; r: number;
  val: number;
  lev?: number;
}

export interface Constructor { id: string; name: string; team: string; price: number; med: number; floor: number; ceil: number; val: number; ctor: true }
export type Entity = Driver | Constructor;
export const isCtor = (e: Entity): e is Constructor => (e as Constructor).ctor === true;

export type NewsKind = 'PENALTY' | 'UPGRADE' | 'WEATHER' | 'RELIABILITY' | 'CONTRACT';
export interface NewsItem { kind: NewsKind; entity: string | null; tone: '+' | '-' | '•'; text: string; sources: string; detail: string }
export interface Rival { name: string; rank: number; gap: number; lineup: string[]; bank: number; activity: number }

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
}

export interface Lineup { drivers: string[]; ctor: string; ace: string }
