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
  /** race points: what the roster scored this weekend */
  points: number;
  /** F-107: this weekend's settled Moonshot points, if any */
  moonshotPoints?: number;
  displayName?: string;
  teamName?: string;
  /** F-120: what the roster fielded this weekend was worth at lock; null when it is not known for every team */
  rosterValue?: number | null;
}

export interface RaceEntry {
  userId: string;
  displayName: string | null;
  teamName: string | null;
  /** race points — the ranking and race wins are decided on these alone */
  points: number;
  /** F-107 (SPEC §28): Race Points · Moonshot · Race Total, so a Moonshot stays identifiable */
  racePoints: number;
  moonshotPoints: number;
  raceTotal: number;
  /** competition ranking: ties share a rank and the next rank skips (1, 1, 3) */
  rank: number;
  /** F-120: roster value at lock, for points per dollar in the round report; null when unknown */
  rosterValue: number | null;
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
    const moonshotPoints = finite(e.moonshotPoints);
    const rosterValue = typeof e.rosterValue === 'number' && Number.isFinite(e.rosterValue) && e.rosterValue > 0 ? e.rosterValue : null;
    entries.push({ userId: e.userId, displayName: e.displayName ?? null, teamName: e.teamName ?? null, points: e.points, racePoints: e.points, moonshotPoints, raceTotal: e.points + moonshotPoints, rank, rosterValue });
  });
  const topPoints = entries.length > 0 ? entries[0].points : null;
  // A weekend nobody scored in has no winner: an empty league of open rosters must not hand out wins.
  const winners = topPoints !== null && topPoints > 0 ? entries.filter((e) => e.points === topPoints).map((e) => e.userId) : [];
  return { entries, winners, topPoints };
}

interface PricedEntity { currentPrice?: unknown; purchasePrice?: unknown }

/** A full lineup is five drivers and a constructor (teams/autoFill TEAM_SIZE). */
export const FULL_LINEUP_DRIVERS = 5;

/**
 * F-120: what a team's fielded roster was worth, from its race snapshot (F-029 records the roster
 * as it stood at lock). Each driver and the constructor at the price on the team when the weekend
 * was scored (the market price after the previous race, or what was paid if bought since), or at
 * what was paid when no market price was recorded. Null when the snapshot has no roster, the
 * lineup was not full, or any pick in it has no price: a value is recorded only when it means
 * the same thing for everyone it will be compared with.
 */
export function snapshotRosterValue(snapshot: { roster?: { drivers?: unknown; constructor?: unknown } | null } | null | undefined): number | null {
  // `constructor` is a real key on the stored document; on a bare object it is Object's own function
  const roster = snapshot && typeof snapshot === 'object' ? snapshot.roster : null;
  if (!roster || typeof roster !== 'object') return null;
  const priceOf = (e: PricedEntity | null | undefined): number => {
    if (!e || typeof e !== 'object') return 0;
    const now = finite(e.currentPrice);
    return now > 0 ? now : Math.max(0, finite(e.purchasePrice));
  };
  const drivers = Array.isArray(roster.drivers) ? (roster.drivers as PricedEntity[]) : [];
  const ctor = Object.prototype.hasOwnProperty.call(roster, 'constructor') ? (roster.constructor as PricedEntity | null) : null;
  // The snapshot stores a missing price as 0. A rostered pick with no price makes the total
  // unknown, not smaller: counting it as free would flatter the points per dollar.
  // Only a full lineup has a value worth comparing. A manager who fielded one $5 driver and lost
  // 36 points would otherwise read as -720 points per $100, and a lucky one as the best value in
  // the league: true as arithmetic, and not what "value" means to anyone reading it.
  if (drivers.length < FULL_LINEUP_DRIVERS || !ctor) return null;
  const prices = [...drivers.map(priceOf), priceOf(ctor)];
  if (prices.some((p) => p <= 0)) return null;
  return prices.reduce((s, p) => s + p, 0);
}

/**
 * F-120: roster value per manager for one race. A manager's teams are summed, as their points
 * are; a manager with any team whose value is unknown (no snapshot, or one with no priced roster)
 * gets null, rather than a ratio worked out on part of what they fielded. Used by the scoring
 * writer and by the backfill, so past rounds are filled by the same rule.
 */
export function rosterValuesByUser(teams: Array<{ userId?: string | null; snapshot: Parameters<typeof snapshotRosterValue>[0] }>): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const t of teams) {
    if (!t.userId) continue;
    const value = snapshotRosterValue(t.snapshot);
    const sofar = out.get(t.userId);
    if (value === null || sofar === null) out.set(t.userId, null);
    else out.set(t.userId, (sofar ?? 0) + value);
  }
  return out;
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
