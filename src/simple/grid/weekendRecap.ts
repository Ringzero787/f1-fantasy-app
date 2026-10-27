/**
 * Weekend recap from the round record (F-130) — pure helpers.
 *
 * The recap used to score the roster as it stands today against the last race's neutral points:
 * sell a driver after the race and his points left "your" weekend, and a one-driver roster read as
 * the same number three times. The scoring run already writes what the team was actually credited,
 * pick by pick, in `fantasyTeams/{teamId}/raceSnapshots/{raceId}` (F-029): the roster as fielded,
 * the Ace, the auto-filled picks, every phase's points per entity and the stale-roster penalty.
 * This module turns that document, the league's leaderboard for the race (F-062) and the next
 * round's state into the lines the card shows. Nothing here reads the network.
 */
import type { LeagueRaceResultDoc } from './raceLeaderboard';
import { shortRaceName } from './raceLeaderboard';
import { callOpen, moonshotAvailability, predictionLabel, tokensLeftOf, type MoonshotCall, type MoonshotClientConfig } from './moonshot';
import { formatCountdown } from './lockStatus';

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export type SnapshotPhase = 'qualifying' | 'sprint' | 'race';

export interface SnapshotPick { id: string; racesHeld: number; isReservePick: boolean }

/** `fantasyTeams/{teamId}/raceSnapshots/{raceId}` as the recap reads it. */
export interface RaceSnapshot {
  raceId: string;
  round: number | null;
  drivers: SnapshotPick[];
  constructor: SnapshotPick | null;
  aceDriverId: string | null;
  aceConstructorId: string | null;
  phases: Partial<Record<SnapshotPhase, { points: number; entities: Record<string, number>; adjustment: number }>>;
}

const PHASES: SnapshotPhase[] = ['qualifying', 'sprint', 'race'];

/** A stored snapshot, or null for anything that is not one (a missing document, an older shape). */
export function toRaceSnapshot(d: Record<string, unknown> | null | undefined): RaceSnapshot | null {
  if (!d || typeof d !== 'object' || typeof d.raceId !== 'string') return null;
  const roster = d.roster && typeof d.roster === 'object' ? (d.roster as Record<string, unknown>) : null;
  const pick = (v: unknown, key: 'driverId' | 'constructorId'): SnapshotPick | null => {
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    return typeof o[key] === 'string' ? { id: o[key] as string, racesHeld: num(o.racesHeld), isReservePick: o.isReservePick === true } : null;
  };
  const drivers = roster && Array.isArray(roster.drivers) ? roster.drivers.map((v) => pick(v, 'driverId')).filter((p): p is SnapshotPick => p !== null) : [];
  // `constructor` is a real key on the stored document; on a bare object it is Object's own function
  const ctorRaw = roster && Object.prototype.hasOwnProperty.call(roster, 'constructor') ? roster.constructor : null;
  const phases: RaceSnapshot['phases'] = {};
  const stored = d.phases && typeof d.phases === 'object' ? (d.phases as Record<string, unknown>) : {};
  for (const name of PHASES) {
    const p = stored[name];
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    const entities: Record<string, number> = {};
    if (o.entities && typeof o.entities === 'object') {
      for (const [id, v] of Object.entries(o.entities as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) entities[id] = v;
    }
    phases[name] = { points: num(o.points), entities, adjustment: num(o.adjustment) };
  }
  return {
    raceId: d.raceId,
    round: typeof d.round === 'number' ? d.round : null,
    drivers,
    constructor: pick(ctorRaw, 'constructorId'),
    aceDriverId: roster && typeof roster.aceDriverId === 'string' ? roster.aceDriverId : null,
    aceConstructorId: roster && typeof roster.aceConstructorId === 'string' ? roster.aceConstructorId : null,
    phases,
  };
}

export interface RecapPick {
  id: string;
  name: string;
  /** what this pick earned the team over the weekend: Ace doubling and loyalty bonus included */
  points: number;
  isConstructor: boolean;
  isAce: boolean;
  /** auto-filled at lock (F-044), not chosen by the player */
  isReserve: boolean;
}

export interface RecapRoster {
  /** high → low */
  picks: RecapPick[];
  /** what the team was credited for the weekend, every phase and penalty included */
  total: number;
  /** points no pick earned: the stale-roster penalty (negative), 0 when none */
  adjustment: number;
  /** picks on the team when it was scored */
  fielded: number;
  /** slots nobody filled, which score nothing */
  open: number;
  /** true when read from the server's record; false for the roster-as-it-is-now fallback */
  fromRecord: boolean;
}

/** Five drivers and a constructor. */
export const LINEUP_SIZE = 6;
const DRIVER_SLOTS = 5;

export interface EntityNames { driver: (id: string) => string; constructor: (id: string) => string }

/** The weekend as the server scored it. The constructor's Ace counts only when the roster's Ace is the constructor. */
export function rosterFromSnapshot(snap: RaceSnapshot, names: EntityNames): RecapRoster {
  const pointsOf = (id: string) => PHASES.reduce((s, p) => s + num(snap.phases[p]?.entities[id]), 0);
  const picks: RecapPick[] = snap.drivers.map((d) => ({ id: d.id, name: names.driver(d.id), points: pointsOf(d.id), isConstructor: false, isAce: snap.aceDriverId === d.id, isReserve: d.isReservePick }));
  if (snap.constructor) {
    const c = snap.constructor;
    picks.push({ id: c.id, name: names.constructor(c.id), points: pointsOf(c.id), isConstructor: true, isAce: snap.aceConstructorId === c.id, isReserve: c.isReservePick });
  }
  picks.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const total = PHASES.reduce((s, p) => s + num(snap.phases[p]?.points), 0);
  const adjustment = PHASES.reduce((s, p) => s + num(snap.phases[p]?.adjustment), 0);
  const fielded = picks.length;
  return { picks, total, adjustment, fielded, open: Math.max(0, DRIVER_SLOTS - snap.drivers.length) + (snap.constructor ? 0 : 1), fromRecord: true };
}

interface TeamLike { drivers?: { driverId: string; name?: string; shortName?: string; isReservePick?: boolean }[] | null; aceDriverId?: string | null; aceConstructorId?: string | null }
interface CtorLike { constructorId: string; name?: string; isReservePick?: boolean }

/**
 * The fallback when no record exists for the race (a round scored before F-029, or a read that
 * failed): the roster as it is now against the race's neutral points. Honest about what it is
 * (`fromRecord: false`), so the card can say so.
 */
export function rosterFromTeam(team: TeamLike, ctor: CtorLike | null | undefined, lastRaceScores: Record<string, { totalPoints?: number } | undefined>): RecapRoster {
  const picks: RecapPick[] = (team.drivers ?? []).map((d) => ({
    id: d.driverId, name: d.shortName || d.name || 'Driver', points: num(lastRaceScores[d.driverId]?.totalPoints), isConstructor: false, isAce: team.aceDriverId === d.driverId, isReserve: d.isReservePick === true,
  }));
  if (ctor) picks.push({ id: ctor.constructorId, name: ctor.name?.split(' ')[0] || 'Constructor', points: num(lastRaceScores[ctor.constructorId]?.totalPoints), isConstructor: true, isAce: team.aceConstructorId === ctor.constructorId, isReserve: ctor.isReservePick === true });
  picks.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const drivers = (team.drivers ?? []).length;
  return { picks, total: picks.reduce((s, p) => s + p.points, 0), adjustment: 0, fielded: picks.length, open: Math.max(0, DRIVER_SLOTS - drivers) + (ctor ? 0 : 1), fromRecord: false };
}

/** The picks worth a row of their own, and the ones that scored nothing, which share one line. */
export function splitZeroPicks(picks: RecapPick[]): { scored: RecapPick[]; zeros: RecapPick[] } {
  return { scored: picks.filter((p) => p.points !== 0), zeros: picks.filter((p) => p.points === 0) };
}

/** "3 PICKS SCORED 0 · HADJAR, GASLY, SAINZ"; null when every pick scored. */
export function zeroLine(zeros: RecapPick[]): string | null {
  if (zeros.length === 0) return null;
  return `${zeros.length} PICK${zeros.length === 1 ? '' : 'S'} SCORED 0 · ${zeros.map((p) => p.name.toUpperCase()).join(', ')}`;
}

/** "FIELDED 1 OF 6 · 5 OPEN SLOTS SCORED NOTHING"; null for a full lineup. */
export function fieldedLine(r: RecapRoster): string | null {
  if (r.open <= 0) return null;
  return `FIELDED ${r.fielded} OF ${LINEUP_SIZE} · ${r.open} OPEN SLOT${r.open === 1 ? '' : 'S'} SCORED NOTHING`;
}

/** "STALE ROSTER PENALTY −10": points the team lost that no pick earned; null when none. */
export function adjustmentLine(r: RecapRoster): string | null {
  if (r.adjustment === 0) return null;
  return r.adjustment < 0 ? `STALE ROSTER PENALTY −${Math.abs(r.adjustment).toLocaleString()}` : `ADJUSTMENT +${r.adjustment.toLocaleString()}`;
}

/** The note under the list when the numbers are not the server's record. */
export const FALLBACK_NOTE = 'ROSTER AS IT IS NOW AGAINST THE RACE · NO RECORD OF THE LINEUP FIELDED';

export interface RecapStanding {
  /** this manager's place in the league for the round, from the leaderboard the server wrote */
  roundRank: number | null;
  roundOf: number | null;
  /** race points of the round's winner(s); null when nobody scored above zero */
  topPoints: number | null;
  /** the manager's race points on that leaderboard (every team of theirs added up) */
  roundPoints: number | null;
  wonRound: boolean;
  seasonRank: number | null;
  seasonOf: number | null;
  /** places gained (positive) or lost since before the race; null when not known */
  seasonMove: number | null;
}

interface MemberLike { userId: string; leagueId?: string; rank?: number | null; previousRank?: number | null; isWithdrawn?: boolean }

export function recapStanding(result: LeagueRaceResultDoc | null, userId: string | null, members: MemberLike[], leagueId: string | null): RecapStanding {
  const out: RecapStanding = { roundRank: null, roundOf: null, topPoints: null, roundPoints: null, wonRound: false, seasonRank: null, seasonOf: null, seasonMove: null };
  if (result && userId && Array.isArray(result.entries)) {
    const entries = result.entries.filter((e) => e && typeof e.points === 'number' && Number.isFinite(e.points));
    const mine = entries.find((e) => e.userId === userId);
    if (mine) {
      out.roundRank = mine.rank;
      out.roundOf = entries.length;
      out.roundPoints = mine.points;
      out.topPoints = typeof result.topPoints === 'number' && result.topPoints > 0 ? result.topPoints : null;
      out.wonRound = (result.winners ?? []).includes(userId);
    }
  }
  if (userId && leagueId) {
    const inLeague = members.filter((m) => (m.leagueId ?? leagueId) === leagueId && !m.isWithdrawn);
    const mine = inLeague.find((m) => m.userId === userId);
    if (mine && typeof mine.rank === 'number') {
      out.seasonRank = mine.rank;
      out.seasonOf = inLeague.length || null;
      out.seasonMove = typeof mine.previousRank === 'number' ? mine.previousRank - mine.rank : null;
    }
  }
  return out;
}

const signedShort = (n: number): string => `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}`;

/** "ROUND P4 / 10 · LEADER +112 · 55 BEHIND", "ROUND WINNER · +112", or null outside a league. */
export function roundLine(s: RecapStanding): string | null {
  if (s.roundRank == null || s.roundOf == null) return null;
  if (s.wonRound) return `ROUND WINNER · ${signedShort(s.roundPoints ?? 0)}`;
  const place = `ROUND P${s.roundRank} / ${s.roundOf}`;
  if (s.topPoints == null || s.roundPoints == null) return place;
  const gap = s.topPoints - s.roundPoints;
  return gap > 0 ? `${place} · LEADER ${signedShort(s.topPoints)} · ${gap.toLocaleString()} BEHIND` : place;
}

/** "SEASON P2 / 10 · ▲ 1 · 3,333 PTS"; null outside a league. */
export function seasonLine(s: RecapStanding, totalPoints: number | null | undefined): string | null {
  if (s.seasonRank == null) return null;
  const parts = [`SEASON P${s.seasonRank}${s.seasonOf ? ` / ${s.seasonOf}` : ''}`];
  if (s.seasonMove != null && s.seasonMove !== 0) parts.push(s.seasonMove > 0 ? `▲ ${s.seasonMove}` : `▼ ${-s.seasonMove}`);
  if (typeof totalPoints === 'number' && Number.isFinite(totalPoints)) parts.push(`${Math.round(totalPoints).toLocaleString()} PTS`);
  return parts.join(' · ');
}

export interface NextRound {
  /** "NEXT · RD 21 · MEXICO CITY" */
  label: string;
  /** "LOCKS IN 4D 4H" / "LOCKED" */
  lock: string;
  /** the team's Moonshot on the next round, or the count still to call; null while Moonshot is off or not yet unlocked */
  moonshot: string | null;
}

interface NextRaceLike { id: string; round: number; name: string; city?: string }

/**
 * What is coming, so the card ends looking forward: the next round, its lock, and the team's
 * Moonshot on it. A call in play is named; none yet says how many shots are left.
 */
export function nextRoundLines(next: NextRaceLike | null | undefined, lockTime: Date | null, isLocked: boolean, nowMs: number, calls: MoonshotCall[], teamId: string | null, cfg: MoonshotClientConfig, driverName: (id: string) => string): NextRound | null {
  if (!next) return null;
  const place = (next.city || shortRaceName(next.name)).trim().toUpperCase();
  const label = `NEXT · RD ${next.round} · ${place}`;
  const lock = isLocked ? 'LOCKED' : lockTime ? `LOCKS IN ${formatCountdown(lockTime.getTime() - nowMs)}` : 'OPEN';
  let moonshot: string | null = null;
  if (teamId && moonshotAvailability(cfg, next.round) === 'open') {
    const mine = calls.filter((c) => c.teamId === teamId);
    const call = mine.find((c) => c.raceId === next.id && c.status !== 'CANCELLED') ?? null;
    if (call) {
      const what = `${driverName(call.driverId).toUpperCase()} — ${predictionLabel(call.predictionType, call.predictionTarget)}`;
      moonshot = `🚀 MOONSHOT ${callOpen(call, nowMs) ? 'IN PLAY' : 'LOCKED'} · ${what}`;
    } else {
      const left = tokensLeftOf(cfg.tokensPerTeam, mine, nowMs);
      moonshot = left > 0 ? `🚀 NO MOONSHOT CALLED YET · ${left} LEFT` : '🚀 NO MOONSHOTS LEFT THIS SEASON';
    }
  }
  return { label, lock, moonshot };
}

/** "UNITED STATES" from "United States Grand Prix": the series' own words stay out of the title. */
export function recapTitle(raceName: string): string {
  return shortRaceName(raceName);
}
