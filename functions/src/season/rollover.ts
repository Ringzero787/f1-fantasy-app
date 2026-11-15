/**
 * F-150: the season rollover's transforms — pure, so the dry run and the tests see exactly what the
 * write will do. The owner's decisions (2026-11-15):
 *
 *  - Teams: a fresh start on the same team. Its 2026 season is archived under the team, then the
 *    team returns to what createTeamSecure writes for a new team — empty roster, budget 1000, no
 *    points, no locks, no contracts — keeping its id, owner, name, league and avatar.
 *  - Leagues: kept with their members. The final table is archived under the league with its
 *    champion, and every member restarts at zero.
 *  - Prices: points per race × $10 (the method that set 2026 prices from 2025), from each driver's
 *    and constructor's per-race scores (`raceScores`), so a missed race does not drag a price down.
 *    Fewer than MIN_PRICED_RACES scored races → the newcomer price (2026 opened its rookies at $5).
 *
 * The script that applies these is functions/scripts/seasonRollover.js, run through `aidlc op`.
 */
import { orderMembers, rankWrites } from '../scoring/standingsFields';

/** Marks a field the writer deletes (FieldValue.delete()); a plain value so these stay pure. */
export const DELETE = Object.freeze({ __delete: true }) as unknown as never;

export const START_BUDGET = 1000;

/** The lock status of a team nobody has locked: what createTeamSecure writes for a new team outside a lock window. */
export const UNLOCKED_LOCK_STATUS = Object.freeze({
  isSeasonLocked: false,
  seasonLockRacesRemaining: 0,
  nextUnlockTime: null,
  // F-095/F-098: the window in which the ace is frozen — the first session it scores
  // in to the failsafe ceiling, with a gap once qualifying is scored — stamped when
  // the weekend locks, consulted by firestore.rules.
  aceFreezeFrom: null,
  aceLockTime: null,
  aceLockUntil: null,
  aceQualiKey: null,
  aceSprintKey: null,
  canModify: true,
  lockReason: null,
});

type Doc = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const ids = (v: unknown, key: string): string[] =>
  Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? (x as Doc)[key] : null)).filter((x): x is string => typeof x === 'string') : [];

/** Fields a team keeps through the rollover; every other field is reset or removed. */
const TEAM_KEEPS = ['userId', 'name', 'leagueId', 'createdAt', 'avatarUrl', 'avatarGeneratedAt'];

/** The 2026 record kept at fantasyTeams/{id}/seasons/{season}. */
export function teamArchive(team: Doc, season: string): Doc {
  const total = num(team.totalPoints) + num(team.lockedPoints) + num(team.moonshotPoints);
  const constructor = team.constructor && typeof team.constructor === 'object' ? (team.constructor as Doc).constructorId ?? null : null;
  return {
    season,
    name: team.name ?? null,
    leagueId: team.leagueId ?? null,
    seasonTotal: total,
    totalPoints: num(team.totalPoints),
    lockedPoints: num(team.lockedPoints),
    moonshotPoints: num(team.moonshotPoints),
    raceWins: num(team.raceWins),
    racesPlayed: num(team.racesPlayed),
    bestRacePoints: team.bestRacePoints ?? null,
    bestRaceId: team.bestRaceId ?? null,
    scoredRaces: Array.isArray(team.scoredRaces) ? team.scoredRaces : [],
    pointsHistory: Array.isArray(team.pointsHistory) ? team.pointsHistory : [],
    moonshotStats: team.moonshotStats ?? null,
    finalDrivers: ids(team.drivers, 'driverId'),
    finalConstructor: constructor,
  };
}

/**
 * The update that returns a team to a new team's state. Every field a team can carry that is not in
 * TEAM_KEEPS is either set to its new-team value or deleted, so nothing from 2026 survives by accident.
 */
export function teamResetPatch(team: Doc): Doc {
  const patch: Doc = {
    drivers: [],
    constructor: null,
    budget: START_BUDGET,
    totalSpent: 0,
    totalPoints: 0,
    lockedPoints: 0,
    isLocked: false,
    lockStatus: { ...UNLOCKED_LOCK_STATUS },
    aceDriverId: null,
    aceConstructorId: null,
    racesSinceTransfer: 0,
    racesPlayed: 0,
    pointsHistory: [],
    joinedAtRace: 0,
    raceWins: 0,
    scoredRaces: [],
  };
  for (const k of Object.keys(team)) {
    if (!TEAM_KEEPS.includes(k) && !(k in patch) && k !== 'updatedAt') patch[k] = DELETE;
  }
  return patch;
}

export interface MemberDoc extends Doc { id: string; totalPoints?: number; lastRacePoints?: number; rank?: number }

/** The final table kept at leagues/{id}/seasons/{season}: members in their final order, with the champion(s). */
export function leagueArchive(league: Doc, members: MemberDoc[], season: string): Doc {
  const ordered = orderMembers(members);
  const standings = ordered.map((m, i) => ({
    memberId: m.id,
    userId: m.userId ?? null,
    displayName: m.displayName ?? null,
    rank: i + 1,
    totalPoints: num(m.totalPoints),
    raceWins: num(m.raceWins),
    moonshotPoints: num(m.moonshotPoints),
  }));
  const top = standings.length > 0 ? standings[0].totalPoints : null;
  return {
    season,
    name: league.name ?? null,
    memberCount: members.length,
    standings,
    // a tie on points at the top is a shared title, not a coin toss on lastRacePoints or id
    champions: top === null || top <= 0 ? [] : standings.filter((s) => s.totalPoints === top).map((s) => ({ userId: s.userId, displayName: s.displayName })),
    raceResultIds: Array.isArray(league.raceResultIds) ? league.raceResultIds : [],
  };
}

/** Each member back to zero, ranked 1..n in a stable order (the same order the scorer uses on a tie). */
export function memberResetPatches(members: MemberDoc[]): Array<{ id: string; patch: Doc }> {
  const zeroed = members.map((m) => ({ id: m.id, totalPoints: 0, lastRacePoints: 0 }));
  return rankWrites(zeroed).map(({ id, data }) => ({
    id,
    patch: {
      totalPoints: 0,
      moonshotPoints: 0,
      raceWins: 0,
      rank: data.rank,
      lastRacePoints: DELETE,
      lastRaceId: DELETE,
      previousRank: DELETE,
      previousRankRaceId: DELETE,
    },
  }));
}

export const leagueResetPatch = (nextSeason: string): Doc => ({ seasonId: nextSeason, raceResultIds: [] });

// ── Prices ──────────────────────────────────────────────────────────────────────────────────────

/** Drivers: the 2026 method, points per race × $10. */
export const DOLLARS_PER_POINT = 10;
/**
 * Constructors: half the driver rate. A constructor's race score is both its cars added together, and
 * 2026 opened constructors priced like one driver (McLaren $359 beside Norris $361); at $10 the top
 * constructor would open above the whole $1000 budget.
 */
export const CONSTRUCTOR_DOLLARS_PER_POINT = DOLLARS_PER_POINT / 2;
export const MIN_PRICED_RACES = 5;
export const NEWCOMER_PRICE = 5;
export const MIN_PRICE = 5;
const TIER_A = 240;
const TIER_B = 120;

export interface PriceInput { id: string; scoredRaces: number; scorePoints: number; currentPrice: number }
export interface PriceOutput { id: string; price: number; tier: 'A' | 'B' | 'C'; basis: string; perRace: number | null }

export const tierOf = (price: number): 'A' | 'B' | 'C' => (price > TIER_A ? 'A' : price > TIER_B ? 'B' : 'C');

/** The opening price from a season of per-race scores. */
export function openingPrice(p: PriceInput, opts: { dollarsPerPoint?: number; minRaces?: number; newcomer?: number } = {}): PriceOutput {
  const rate = opts.dollarsPerPoint ?? DOLLARS_PER_POINT;
  const minRaces = opts.minRaces ?? MIN_PRICED_RACES;
  if (p.scoredRaces < minRaces) {
    const price = opts.newcomer ?? NEWCOMER_PRICE;
    return { id: p.id, price, tier: tierOf(price), basis: `${p.scoredRaces} scored race(s) < ${minRaces}: newcomer price`, perRace: null };
  }
  const perRace = p.scorePoints / p.scoredRaces;
  const price = Math.max(MIN_PRICE, Math.round(perRace * rate));
  return { id: p.id, price, tier: tierOf(price), basis: `${p.scorePoints} pts / ${p.scoredRaces} races × $${rate}`, perRace: Math.round(perRace * 10) / 10 };
}

/** The update for a driver or constructor: the new price as both price and previousPrice, the season's points archived. */
export function entityPricePatch(entity: Doc, out: PriceOutput): Doc {
  return {
    price: out.price,
    previousPrice: out.price,
    tier: out.tier,
    // the app reads seasonPoints as "last season" and fantasyPoints as "this season"
    seasonPoints: num(entity.fantasyPoints),
    fantasyPoints: 0,
  };
}
