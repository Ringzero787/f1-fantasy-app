/**
 * F-157: the season the app is in, decided in one place. The app used to write the year into the
 * screens ('2026'); a 2027 build cut before the 2027 entry list exists cannot know its year that way.
 *
 * The rule is the server's (functions/src/season/current.ts), so the app and the scorer agree:
 *   1. `config/app.currentSeason`, which the season rollover (F-150) pins and no client may write;
 *   2. else the calendar: the season of the most recent race (not cancelled) whose start has passed,
 *      else of the earliest race still to come. "Started", not "next": with the 2027 calendar seeded
 *      and the rollover not yet run, the next race is 2027's opener while the game is still 2026;
 *   3. else LAST_RESORT_SEASON_ID.
 *
 * `config/app` is readable only when signed in, and the races only when online, so step 3 is
 * reached signed out AND offline (or against an empty races collection). Nothing can be written in
 * that state, so the constant only labels screens until a fetch succeeds. It is the one year
 * literal outside demo data (__tests__/utils/yearLiterals.test.ts allows this file and no other).
 */

/** The season to assume when neither the pinned season nor the calendar can be read. See above. */
export const LAST_RESORT_SEASON_ID = '2026';

const YEAR = /^\d{4}$/;

export interface SeasonRaceLike {
  seasonId?: unknown;
  status?: unknown;
  schedule?: { race?: unknown } | null;
}

const ms = (v: unknown): number => {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate().getTime();
  if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) return new Date(v).getTime();
  return NaN;
};

/** A season id as the races store it ('2026'); an integer year reads as the same; anything else is null. */
export function parseSeasonId(v: unknown): string | null {
  const s = typeof v === 'number' && Number.isInteger(v) ? String(v) : v;
  return typeof s === 'string' && YEAR.test(s) ? s : null;
}

/** The season off the calendar (rule 2), or null for a calendar with no dated races. */
export function seasonFromRaces(races: ReadonlyArray<SeasonRaceLike>, nowMs: number): string | null {
  const dated = races.filter((r) => parseSeasonId(r.seasonId) && r.status !== 'cancelled' && Number.isFinite(ms(r.schedule?.race)));
  if (!dated.length) return null;
  const started = dated.filter((r) => ms(r.schedule?.race) <= nowMs).sort((a, b) => ms(b.schedule?.race) - ms(a.schedule?.race));
  const pick = started[0] ?? [...dated].sort((a, b) => ms(a.schedule?.race) - ms(b.schedule?.race))[0];
  return parseSeasonId(pick.seasonId);
}

/** Rules 1 and 2: the pinned season when it is a valid year, else the calendar's. Null when neither is known. */
export function currentSeasonId(races: ReadonlyArray<SeasonRaceLike>, nowMs: number, pinned?: unknown): string | null {
  return parseSeasonId(pinned) ?? seasonFromRaces(races, nowMs);
}

/** Rules 1–3: never null. What screens and writes use. */
export function resolveSeasonId(races: ReadonlyArray<SeasonRaceLike>, nowMs: number, pinned?: unknown): string {
  return currentSeasonId(races, nowMs, pinned) ?? LAST_RESORT_SEASON_ID;
}

/**
 * The season a stored row belongs to: its own `seasonId`, else the season of its race in `raceSeasons`,
 * else the year in its race id (`abu_dhabi_2026`). raceScores rows written before F-168 carry no seasonId.
 */
export function rowSeasonId(row: { seasonId?: unknown; raceId?: unknown }, raceSeasons?: ReadonlyMap<string, string>): string | null {
  const own = parseSeasonId(row.seasonId);
  if (own) return own;
  if (typeof row.raceId !== 'string') return null;
  const mapped = raceSeasons?.get(row.raceId);
  if (mapped) return mapped;
  const m = /(?:^|_)(\d{4})(?:_|$)/.exec(row.raceId);
  return m ? m[1] : null;
}

export interface SeasonShape {
  /** the highest round on the season's calendar (a cancelled round keeps its number) */
  totalRounds: number;
  /** races that run (not cancelled) */
  raceCount: number;
  /** rounds that are sprint weekends, ascending */
  sprintRounds: number[];
}

/**
 * The shape of one season off the races collection, so no round count or sprint list is bundled:
 * a build cut before the next calendar is final still reads the right numbers (2027 has ten sprint
 * weekends; 2026 had six).
 */
export function seasonShape(
  races: ReadonlyArray<{ seasonId?: unknown; status?: unknown; round?: unknown; hasSprint?: unknown }>,
  seasonId: string,
): SeasonShape {
  const inSeason = races.filter((r) => parseSeasonId(r.seasonId) === seasonId && typeof r.round === 'number' && r.round > 0);
  const running = inSeason.filter((r) => r.status !== 'cancelled');
  return {
    totalRounds: inSeason.reduce((m, r) => Math.max(m, r.round as number), 0),
    raceCount: running.length,
    sprintRounds: running.filter((r) => r.hasSprint === true).map((r) => r.round as number).sort((a, b) => a - b),
  };
}
