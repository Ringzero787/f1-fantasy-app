/**
 * F-151: the season the game is in, for every server path that counts or orders races.
 *
 * Before this, "completed races" meant every completed race ever: a 2027 purchase would have been
 * stamped as race 22+ (`addedAtRace`), contract lockouts would run on that all-time clock, a season
 * lock would count 2026 and 2027 races alike, and a re-scored 2026 race could add 2026 points to a
 * team that had started 2027.
 *
 * The source is `config/app.currentSeason`, which the season rollover (F-150) sets and no client may
 * write (firestore.rules). Until it exists the season is read off the races themselves — the season
 * of the most recent race that has started, so no year is written into the code. "Started", not
 * "next to run": with the 2027 calendar seeded and the switch not yet made, the next race is 2027's
 * opener, and a late correction to Abu Dhabi would have been refused as a past season.
 */
import type * as admin from 'firebase-admin';

const YEAR = /^\d{4}$/;

interface RaceLike { seasonId?: unknown; status?: unknown; schedule?: { race?: unknown } | null }

const ms = (v: unknown): number => {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) return new Date(v).getTime();
  return NaN;
};
/** A season id as the races store it ('2026'); a number is read as the same year. */
export function seasonId(v: unknown): string | null {
  const s = typeof v === 'number' && Number.isInteger(v) ? String(v) : v;
  return typeof s === 'string' && YEAR.test(s) ? s : null;
}
const seasonOf = (r: RaceLike): string | null => seasonId(r.seasonId);

/**
 * Pure: the season from the race calendar — the season of the most recent race (not cancelled) whose
 * start has passed, else of the earliest one still to come. Null for an empty calendar.
 */
export function seasonFromRaces(races: ReadonlyArray<RaceLike>, nowMs: number = Date.now()): string | null {
  const dated = races.filter((r) => seasonOf(r) && r.status !== 'cancelled' && Number.isFinite(ms(r.schedule?.race)));
  const started = dated.filter((r) => ms(r.schedule?.race) <= nowMs).sort((a, b) => ms(b.schedule?.race) - ms(a.schedule?.race));
  if (started.length) return seasonOf(started[0]);
  const coming = dated.sort((a, b) => ms(a.schedule?.race) - ms(b.schedule?.race));
  return coming.length ? seasonOf(coming[0]) : null;
}

/** The current season: `config/app.currentSeason`, else read off the races. Null only with no races at all. */
export async function currentSeason(db: admin.firestore.Firestore, nowMs: number = Date.now()): Promise<string | null> {
  const cfg = (await db.doc('config/app').get()).data();
  const pinned = cfg ? seasonId(cfg.currentSeason) : null;
  if (pinned) return pinned;
  const races = await db.collection('races').get();
  return seasonFromRaces(races.docs.map((d) => d.data() as RaceLike), nowMs);
}

/** Pure: true when a race belongs to a season before the current one — it must not score into today's teams. */
export function isPastSeason(raceSeason: unknown, current: string | null): boolean {
  const race = seasonId(raceSeason);
  if (current === null || race === null) return false;
  return Number(race) < Number(current);
}

/**
 * The scorers' guard: true (and an error log line) when this race is from a season before the
 * current one. Race, qualifying and sprint scoring all call it, so they judge a season id alike.
 */
export async function refusePastSeason(db: admin.firestore.Firestore, raceId: string, raceSeason: unknown, tag: string): Promise<boolean> {
  const current = await currentSeason(db);
  if (!isPastSeason(raceSeason, current)) return false;
  console.error(`[${tag}] NOT SCORING ${raceId}: season ${String(raceSeason)} is before the current season ${current}`);
  return true;
}

/** The current season's races with this status (all seasons when no season can be read, as before). */
export async function seasonRaces(db: admin.firestore.Firestore, season: string | null, status: string) {
  const q = db.collection('races').where('status', '==', status);
  return (season === null ? q : q.where('seasonId', '==', season)).get();
}

/** Completed races this season: the clock `addedAtRace` and contract lockouts are stamped and compared on. */
export async function completedRaceCount(db: admin.firestore.Firestore): Promise<number> {
  return (await seasonRaces(db, await currentSeason(db), 'completed')).size;
}
