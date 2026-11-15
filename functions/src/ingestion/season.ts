/**
 * F-149: which season a race document belongs to, and which OpenF1 meeting is that race.
 *
 * Ingestion used to read one global year (SEASON_YEAR = 2026) and a hand-kept round → race id table.
 * A 2027 race document would have been matched against the 2026 calendar by round number, so its
 * first race would have been scored with the 2026 Australian results. The round table also failed
 * on its own once: on 2026-10-01 Bahrain was reinstated as round 18 and the sync wrote its session
 * times onto singapore_2026.
 *
 * Now every job starts from the race document. Its `seasonId` picks the calendar year, and the
 * meeting is the one whose (not cancelled) Race session starts within MATCH_WINDOW_MS of the
 * document's `schedule.race`. Two race weekends are never closer than seven days, so the window
 * gives either one meeting or none; two is treated as none.
 */
import type { OpenF1Session } from './openf1Client';

/** ±3 days: a back-to-back weekend is 7 days away, a session-time correction is hours. */
export const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The season whose car numbers DRIVER_NUMBER_TO_ID lists. Car numbers change between seasons (the
 * champion takes 1, drivers move), so a race from any other season is never resolved through it.
 * Its results are held, loudly, until the table is updated for the new season and this is bumped.
 */
export const DRIVER_TABLE_SEASON = 2026;

/** A Firestore Timestamp, Date, ISO string or epoch millis as epoch millis; NaN for anything else. */
export function toMs(v: unknown): number {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return new Date(v).getTime();
  if (v instanceof Date) return v.getTime();
  const t = v as { toMillis?: () => number };
  return typeof t.toMillis === 'function' ? t.toMillis() : NaN;
}

/**
 * The season of a race document, or null when it cannot be trusted: a `seasonId` that is not a
 * year, a race id whose `_YYYY` suffix names a different year, or a race time outside that year.
 * Null means "do not ingest", never "assume this year".
 */
export function seasonOfRace(raceId: string, data: { seasonId?: unknown; schedule?: { race?: unknown } | null }): number | null {
  const raw = data.seasonId;
  const season = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d{4}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(season) || season < 2000 || season > 2100) return null;
  const suffix = /_(\d{4})$/.exec(raceId);
  if (suffix && Number(suffix[1]) !== season) return null;
  const raceMs = toMs(data.schedule?.race);
  if (Number.isFinite(raceMs) && new Date(raceMs).getUTCFullYear() !== season) return null;
  return season;
}

/** The meeting of a race, with every session OpenF1 lists for it. */
export interface MatchedMeeting {
  meetingKey: number;
  sessions: OpenF1Session[];
  race: OpenF1Session;
}

/**
 * The OpenF1 meeting that is this race: the season's sessions, a Race session that is not
 * cancelled, starting within MATCH_WINDOW_MS of the race document's race time. Null when there is
 * no such meeting, or more than one.
 */
export function meetingForRace(sessions: ReadonlyArray<OpenF1Session>, season: number, raceMs: number): MatchedMeeting | null {
  if (!Number.isFinite(raceMs)) return null;
  const inSeason = sessions.filter((s) => s.year === season);
  const races = inSeason.filter((s) => {
    if (s.session_name !== 'Race' || s.is_cancelled === true) return false;
    const start = new Date(s.date_start).getTime();
    return Number.isFinite(start) && Math.abs(start - raceMs) <= MATCH_WINDOW_MS;
  });
  const keys = new Set(races.map((s) => s.meeting_key));
  if (keys.size !== 1) return null;
  const race = races[0];
  return { meetingKey: race.meeting_key, sessions: inSeason.filter((s) => s.meeting_key === race.meeting_key), race };
}

/** Why a race cannot be ingested from the feed, or null when it can. One sentence for the logs. */
export function ingestBlocker(raceId: string, season: number | null): string | null {
  if (season == null) return `${raceId}: seasonId, race id year and race time do not agree on one season`;
  if (season !== DRIVER_TABLE_SEASON) {
    return `${raceId}: car numbers are only known for ${DRIVER_TABLE_SEASON} — update DRIVER_NUMBER_TO_ID for ${season} and set DRIVER_TABLE_SEASON = ${season}`;
  }
  return null;
}

/** Fetches each season's session list once per run, however many races ask for it. */
export function sessionsBySeason(fetch: (year: number) => Promise<OpenF1Session[]>): (season: number) => Promise<OpenF1Session[]> {
  const cache = new Map<number, Promise<OpenF1Session[]>>();
  return (season) => {
    let p = cache.get(season);
    if (!p) {
      p = fetch(season);
      cache.set(season, p);
    }
    return p;
  };
}
