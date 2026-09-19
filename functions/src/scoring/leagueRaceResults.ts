/**
 * Per-race league leaderboard and race winners (F-062) — pure helpers.
 *
 * After a race is scored, calculatePoints writes
 * `leagues/{leagueId}/raceResults/{raceId}` with every member's points for that
 * weekend, ranked. `raceWins` on a member is then SET to the number of result
 * documents that name them a winner, so a repeated scoring run can never
 * increment twice: the same inputs give the same documents and the same counts.
 */

export interface RaceEntryIn {
  userId: string;
  points: number;
  displayName?: string;
  teamName?: string;
}

export interface RaceEntry {
  userId: string;
  displayName: string | null;
  teamName: string | null;
  points: number;
  /** competition ranking: ties share a rank and the next rank skips (1, 1, 3) */
  rank: number;
}

export interface LeagueRaceResult {
  entries: RaceEntry[];
  /** everyone tied on the top score; empty when nobody scored above zero */
  winners: string[];
  topPoints: number | null;
}

const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function rankRaceEntries(entriesIn: RaceEntryIn[]): LeagueRaceResult {
  const sorted = [...entriesIn]
    .map((e) => ({ ...e, points: finite(e.points) }))
    .sort((a, b) => (b.points - a.points) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  const entries: RaceEntry[] = [];
  sorted.forEach((e, i) => {
    const rank = i > 0 && sorted[i - 1].points === e.points ? entries[i - 1].rank : i + 1;
    entries.push({ userId: e.userId, displayName: e.displayName ?? null, teamName: e.teamName ?? null, points: e.points, rank });
  });
  const topPoints = entries.length > 0 ? entries[0].points : null;
  // A weekend nobody scored in has no winner: an empty league of open rosters must not hand out wins.
  const winners = topPoints !== null && topPoints > 0 ? entries.filter((e) => e.points === topPoints).map((e) => e.userId) : [];
  return { entries, winners, topPoints };
}

export interface StoredRaceResult {
  season?: string | null;
  winners?: unknown;
  /** backfilled estimates never count towards race wins */
  estimated?: boolean;
}

/** Race wins per user for one season, counted from the stored result documents. */
export function countRaceWins(results: StoredRaceResult[], season: string | null): Map<string, number> {
  const wins = new Map<string, number>();
  for (const r of results) {
    if (r.estimated === true) continue;
    if (season !== null && (r.season ?? null) !== season) continue;
    if (!Array.isArray(r.winners)) continue;
    for (const w of new Set(r.winners)) {
      if (typeof w === 'string') wins.set(w, (wins.get(w) ?? 0) + 1);
    }
  }
  return wins;
}

/** Member updates: every member gets their exact count, including 0, so a corrected result can take a win away. */
export function raceWinWrites(memberIds: string[], wins: Map<string, number>, current: Map<string, number | undefined>): Array<{ id: string; raceWins: number }> {
  return memberIds
    .map((id) => ({ id, raceWins: wins.get(id) ?? 0 }))
    .filter((w) => current.get(w.id) !== w.raceWins);
}
