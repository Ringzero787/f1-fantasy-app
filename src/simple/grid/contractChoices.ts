/**
 * F-169: the contract lengths a purchase may choose. The picker's copy of the server's rules in
 * functions/src/teams/contractRules.ts — the server clamps whatever is sent, so this only keeps the
 * sheet from offering a length the purchase would not get.
 *
 * 1. Never past the end of the season.
 * 2. Never more than six races in a row with one driver: a driver sold and re-bought before the
 *    next race keeps the run, and a driver at six is locked out until a race has passed.
 */
import type { Race } from '../../types';

export const MAX_CONTRACT = 6;
export const MAX_IN_A_ROW = 6;

type RaceLike = Pick<Race, 'seasonId' | 'status'> & { schedule?: { race?: unknown } | null };

const ms = (v: unknown): number => {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate().getTime();
  if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) return new Date(v).getTime();
  return NaN;
};

/**
 * The season the game is in, as the server reads it (functions/src/season/current.ts): the season
 * the rollover pinned (`config/app.currentSeason`) when there is one, else off the calendar — the
 * season of the most recent race that has started, else of the next one. Then its completed races
 * and the races still to run. Null with neither a pinned season nor dated races.
 */
export function seasonClock(races: ReadonlyArray<RaceLike>, nowMs: number, pinned?: string | null): { season: string; completed: number; racesLeft: number } | null {
  let season: string;
  if (typeof pinned === 'string' && /^\d{4}$/.test(pinned)) {
    season = pinned;
  } else {
    const dated = races.filter((r) => r.seasonId && r.status !== 'cancelled' && Number.isFinite(ms(r.schedule?.race)));
    if (!dated.length) return null;
    const started = dated.filter((r) => ms(r.schedule?.race) <= nowMs).sort((a, b) => ms(b.schedule?.race) - ms(a.schedule?.race));
    season = String((started[0] ?? [...dated].sort((a, b) => ms(a.schedule?.race) - ms(b.schedule?.race))[0]).seasonId);
  }
  const inSeason = races.filter((r) => String(r.seasonId) === season);
  return {
    season,
    completed: inSeason.filter((r) => r.status === 'completed').length,
    racesLeft: inSeason.filter((r) => r.status !== 'completed' && r.status !== 'cancelled').length,
  };
}

/** Races this team has already held the driver in a row, if it sold them in this same window. */
export function priorStreak(streaks: Record<string, { held: number; atRace: number }> | undefined, driverId: string, completed: number): number {
  const e = streaks && Object.prototype.hasOwnProperty.call(streaks, driverId) ? streaks[driverId] : undefined;
  if (!e || typeof e.held !== 'number' || e.atRace !== completed) return 0;
  return Math.max(0, Math.floor(e.held));
}

export interface ContractLimit {
  /** the longest contract allowed; 0 = the driver cannot be bought now */
  max: number;
  /** why the max is below MAX_CONTRACT, for the sheet; null when it is not */
  why: string | null;
}

export function contractLimit(racesLeft: number | null, prior = 0): ContractLimit {
  const streakRoom = MAX_IN_A_ROW - prior;
  if (streakRoom <= 0) return { max: 0, why: `${MAX_IN_A_ROW} RACES IN A ROW · BACK AFTER THE NEXT RACE` };
  const seasonRoom = racesLeft == null ? MAX_CONTRACT : Math.max(1, racesLeft);
  const max = Math.min(MAX_CONTRACT, seasonRoom, streakRoom);
  if (max === MAX_CONTRACT) return { max, why: null };
  if (streakRoom <= seasonRoom) return { max, why: `ON YOUR TEAM ${prior} RACES IN A ROW · ${max} MORE AT MOST` };
  return { max, why: `${seasonRoom} RACE${seasonRoom === 1 ? '' : 'S'} LEFT THIS SEASON` };
}

/** The lengths the sheet offers, and the one it starts on (the default, or the longest allowed). */
export function contractChoices(limit: ContractLimit, preferred: number): { choices: number[]; initial: number } {
  const choices = Array.from({ length: Math.max(0, limit.max) }, (_, i) => i + 1);
  return { choices, initial: Math.min(preferred, Math.max(1, limit.max)) };
}
