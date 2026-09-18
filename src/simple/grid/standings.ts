/**
 * Standings rows for the LEAGUE tab — pure. Sorting mirrors the server's
 * rankLeagueMembers order (totalPoints desc, lastRacePoints desc, userId
 * asc); the LAST RACE toggle re-ranks by the last race alone.
 */
export type StandingsSort = 'season' | 'last';

export interface StandingsMember {
  userId: string;
  displayName: string;
  teamName?: string;
  totalPoints: number;
  lastRacePoints?: number;
  /** Rank before the last race (F-054); undefined → movement shows `—` */
  previousRank?: number;
  rank?: number;
  isWithdrawn?: boolean;
}

export interface StandingsRow {
  userId: string;
  rank: number;
  rankLabel: string;      // "01"
  name: string;
  team: string;
  value: number;
  shown: string;          // "1,284" or "+86"
  delta: string;          // "LEADER" or "-33"
  isLeader: boolean;
  isMe: boolean;
  movement: string;       // "▲ 1", "▼ 2", "—"
  movementDir: 'up' | 'down' | 'flat';
}

export function rankStandings(members: StandingsMember[], sortBy: StandingsSort, userId: string | null): StandingsRow[] {
  const byLast = sortBy === 'last';
  const value = (m: StandingsMember) => (byLast ? m.lastRacePoints ?? 0 : m.totalPoints ?? 0);
  const sorted = members
    .filter((m) => !m.isWithdrawn)
    .slice()
    .sort((a, b) =>
      value(b) - value(a)
      || (b.lastRacePoints ?? 0) - (a.lastRacePoints ?? 0)
      || (byLast ? (b.totalPoints ?? 0) - (a.totalPoints ?? 0) : 0)
      || a.userId.localeCompare(b.userId),
    );
  const lead = sorted.length ? value(sorted[0]) : 0;
  return sorted.map((m, i) => {
    const rank = i + 1;
    const v = value(m);
    const gap = lead - v;
    const mv = !byLast && m.previousRank != null ? m.previousRank - rank : null;
    return {
      userId: m.userId,
      rank,
      rankLabel: String(rank).padStart(2, '0'),
      name: m.displayName || 'Player',
      team: m.teamName || '',
      value: v,
      shown: byLast ? `${v >= 0 ? '+' : ''}${v}` : v.toLocaleString(),
      delta: gap === 0 ? 'LEADER' : `-${gap.toLocaleString()}`,
      isLeader: gap === 0,
      isMe: !!userId && m.userId === userId,
      movement: mv == null ? '—' : mv > 0 ? `▲ ${mv}` : mv < 0 ? `▼ ${-mv}` : '—',
      movementDir: mv == null || mv === 0 ? 'flat' : mv > 0 ? 'up' : 'down',
    };
  });
}

/** `LEAGUE` / `6 PLAYERS` header captions. */
export function playersCaption(count: number, max?: number): string {
  if (max && max > 0) return `${count} / ${max} PLAYERS`;
  return `${count} PLAYER${count === 1 ? '' : 'S'}`;
}

/** Profile status line: `P1 · PADDOCK PALS`, or `RACING SOLO` without a league. */
export function profileStatusLine(rank: number | null | undefined, leagueName: string | null | undefined): string {
  if (!leagueName) return 'RACING SOLO';
  const name = leagueName.trim().toUpperCase();
  return rank ? `P${rank} · ${name}` : name;
}
