/**
 * F-150: the season rollover's transforms — pure, so the dry run and the tests see exactly what the
 * write will do. The owner's decisions (2026-11-15):
 *
 *  - Teams: a fresh start on the same team. Its 2026 season is archived under the team, then the
 *    team returns to what createTeamSecure writes for a new team — empty roster, budget 1000, no
 *    points, no locks, no contracts — keeping its id, owner, name, league and avatar.
 *  - Leagues: kept with their members. The final table is archived under the league with its
 *    champion, and every member restarts at zero.
 *  - Prices: points per race × $6 drivers / $3 constructors (F-151), from each driver's and
 *    constructor's per-race scores (`raceScores`), so a missed race does not drag a price down.
 *    Fewer than MIN_PRICED_RACES scored races → the newcomer price: the median opening price of the
 *    active entities of the same kind priced from their own results (owner, 2026-11-24, F-155).
 *
 * The script that applies these is functions/scripts/seasonRollover.js, run through `aidlc op`.
 */
import { orderMembers, rankWrites } from '../scoring/standingsFields';
import { NOTICE_LEAD_HOURS } from './offseasonNotice';

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
/** Only the fallback now: the newcomer price when nothing of that kind is priced from its own results (see newcomerPrice). */
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

/** The middle value, the mean of the two middle values (rounded) for an even count; null for none. */
export function median(values: number[]): number | null {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

/**
 * F-155, owner decision 2026-11-24: a newcomer opens at the median price of the season's drivers.
 * It applies to every driver without MIN_PRICED_RACES scored races in the season — one who scored
 * nothing, and a mid-season stand-in with a race or two (Câmara: 2 races in 2026) — and to a driver
 * new to the game in the next season (F-156 reads it from `seasons/{to}.newcomerPrice`).
 *
 * The median is taken over the NEXT season's opening prices of the active entities priced from their
 * own results, not over today's prices. Today's 2026 prices ran up through the season (active driver
 * median $244 on 2026-11-24) while the rollover opens 2027 at 2026's opening level (median $150): a
 * newcomer at $244 would open as the ninth dearest driver and in tier A with no results at all, which
 * is not "a median driver". The dry run prints both figures. Constructors get the median constructor
 * the same way (none qualifies on 2026's data). Null when nothing is priced from results.
 */
export function newcomerPrice(priced: Array<{ price: number; inactive?: boolean }>): number | null {
  return median(priced.filter((p) => !p.inactive).map((p) => p.price));
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

/**
 * create: the document must not exist. update: it must exist. merge: set with merge.
 * replace: set with mergeFields = the data's keys — each named field replaced whole, as update()
 * would, but without update()'s field-path expansion. That expansion cannot write a top-level field
 * called `constructor` (the SDK builds a plain object and finds Object.prototype.constructor there,
 * then asserts "Can't merge current value into a nested object" — F-141 hit it in auto-fill; the
 * F-154 rehearsal hit it on every team reset). A replace never creates a missing document only
 * because the same group also holds an update of that document.
 */
export interface Op { kind: 'create' | 'update' | 'merge' | 'replace'; path: string; data: Doc }

/** How the script sends one op in a batch: the method and its options. Pure, so the mapping is tested. */
export function writeCall(op: Op): { method: 'create' | 'update' | 'set'; options?: { merge: true } | { mergeFields: string[] } } {
  switch (op.kind) {
    case 'create': return { method: 'create' };
    case 'update': return { method: 'update' };
    case 'merge': return { method: 'set', options: { merge: true } };
    case 'replace': return { method: 'set', options: { mergeFields: Object.keys(op.data) } };
    default: throw new Error(`unknown write kind ${(op as Op).kind} for ${(op as Op).path}`);
  }
}
/** Writes that commit together or not at all, in this order: the season pin, all prices, one team, one league with its members and archive, the calendar, the season switch. */
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
  /** F-155: the newcomer price per kind (null: nothing of that kind priced from results; NEWCOMER_PRICE is used) */
  newcomer: { drivers: number | null; constructors: number | null };
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
  // F-151: pin the season being closed before anything else, so the season never has to be read off a
  // calendar that already holds next season's races; the switch at the end moves it on
  const groups: Group[] = [{ label: 'pin season', ops: [{ kind: 'merge', path: 'config/app', data: { currentSeason: i.from } }] }];

  // F-154: prices go in BEFORE any team is reset. In the other order, a team reset early in the run
  // holds a fresh $1000 while the market still shows 2026 prices, and can buy a 2027 roster at them
  // for as long as the run takes (or for days, if the run stops halfway). Priced first, a 2026 team
  // that is not reset yet sees 2027 prices, but its reset puts it back to $1000 and an empty roster.
  const prices: RolloverPlan['prices'] = [];
  const finals: RolloverPlan['finals'] = { drivers: {}, constructors: {} };
  const priceOps: Op[] = [];
  const rateOf = (coll: string) => (coll === 'constructors' ? CONSTRUCTOR_DOLLARS_PER_POINT : DOLLARS_PER_POINT);
  const inputOf = (e: RolloverInput['entities'][number]): PriceInput => {
    const s = i.scores[e.id] ?? { races: 0, points: 0 };
    return { id: e.id, scoredRaces: s.races, scorePoints: s.points, currentPrice: num(e.data.price) };
  };
  // F-155: the newcomer price per kind, from every entity priced on its own results — stamped ones
  // included (the scores are the same on a re-run), so a re-run prices a newcomer the same way
  const newcomer: RolloverPlan['newcomer'] = { drivers: null, constructors: null };
  for (const coll of ['drivers', 'constructors'] as const) {
    const priced = i.entities.filter((e) => e.coll === coll && inputOf(e).scoredRaces >= MIN_PRICED_RACES)
      .map((e) => ({ price: openingPrice(inputOf(e), { dollarsPerPoint: rateOf(coll) }).price, inactive: e.data.isActive === false }));
    newcomer[coll] = newcomerPrice(priced);
  }
  for (const e of i.entities) {
    const stamped = e.data.pricedFor === i.to;
    // stamped: this season's points already moved to seasonPoints on an earlier run
    finals[e.coll][e.id] = { fantasyPoints: num(stamped ? e.data.seasonPoints : e.data.fantasyPoints) };
    const out = openingPrice(inputOf(e), { dollarsPerPoint: rateOf(e.coll), newcomer: newcomer[e.coll] ?? NEWCOMER_PRICE });
    prices.push({ coll: e.coll, id: e.id, from: num(e.data.price), out, inactive: e.data.isActive === false, stamped });
    if (!stamped) priceOps.push({ kind: 'update', path: `${e.coll}/${e.id}`, data: { ...entityPricePatch(e.data, out), pricedFor: i.to } });
  }
  if (priceOps.length) groups.push({ label: 'prices', ops: priceOps });

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
        // the update fails the whole group if the team was deleted since it was read (account deletion),
        // so the replace below can never bring a deleted team back as a skeleton
        { kind: 'update', path: `fantasyTeams/${t.id}`, data: { updatedAt: NOW } },
        { kind: 'replace', path: `fantasyTeams/${t.id}`, data: teamResetPatch(t.data) },
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

  const have = new Set(i.existingRaces);
  const newRaces = i.calendar.filter((r) => !have.has(r.id)).map((r) => r.id);
  if (newRaces.length) groups.push({ label: 'calendar', ops: i.calendar.filter((r) => !have.has(r.id)).map((r) => ({ kind: 'create', path: `races/${r.id}`, data: r })) });

  const first = i.calendar[0], last = i.calendar[i.calendar.length - 1];
  groups.push({
    label: 'season switch',
    ops: [
      // newcomerPrice: what the next season's grid seed (F-156) prices a driver new to the game at
      { kind: 'merge', path: `seasons/${i.to}`, data: { id: i.to, year: Number(i.to), name: `${i.to} Season`, isActive: true, startDate: first ? (first.schedule.fp1 ?? first.schedule.race) : null, endDate: last ? last.schedule.race : null, totalRaces: i.calendar.length, currentRound: 1, budget: START_BUDGET, teamSize: 5, newcomerPrice: newcomer.drivers ?? NEWCOMER_PRICE } },
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
    groups, prices, finals, newcomer,
    teams: { total: i.teams.length, reset: teamsReset, archives: teamArchives },
    leagues: { total: i.leagues.length, reset: leaguesReset, members: membersReset, archives: leagueArchives },
    newRaces, backupPaths,
  };
}

// ── Preconditions (F-154) ───────────────────────────────────────────────────────────────────────

export interface PreconditionInput {
  from: string;
  to: string;
  now: number;
  settleHours: number;
  /** seasons/{from} */
  fromSeason: Doc;
  /** config/app.currentSeason */
  currentSeason: unknown;
  /** every race document with seasonId == from; raceTimeMs = schedule.race in ms (NaN when absent) */
  fromRaces: Array<{ id: string; status?: unknown; raceTimeMs: number }>;
  /** ids of pendingResults documents whose status is 'pending' */
  pendingResultIds: string[];
  /** race ids that have at least one raceScores row */
  scoredRaceIds: string[];
  /** Moonshot calls of the from season (seasonId == from, or raceId one of its races) */
  moonshots: Array<{ id: string; status?: unknown; settledAt?: unknown; raceId?: unknown }>;
  /** races the next season's calendar holds */
  calendarSize: number;
  /**
   * F-155: when the reset notice went out (offseasonNotice.ts noticeSentMs of seasons/{from}), null
   * if never. Players are told before their teams are reset, or the rollover waits.
   */
  noticeSentMs: number | null;
}

/** A Moonshot call is finished when it was cancelled or settled (HIT, MISSED and VOID all stamp settledAt). */
export const moonshotFinished = (m: { status?: unknown; settledAt?: unknown }): boolean =>
  m.status === 'CANCELLED' || (m.settledAt !== undefined && m.settledAt !== null);

/**
 * Every reason the rollover must not write yet. Empty = go. Pure, so each reason is tested; the
 * script only reads the documents and prints these.
 */
export function rolloverBlockers(i: PreconditionInput): string[] {
  const out: string[] = [];
  const rolled = i.fromSeason.rolledOverAt;
  if (rolled) out.push(`seasons/${i.from} already rolled over`);
  if (i.currentSeason !== undefined && i.currentSeason !== i.from && i.currentSeason !== i.to) {
    out.push(`config/app.currentSeason is ${JSON.stringify(i.currentSeason)}, expected ${i.from}`);
  }
  const completed = i.fromRaces.filter((r) => r.status === 'completed');
  // an empty list must not pass as "nothing open, all settled"
  if (completed.length === 0) out.push(`no completed ${i.from} race found (${i.fromRaces.length} race documents with seasonId ${i.from})`);
  const open = i.fromRaces.filter((r) => r.status !== 'completed' && r.status !== 'cancelled');
  if (open.length) out.push(`${open.length} ${i.from} race(s) not completed: ${open.map((r) => `${r.id} (${String(r.status)})`).join(', ')}`);
  const times = completed.map((r) => r.raceTimeMs).filter(Number.isFinite);
  const settledH = times.length ? (i.now - Math.max(...times)) / 3600e3 : NaN;
  if (!(settledH >= i.settleHours)) out.push(`last ${i.from} race was ${Number.isFinite(settledH) ? settledH.toFixed(1) : '?'} h ago; wait ${i.settleHours} h for corrections`);
  const held = i.pendingResultIds.filter((id) => id.endsWith(`_${i.from}`));
  if (held.length) out.push(`results still held for review: ${held.join(', ')}`);
  // prices come from raceScores: a completed race with no rows would price every driver as if they
  // had skipped it, and means the race's scoring never ran in full
  const scored = new Set(i.scoredRaceIds);
  const unscored = completed.filter((r) => !scored.has(r.id)).map((r) => r.id);
  if (unscored.length) out.push(`${unscored.length} completed ${i.from} race(s) have no raceScores rows: ${unscored.join(', ')}`);
  // a call still open would settle after the reset, into a 2027 team
  const unsettled = i.moonshots.filter((m) => !moonshotFinished(m));
  if (unsettled.length) out.push(`${unsettled.length} ${i.from} Moonshot call(s) not settled or cancelled: ${unsettled.slice(0, 10).map((m) => `${m.id} (${String(m.status)}, ${String(m.raceId)})`).join(', ')}${unsettled.length > 10 ? ', …' : ''}`);
  if (i.calendarSize === 0) out.push(`OpenF1 lists no ${i.to} races`);
  // F-155: the notice gate. NOTICE_LEAD_HOURS is imported, not repeated, so the two cannot drift.
  if (i.noticeSentMs === null || !Number.isFinite(i.noticeSentMs)) {
    out.push(`players have not been told about the reset: run sendSeasonNotice.js (uc-script op) at least ${NOTICE_LEAD_HOURS} h before (seasons/${i.from}.resetNotice.sentAt is absent)`);
  } else if ((i.now - i.noticeSentMs) / 3600e3 < NOTICE_LEAD_HOURS) {
    out.push(`the reset notice went out ${((i.now - i.noticeSentMs) / 3600e3).toFixed(1)} h ago; wait ${NOTICE_LEAD_HOURS} h so players can read it first`);
  }
  return out;
}

// ── Backup coverage (F-154) ─────────────────────────────────────────────────────────────────────

/**
 * True when a backup of `root` captures `p`: the path itself, or — for a collection root — one of its
 * own documents. NOT a subcollection below them: firestore-backup.js reads a collection with one
 * get(), which returns its documents only, so `fantasyTeams` does not cover
 * `fantasyTeams/t1/seasons/2026`. That is why the plan lists every archive path on its own.
 */
export function coveredBy(p: string, root: string): boolean {
  if (p === root) return true;
  const rootSegs = root.split('/').length;
  if (rootSegs % 2 === 0 || !p.startsWith(`${root}/`)) return false;
  return p.split('/').length === rootSegs + 1;
}

/**
 * The backup the op took is the file of paths the dry run wrote. If anything was created since — a
 * new league, so a new `leagues/{id}/members` and `leagues/{id}/seasons/{from}` — the apply would
 * write paths the backup never saw, and a rollback would leave them behind. Returns the plan's
 * paths that the file does not cover; the script refuses to apply unless this is empty.
 */
export function uncoveredPaths(planPaths: string[], backedUp: string[]): string[] {
  const roots = backedUp.map((p) => p.trim()).filter(Boolean);
  return planPaths.filter((p) => !roots.some((r) => coveredBy(p, r)));
}
