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

/**
 * The 2026 record kept at fantasyTeams/{id}/seasons/{season}. Only fields the server owns (the team
 * update rule denies them to clients): raceWins, racesPlayed and pointsHistory are client-writable and
 * never written by the server, so they are left out — a planted value would read as the official
 * record, and an oversized one could make the archive too large to write and stall the rollover.
 */
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
    bestRacePoints: team.bestRacePoints ?? null,
    bestRaceId: team.bestRaceId ?? null,
    scoredRaces: Array.isArray(team.scoredRaces) ? team.scoredRaces : [],
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

/**
 * The final table kept at leagues/{id}/seasons/{season}: members in their final order, with the
 * champion(s). Built from member totals, which only the server writes; the league's own
 * raceResultIds is owner-writable, so it is not copied (the per-race results stay in raceResults).
 */
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
    // lets account deletion find every archive that names a user (onUserDeleted anonymises them)
    memberUserIds: [...new Set(standings.map((s) => s.userId).filter((u): u is string => typeof u === 'string'))],
  };
}

export const DELETED_PLAYER = 'Deleted player';

/**
 * The update that removes a deleted account from a league archive: its standings row and any
 * champion entry keep their place and points but lose the user id and name. Null when the archive
 * does not name the user.
 */
export function anonymiseLeagueArchive(archive: Doc, userId: string): Doc | null {
  const ids = Array.isArray(archive.memberUserIds) ? archive.memberUserIds : [];
  if (!ids.includes(userId)) return null;
  const strip = (rows: unknown) => (Array.isArray(rows) ? rows.map((r) => (r && typeof r === 'object' && (r as Doc).userId === userId ? { ...(r as Doc), userId: null, displayName: DELETED_PLAYER } : r)) : []);
  return { standings: strip(archive.standings), champions: strip(archive.champions), memberUserIds: ids.filter((u) => u !== userId) };
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

/**
 * Drivers: points per race × $6. The 2026 method used $10, but 2026 scored more points per race than
 * its 2025 basis, so $10 would open 2027 at 1.7× 2026's opening prices on the same $1000 budget
 * (average driver $265 against $155). The owner chose $6 (2026-11-15): 2027 opens at 2026's level.
 */
export const DOLLARS_PER_POINT = 6;
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

// ── The plan ────────────────────────────────────────────────────────────────────────────────────

/** Marks a field the writer sets to the server time; a plain value so the plan stays pure. */
export const NOW = Object.freeze({ __now: true }) as unknown as never;

export interface Op { kind: 'create' | 'update' | 'merge'; path: string; data: Doc }
/** Writes that commit together or not at all: one team, one league with its members and archive, all prices, the calendar, the season switch. */
export interface Group { label: string; ops: Op[] }

export interface RolloverInput {
  from: string;
  to: string;
  teams: Array<{ id: string; data: Doc; archived: boolean }>;
  leagues: Array<{ id: string; data: Doc; archived: boolean; members: MemberDoc[] }>;
  entities: Array<{ coll: 'drivers' | 'constructors'; id: string; data: Doc }>;
  /** per entity id: the FROM season's scored races and their points (raceScores) */
  scores: Record<string, { races: number; points: number }>;
  calendar: Array<{ id: string; schedule: Record<string, string> } & Doc>;
  existingRaces: string[];
}

export interface RolloverPlan {
  groups: Group[];
  prices: Array<{ coll: string; id: string; from: number; out: PriceOutput; inactive: boolean; stamped: boolean }>;
  finals: { drivers: Record<string, { fantasyPoints: number }>; constructors: Record<string, { fantasyPoints: number }> };
  teams: { total: number; reset: number; archives: Doc[] };
  leagues: { total: number; reset: number; members: number; archives: Doc[] };
  newRaces: string[];
  backupPaths: string[];
}

/**
 * Every write of the rollover, grouped so each group commits atomically. Re-runnable: a team or
 * league whose `seasons/{from}` archive exists is done — the archive is created in the same atomic
 * group as the reset, and clients cannot write it (no rule matches the subcollection), so it is a
 * marker a player cannot forge. (`seasonId` on a team or league is client-writable: a skip keyed on
 * it would let a player keep a 2026 team into 2027.) An entity stamped `pricedFor: to` (drivers and
 * constructors are server-only) is not re-priced, races are only created, and `finals` always covers
 * every entity, priced on this run or before.
 */
export function planRollover(i: RolloverInput): RolloverPlan {
  const groups: Group[] = [];
  const teamArchives: Doc[] = [];
  let teamsReset = 0;
  for (const t of i.teams) {
    if (t.archived) continue;
    teamsReset++;
    const archive = teamArchive(t.data, i.from);
    teamArchives.push(archive);
    groups.push({
      label: `team ${t.id}`,
      ops: [
        { kind: 'create', path: `fantasyTeams/${t.id}/seasons/${i.from}`, data: { ...archive, archivedAt: NOW } },
        { kind: 'update', path: `fantasyTeams/${t.id}`, data: { ...teamResetPatch(t.data), updatedAt: NOW } },
      ],
    });
  }

  const leagueArchives: Doc[] = [];
  let leaguesReset = 0, membersReset = 0;
  for (const l of i.leagues) {
    if (l.archived) continue;
    leaguesReset++;
    const archive = leagueArchive(l.data, l.members, i.from);
    leagueArchives.push(archive);
    const ops: Op[] = [{ kind: 'create', path: `leagues/${l.id}/seasons/${i.from}`, data: { ...archive, archivedAt: NOW } }];
    for (const m of memberResetPatches(l.members)) ops.push({ kind: 'update', path: `leagues/${l.id}/members/${m.id}`, data: m.patch });
    membersReset += l.members.length;
    ops.push({ kind: 'update', path: `leagues/${l.id}`, data: { ...leagueResetPatch(i.to), updatedAt: NOW } });
    groups.push({ label: `league ${l.id}`, ops });
  }

  const prices: RolloverPlan['prices'] = [];
  const finals: RolloverPlan['finals'] = { drivers: {}, constructors: {} };
  const priceOps: Op[] = [];
  for (const e of i.entities) {
    const stamped = e.data.pricedFor === i.to;
    // stamped: this season's points already moved to seasonPoints on an earlier run
    finals[e.coll][e.id] = { fantasyPoints: num(stamped ? e.data.seasonPoints : e.data.fantasyPoints) };
    const s = i.scores[e.id] ?? { races: 0, points: 0 };
    const rate = e.coll === 'constructors' ? CONSTRUCTOR_DOLLARS_PER_POINT : DOLLARS_PER_POINT;
    const out = openingPrice({ id: e.id, scoredRaces: s.races, scorePoints: s.points, currentPrice: num(e.data.price) }, { dollarsPerPoint: rate });
    prices.push({ coll: e.coll, id: e.id, from: num(e.data.price), out, inactive: e.data.isActive === false, stamped });
    if (!stamped) priceOps.push({ kind: 'update', path: `${e.coll}/${e.id}`, data: { ...entityPricePatch(e.data, out), pricedFor: i.to } });
  }
  if (priceOps.length) groups.push({ label: 'prices', ops: priceOps });

  const have = new Set(i.existingRaces);
  const newRaces = i.calendar.filter((r) => !have.has(r.id)).map((r) => r.id);
  if (newRaces.length) groups.push({ label: 'calendar', ops: i.calendar.filter((r) => !have.has(r.id)).map((r) => ({ kind: 'create', path: `races/${r.id}`, data: r })) });

  const first = i.calendar[0], last = i.calendar[i.calendar.length - 1];
  groups.push({
    label: 'season switch',
    ops: [
      { kind: 'merge', path: `seasons/${i.to}`, data: { id: i.to, year: Number(i.to), name: `${i.to} Season`, isActive: true, startDate: first ? (first.schedule.fp1 ?? first.schedule.race) : null, endDate: last ? last.schedule.race : null, totalRaces: i.calendar.length, currentRound: 1, budget: START_BUDGET, teamSize: 5 } },
      { kind: 'merge', path: `seasons/${i.from}`, data: { isActive: false, rolledOverAt: NOW, final: finals } },
      { kind: 'merge', path: 'config/app', data: { currentSeason: i.to } },
    ],
  });
  for (const g of groups) if (g.ops.length > 450) throw new Error(`${g.label}: ${g.ops.length} writes do not fit one batch`);

  // A document recorded absent in the backup is deleted on restore, so the archives and races this
  // creates are listed by path: a rollback takes them away with everything else.
  const backupPaths = [
    'fantasyTeams', 'leagues', ...i.leagues.map((l) => `leagues/${l.id}/members`), 'drivers', 'constructors', 'seasons', `seasons/${i.to}`, 'config/app',
    ...i.teams.map((t) => `fantasyTeams/${t.id}/seasons/${i.from}`), ...i.leagues.map((l) => `leagues/${l.id}/seasons/${i.from}`),
    ...i.calendar.map((r) => `races/${r.id}`),
  ];
  return {
    groups, prices, finals,
    teams: { total: i.teams.length, reset: teamsReset, archives: teamArchives },
    leagues: { total: i.leagues.length, reset: leaguesReset, members: membersReset, archives: leagueArchives },
    newRaces, backupPaths,
  };
}
