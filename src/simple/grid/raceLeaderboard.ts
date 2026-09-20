/**
 * Per-race league leaderboard (F-062) — pure helpers for the LEAGUE tab.
 * The server writes `leagues/{id}/raceResults/{raceId}` after each race; the
 * panel lists the season's completed races and reads one document per pick.
 */
import type { StandingsRow } from './standings';

export interface RaceResultEntry {
  userId: string;
  displayName?: string | null;
  teamName?: string | null;
  points: number;
  rank: number;
}

export interface LeagueRaceResultDoc {
  raceId: string;
  season?: string | null;
  round?: number | null;
  raceName?: string | null;
  entries: RaceResultEntry[];
  winners: string[];
  topPoints?: number | null;
  /** backfilled from partial data (race-day points only), not from snapshots taken at the time */
  estimated?: boolean;
}

export interface RaceOption {
  raceId: string;
  round: number;
  /** "RD 16 · SPANISH" */
  label: string;
}

interface RaceLike { id: string; round: number; name: string; seasonId?: string; status?: string }

/** Drop the series' own words from a race name so the label stays short and generic. */
export function shortRaceName(name: string): string {
  return name.replace(/\s*grand\s+prix\s*$/i, '').trim() || name;
}

/**
 * Completed races of the latest season, newest first. With `withResults` (the league's
 * `raceResultIds`) only races that have a leaderboard are listed, so the selector has no dead entries.
 */
export function raceOptions(races: RaceLike[], withResults?: string[] | null): RaceOption[] {
  const have = withResults ? new Set(withResults) : null;
  const season = races.reduce<string | undefined>((s, r) => (r.seasonId && (!s || r.seasonId > s) ? r.seasonId : s), undefined);
  return races
    .filter((r) => r.status === 'completed' && (!season || r.seasonId === season) && (!have || have.has(r.id)))
    .sort((a, b) => b.round - a.round)
    .map((r) => ({ raceId: r.id, round: r.round, label: `RD ${r.round} · ${shortRaceName(r.name).toUpperCase()}` }));
}

/** Rows for one race, in the same shape the season table renders. */
export function raceResultRows(result: LeagueRaceResultDoc | null, userId: string | null): StandingsRow[] {
  if (!result || !Array.isArray(result.entries)) return [];
  const winners = new Set(result.winners ?? []);
  const lead = result.entries.reduce((m, e) => Math.max(m, e.points), Number.NEGATIVE_INFINITY);
  return result.entries.map((e) => {
    const gap = lead - e.points;
    const won = winners.has(e.userId);
    return {
      userId: e.userId,
      rank: e.rank,
      rankLabel: String(e.rank).padStart(2, '0'),
      name: e.displayName || 'Player',
      team: e.teamName || '',
      value: e.points,
      shown: `${e.points >= 0 ? '+' : ''}${e.points.toLocaleString()}`,
      delta: won ? 'WINNER' : gap === 0 ? '—' : `-${gap.toLocaleString()}`,
      isLeader: won,
      isMe: !!userId && e.userId === userId,
      movement: '—',
      movementDir: 'flat' as const,
    };
  });
}

/** "LATE BRAKERS · 2 WINS" for the season table; the team name alone without wins. */
export function teamLineWithWins(team: string, raceWins: number | undefined | null): string {
  const n = typeof raceWins === 'number' && raceWins > 0 ? Math.floor(raceWins) : 0;
  if (n === 0) return team;
  const wins = `${n} WIN${n === 1 ? '' : 'S'}`;
  return team ? `${team} · ${wins}` : wins;
}
