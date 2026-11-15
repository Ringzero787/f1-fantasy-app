/**
 * F-151: the season the game is in, for every server path that counts or orders races.
 *
 * Before this, "completed races" meant every completed race ever: a 2027 purchase would have been
 * stamped as race 22+ (`addedAtRace`), contract lockouts would run on that all-time clock, a season
 * lock would count 2026 and 2027 races alike, and a re-scored 2026 race could add 2026 points to a
 * team that had started 2027.
 *
 * The source is `config/app.currentSeason`, which the season rollover (F-150) sets. Until it exists
 * the season is read off the races themselves — the season of the next race still to run, or of the
 * last one run — so no year is written into the code.
 */
import type * as admin from 'firebase-admin';

const YEAR = /^\d{4}$/;

interface RaceLike { seasonId?: unknown; status?: unknown; schedule?: { race?: unknown } | null }

const ms = (v: unknown): number => {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) return new Date(v).getTime();
  return NaN;
};
const seasonOf = (r: RaceLike): string | null => (typeof r.seasonId === 'string' && YEAR.test(r.seasonId) ? r.seasonId : null);

/**
 * Pure: the season from the race calendar — the earliest race not yet completed or cancelled, else
 * the latest completed one. Null for an empty calendar.
 */
export function seasonFromRaces(races: ReadonlyArray<RaceLike>): string | null {
  const dated = races.filter((r) => seasonOf(r) && Number.isFinite(ms(r.schedule?.race)));
  const open = dated.filter((r) => r.status !== 'completed' && r.status !== 'cancelled').sort((a, b) => ms(a.schedule?.race) - ms(b.schedule?.race));
  if (open.length) return seasonOf(open[0]);
  const done = dated.filter((r) => r.status === 'completed').sort((a, b) => ms(b.schedule?.race) - ms(a.schedule?.race));
  return done.length ? seasonOf(done[0]) : null;
}

/** The current season: `config/app.currentSeason`, else read off the races. Null only with no races at all. */
export async function currentSeason(db: admin.firestore.Firestore): Promise<string | null> {
  const cfg = (await db.doc('config/app').get()).data();
  if (cfg && typeof cfg.currentSeason === 'string' && YEAR.test(cfg.currentSeason)) return cfg.currentSeason;
  const races = await db.collection('races').get();
  return seasonFromRaces(races.docs.map((d) => d.data() as RaceLike));
}

/** Pure: true when a race belongs to a season before the current one — it must not score into today's teams. */
export function isPastSeason(raceSeason: unknown, current: string | null): boolean {
  if (current === null || typeof raceSeason !== 'string' || !YEAR.test(raceSeason)) return false;
  return Number(raceSeason) < Number(current);
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
