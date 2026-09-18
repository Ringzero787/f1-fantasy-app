import type { FantasyTeam, FantasyDriver, FantasyConstructor } from '../../types';
import { contractDots, type ContractDots } from './contractDots';

export type Trend = 'up' | 'down' | 'flat';

export interface TrendInfo {
  trend: Trend;
  glyph: '▲' | '▼' | '•';
  last: number | null;
}

/** Compare the last race to the one before. Unknown history reads as flat. */
export function trendOf(last: number | null | undefined, prev: number | null | undefined): TrendInfo {
  if (last == null) return { trend: 'flat', glyph: '•', last: null };
  if (prev == null) return { trend: 'flat', glyph: '•', last };
  if (last > prev) return { trend: 'up', glyph: '▲', last };
  if (last < prev) return { trend: 'down', glyph: '▼', last };
  return { trend: 'flat', glyph: '•', last };
}

/** Last token of a full name ("Lando Norris" → "Norris"); the name itself when single-word. */
export function surnameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

/** 19px, stepping to 17 over 7 chars and 15 over 8 (Verstappen, Antonelli). */
export function tileNameSize(name: string): 19 | 17 | 15 {
  const n = name.trim().length;
  if (n > 8) return 15;
  if (n > 7) return 17;
  return 19;
}

export type GridTile =
  | {
      kind: 'driver';
      id: string;
      name: string;
      nameSize: 19 | 17 | 15;
      tag: string;            // car number, '' when hidden
      constructorId: string;
      pts: number;
      auto: boolean;
      ace: boolean;
      dots: ContractDots;
      trend: TrendInfo;
    }
  | {
      kind: 'constructor';
      id: string;
      name: string;
      nameSize: 19 | 17 | 15;
      constructorId: string;
      pts: number;
      auto: boolean;
      ace: boolean;
      dots: ContractDots;
      trend: TrendInfo;
    }
  | { kind: 'empty'; slot: 'driver' | 'constructor' };

export interface TileContext {
  teamSize: number;
  defaultContract: number;
  /** last-race fantasy points keyed by entity id */
  lastRace: Record<string, number>;
  /** the race before that, keyed by entity id */
  prevRace: Record<string, number>;
  /** car numbers keyed by driver id */
  numbers: Record<string, number | undefined>;
  showCarNumbers: boolean;
  /** short display names keyed by constructor id */
  constructorNames?: Record<string, string>;
}

function driverTile(d: FantasyDriver, team: FantasyTeam, ctx: TileContext): GridTile {
  const surname = surnameOf(d.name);
  const num = ctx.numbers[d.driverId];
  return {
    kind: 'driver',
    id: d.driverId,
    name: surname,
    nameSize: tileNameSize(surname),
    tag: ctx.showCarNumbers && num != null ? String(num).padStart(2, '0') : '',
    constructorId: d.constructorId,
    pts: d.pointsScored ?? 0,
    auto: !!d.isReservePick,
    ace: team.aceDriverId === d.driverId,
    dots: contractDots(d.contractLength, d.racesHeld, ctx.defaultContract),
    trend: trendOf(ctx.lastRace[d.driverId], ctx.prevRace[d.driverId]),
  };
}

function constructorTile(c: FantasyConstructor, team: FantasyTeam, ctx: TileContext): GridTile {
  const name = ctx.constructorNames?.[c.constructorId] ?? c.name;
  return {
    kind: 'constructor',
    id: c.constructorId,
    name,
    nameSize: tileNameSize(name),
    constructorId: c.constructorId,
    pts: c.pointsScored ?? 0,
    auto: !!c.isReservePick,
    ace: team.aceConstructorId === c.constructorId,
    dots: contractDots(c.contractLength, c.racesHeld, ctx.defaultContract),
    trend: trendOf(ctx.lastRace[c.constructorId], ctx.prevRace[c.constructorId]),
  };
}

/**
 * The roster's constructor pick. The field is literally named `constructor`,
 * which every JS object also inherits (its class function), so only an OWN,
 * object-valued property with a constructorId counts.
 */
export function rosterConstructor(team: unknown): FantasyConstructor | null {
  if (!team || typeof team !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(team, 'constructor')) return null;
  const c = (team as Record<string, unknown>)['constructor'];
  if (!c || typeof c !== 'object' || typeof (c as { constructorId?: unknown }).constructorId !== 'string') return null;
  return c as FantasyConstructor;
}

/** The six tiles of the Team grid: drivers, open driver slots, then the constructor. */
export function computeTiles(team: FantasyTeam, ctx: TileContext): GridTile[] {
  const drivers = team.drivers ?? [];
  const tiles: GridTile[] = drivers.map((d) => driverTile(d, team, ctx));
  for (let i = drivers.length; i < ctx.teamSize; i++) tiles.push({ kind: 'empty', slot: 'driver' });
  const c = rosterConstructor(team);
  if (c) tiles.push(constructorTile(c, team, ctx));
  else tiles.push({ kind: 'empty', slot: 'constructor' });
  return tiles;
}

export function openSlotCount(tiles: GridTile[]): number {
  return tiles.filter((t) => t.kind === 'empty').length;
}

/** `LINEUP · SET` / `LINEUP · 2 OPEN` / `LINEUP · LOCKED` */
export function lineupStatus(open: number, locked: boolean): { text: string; accent: boolean } {
  if (locked) return { text: 'LOCKED', accent: false };
  if (open > 0) return { text: `${open} OPEN`, accent: true };
  return { text: 'SET', accent: false };
}

/** Sum of last-race points across the current roster; null until scores load. */
export function rosterRacePoints(team: FantasyTeam, scores: Record<string, number>): number | null {
  if (Object.keys(scores).length === 0) return null;
  let total = 0;
  for (const d of team.drivers ?? []) total += scores[d.driverId] ?? 0;
  const c = rosterConstructor(team);
  if (c) total += scores[c.constructorId] ?? 0;
  return total;
}
