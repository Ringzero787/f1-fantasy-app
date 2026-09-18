/**
 * Standings-movement and best-race fields (F-054) — pure helpers used by
 * calculatePoints so the client can show ▲/▼ per player and a BEST race
 * without any per-race history.
 *
 * previousRank is snapshotted once per race weekend: the first ranking pass
 * for a given raceId (qualifying, sprint or the race itself) copies the
 * member's current rank into previousRank and stamps previousRankRaceId, and
 * later passes in the same weekend leave the snapshot alone. Movement on the
 * client is previousRank − rank.
 */

export interface RankedMember {
  id: string;
  totalPoints?: number;
  lastRacePoints?: number;
  rank?: number;
  previousRank?: number;
  previousRankRaceId?: string;
}

export interface RankWrite {
  id: string;
  data: { rank: number; previousRank?: number; previousRankRaceId?: string };
}

/** Deterministic order: totalPoints desc, lastRacePoints desc, id asc. */
export function orderMembers<T extends RankedMember>(members: T[]): T[] {
  return [...members].sort((a, b) => {
    const byTotal = (b.totalPoints || 0) - (a.totalPoints || 0);
    if (byTotal !== 0) return byTotal;
    const byLast = (b.lastRacePoints || 0) - (a.lastRacePoints || 0);
    if (byLast !== 0) return byLast;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * New rank per member, plus the previousRank snapshot when `raceId` starts a
 * new weekend for that member. Without a raceId (repairs) only rank is written.
 */
export function rankWrites(members: RankedMember[], raceId?: string): RankWrite[] {
  return orderMembers(members).map((m, i) => {
    const data: RankWrite['data'] = { rank: i + 1 };
    if (raceId && m.previousRankRaceId !== raceId) {
      // A member ranked for the first time has no "before"; keep it absent so
      // the client shows — rather than a fake climb from nowhere.
      if (typeof m.rank === 'number') data.previousRank = m.rank;
      data.previousRankRaceId = raceId;
    }
    return { id: m.id, data };
  });
}

/** Fields to merge onto a team when this race beat its best; {} otherwise. */
export function bestRaceUpdate(
  team: { bestRacePoints?: number | null },
  raceId: string,
  racePoints: number,
): { bestRacePoints: number; bestRaceId: string } | Record<string, never> {
  const current = typeof team.bestRacePoints === 'number' ? team.bestRacePoints : null;
  if (current === null || racePoints > current) return { bestRacePoints: racePoints, bestRaceId: raceId };
  return {};
}
