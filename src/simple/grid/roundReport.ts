/**
 * League round report (F-120): pure helpers.
 *
 * After a race the league wants one answer: how did everybody do against each other? The server
 * already writes one leaderboard per race (F-062), and this turns two of them, the round and the
 * one before it, into a handful of callouts: the podium, the best and lowest score, who gained
 * and who lost the most on their own previous round, and the Moonshots that landed or missed.
 * Nothing here reads the network; the screen passes the documents in.
 */
import { shortRaceName, type LeagueRaceResultDoc, type RaceResultEntry } from './raceLeaderboard';
import type { ActivityEntry, PredictionType, StakeCurrency } from './moonshot';

export interface ReportPerson {
  userId: string;
  name: string;
  team: string;
  isMe: boolean;
}

export interface PodiumRow extends ReportPerson {
  rank: number;
  points: number;
}

/** One callout: who, and the number that earned it. Ties share it, the viewer listed first. */
export interface ReportCallout {
  people: ReportPerson[];
  value: number;
  includesMe: boolean;
}

export interface MyRound {
  rank: number;
  of: number;
  points: number;
  /** race points against this manager's previous round; null when there is no previous round to compare */
  change: number | null;
}

/** One settled Moonshot of the round, from the league's activity (F-107). */
export interface ReportMoonshot {
  id: string;
  who: ReportPerson;
  /** the driver whose result settled the call (a substitute when the call followed the car) */
  driverId: string;
  predictionType: PredictionType;
  predictionTarget: number | null;
  outcome: 'HIT' | 'MISSED' | 'VOID';
  /** what it paid or cost, in `currency`; 0 for a void */
  amount: number;
  currency: StakeCurrency;
  stake: number;
  multiplier: number | null;
  modelProbability: number | null;
  finish: number | null;
}

export interface RoundReport {
  raceId: string;
  round: number | null;
  /** managers scored this round */
  size: number;
  podium: PodiumRow[];
  topScore: ReportCallout | null;
  lowScore: ReportCallout | null;
  /** biggest gain and biggest loss in race points against each manager's own previous round */
  climb: ReportCallout | null;
  drop: ReportCallout | null;
  /** F-120: race points per $100 of the roster fielded; only managers whose roster value the server recorded */
  mostEfficient: ReportCallout | null;
  leastEfficient: ReportCallout | null;
  moonshotHit: ReportCallout | null;
  moonshotMiss: ReportCallout | null;
  /** every Moonshot settled on this race, the call of the round first */
  moonshots: ReportMoonshot[];
  /** the boldest call that landed: the hit the model gave the least chance */
  callOfTheRound: ReportMoonshot | null;
  /** somebody scored above zero; a round nobody scored in has no winner and no top score */
  hasWinner: boolean;
  me: MyRound | null;
  /** the round the changes are measured against, when there is one */
  comparedToRound: number | null;
  /** the leaderboard was rebuilt from partial data (F-062), so treat the numbers as approximate */
  estimated: boolean;
}

/** A podium is three places; a tie for third can make it longer, but not a wall of names. */
export const PODIUM_MAX_ROWS = 5;

const person = (e: RaceResultEntry, userId: string | null): ReportPerson => ({
  userId: e.userId,
  name: e.displayName || 'Player',
  team: e.teamName || '',
  isMe: !!userId && e.userId === userId,
});

function callout<T>(items: T[], valueOf: (i: T) => number, pick: 'max' | 'min', entryOf: (i: T) => RaceResultEntry, userId: string | null): ReportCallout | null {
  if (items.length === 0) return null;
  const values = items.map(valueOf).filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  const value = values.reduce((m, v) => (pick === 'max' ? Math.max(m, v) : Math.min(m, v)));
  const people = items.filter((i) => valueOf(i) === value).map((i) => person(entryOf(i), userId))
    .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
  return { people, value, includesMe: people.some((p) => p.isMe) };
}

/**
 * Build the report for one round. `previous` is the same league's leaderboard for the round
 * before; without it the report still stands, minus the two callouts that need a comparison.
 */
/** Race points per $100 of roster, to one decimal: the figure the efficiency callouts compare and show. */
export function pointsPer100(points: number, rosterValue: number): number {
  return Math.round((points / rosterValue) * 1000) / 10;
}

const OUTCOMES: Record<string, ReportMoonshot['outcome']> = { MOONSHOT_HIT: 'HIT', MOONSHOT_MISSED: 'MISSED', MOONSHOT_VOID: 'VOID' };

/**
 * `activity` is the league's Moonshot history (F-107); only entries settled on this race are used,
 * and an entry of a kind this build does not know is left out rather than guessed at.
 */
export function buildRoundReport(current: LeagueRaceResultDoc | null, previous: LeagueRaceResultDoc | null, userId: string | null, activity: ActivityEntry[] = []): RoundReport | null {
  if (!current || !Array.isArray(current.entries) || current.entries.length === 0) return null;
  const entries = current.entries.filter((e) => e && typeof e.points === 'number' && Number.isFinite(e.points));
  if (entries.length === 0) return null;
  const same = (e: RaceResultEntry) => e;

  const best = entries.reduce((m, e) => Math.max(m, e.points), Number.NEGATIVE_INFINITY);
  // The server names no winner when the top score is zero or less; a podium of zeros is not one either.
  const hasWinner = best > 0;
  const mine1st = (e: RaceResultEntry) => Number(!!userId && e.userId === userId);
  const podium = !hasWinner ? [] : [...entries].filter((e) => e.rank >= 1 && e.rank <= 3)
    // within a tie the viewer comes first, so the cap can never be what drops them from their own podium
    .sort((a, b) => a.rank - b.rank || b.points - a.points || mine1st(b) - mine1st(a) || (a.displayName || '').localeCompare(b.displayName || ''))
    .slice(0, PODIUM_MAX_ROWS)
    .map((e) => ({ ...person(e, userId), rank: e.rank, points: e.points }));

  const top = callout(entries, (e) => e.points, 'max', same, userId);
  const topScore = hasWinner ? top : null;
  const bottom = callout(entries, (e) => e.points, 'min', same, userId);
  // A lowest score is only a callout when it is not also the best one and there is a field to be last in.
  const lowScore = bottom && top && bottom.value < top.value && entries.length >= 3 ? bottom : null;

  // Points per $100 of the roster fielded. Only managers the server recorded a roster value for.
  const priced = entries.filter((e) => typeof e.rosterValue === 'number' && Number.isFinite(e.rosterValue) && e.rosterValue > 0)
    .map((e) => ({ entry: e, per100: pointsPer100(e.points, e.rosterValue as number) }));
  const effTop = priced.length >= 2 ? callout(priced, (x) => x.per100, 'max', (x) => x.entry, userId) : null;
  const effBottom = priced.length >= 3 ? callout(priced, (x) => x.per100, 'min', (x) => x.entry, userId) : null;
  const mostEfficient = effTop && effTop.value > 0 ? effTop : null;
  const leastEfficient = effBottom && effTop && effBottom.value < effTop.value ? effBottom : null;

  // Against each manager's own previous round; only managers scored in both can be compared.
  const before = new Map((previous?.entries ?? []).filter((e) => e && Number.isFinite(e.points)).map((e) => [e.userId, e.points]));
  const changes = entries.filter((e) => before.has(e.userId)).map((e) => ({ entry: e, change: e.points - (before.get(e.userId) as number) }));
  const up = callout(changes, (c) => c.change, 'max', (c) => c.entry, userId);
  const down = callout(changes, (c) => c.change, 'min', (c) => c.entry, userId);
  const climb = up && up.value > 0 ? up : null;
  const drop = down && down.value < 0 ? down : null;

  const shots = entries.filter((e) => typeof e.moonshotPoints === 'number' && e.moonshotPoints !== 0);
  const hit = callout(shots, (e) => e.moonshotPoints as number, 'max', same, userId);
  const miss = callout(shots, (e) => e.moonshotPoints as number, 'min', same, userId);
  const moonshotHit = hit && hit.value > 0 ? hit : null;
  const moonshotMiss = miss && miss.value < 0 ? miss : null;

  // Every Moonshot settled on this race, named from the leaderboard so a manager reads the same here as above.
  const byUser = new Map(entries.map((e) => [e.userId, e]));
  const moonshotsAll: ReportMoonshot[] = activity
    .filter((a) => a && a.raceId === current.raceId && OUTCOMES[a.type])
    .map((a) => {
      const e = byUser.get(a.userId);
      return {
        id: a.id,
        who: e ? person(e, userId) : { userId: a.userId, name: 'Player', team: '', isMe: !!userId && a.userId === userId },
        driverId: a.settledOnDriverId ?? a.driverId,
        predictionType: a.predictionType,
        predictionTarget: a.predictionTarget,
        outcome: OUTCOMES[a.type],
        amount: OUTCOMES[a.type] === 'VOID' ? 0 : a.adjustmentAmount,
        currency: a.stakeCurrency,
        stake: a.stakeAmount,
        multiplier: a.multiplier,
        modelProbability: a.modelProbability,
        finish: a.officialDriverFinish,
      };
    });
  // The call of the round is the hit the model thought least likely; level chances go to the bigger payout.
  const hits = moonshotsAll.filter((m) => m.outcome === 'HIT');
  const callOfTheRound = hits.length === 0 ? null : [...hits].sort((a, b) => (a.modelProbability ?? 1) - (b.modelProbability ?? 1) || b.amount - a.amount || a.id.localeCompare(b.id))[0];
  const order = { HIT: 0, MISSED: 1, VOID: 2 } as const;
  const moonshots = [...moonshotsAll].sort((a, b) => Number(b === callOfTheRound) - Number(a === callOfTheRound) || order[a.outcome] - order[b.outcome] || b.amount - a.amount || a.id.localeCompare(b.id));

  const mine = userId ? entries.find((e) => e.userId === userId) : undefined;
  const me: MyRound | null = mine
    ? { rank: mine.rank, of: entries.length, points: mine.points, change: before.has(mine.userId) ? mine.points - (before.get(mine.userId) as number) : null }
    : null;

  return {
    raceId: current.raceId,
    round: current.round ?? null,
    size: entries.length,
    podium,
    topScore,
    lowScore,
    climb,
    drop,
    mostEfficient,
    leastEfficient,
    moonshotHit,
    moonshotMiss,
    moonshots,
    callOfTheRound,
    hasWinner,
    me,
    comparedToRound: changes.length > 0 ? previous?.round ?? null : null,
    estimated: current.estimated === true || (changes.length > 0 && previous?.estimated === true),
  };
}

/** "SAM OKAFOR", "YOU & SAM OKAFOR", "SAM OKAFOR & 3 OTHERS": who a callout names, in the label case the screen uses. */
export function calloutNames(c: ReportCallout): string {
  const first = c.people[0];
  if (!first) return '';
  const lead = (first.isMe ? 'You' : first.name).toUpperCase();
  if (c.people.length === 1) return lead;
  if (c.people.length === 2) return `${lead} & ${c.people[1].name.toUpperCase()}`;
  return `${lead} & ${c.people.length - 1} OTHERS`;
}

/** "+1,080" / "-223": a signed points figure. */
export function signedPoints(n: number): string {
  return `${n >= 0 ? '+' : '-'}${Math.abs(n).toLocaleString()}`;
}

/**
 * The round before `raceId` among the races the league has a leaderboard for, newest first as
 * `raceOptions` returns them. Null for the first round on record.
 */
export function previousRaceId(options: { raceId: string; round: number }[], raceId: string): string | null {
  const here = options.find((o) => o.raceId === raceId);
  if (!here) return null;
  const earlier = options.filter((o) => o.round < here.round).sort((a, b) => b.round - a.round);
  return earlier[0]?.raceId ?? null;
}

interface SeasonRace { id: string; round: number; name: string; seasonId?: string; status?: string }

/**
 * The race a report is for and the round to compare it with, from the season calendar rather
 * than the League tab's selector: the recap can open a report before the league's list of
 * leaderboards has refreshed, and the report must not lose its title or its comparison for that.
 * `resultIds`, when the league's list is known, narrows the comparison to rounds it has a
 * leaderboard for; the race itself is never required to be in it.
 */
export function reportRaces(races: SeasonRace[], raceId: string, resultIds?: string[] | null): { round: number | null; label: string | null; previousId: string | null } {
  const here = races.find((r) => r.id === raceId);
  if (!here) return { round: null, label: null, previousId: null };
  const have = resultIds && resultIds.length > 0 ? new Set(resultIds) : null;
  const earlier = races
    .filter((r) => r.id !== raceId && r.round < here.round && (r.seasonId ?? null) === (here.seasonId ?? null) && r.status === 'completed' && (!have || have.has(r.id)))
    .sort((a, b) => b.round - a.round);
  return { round: here.round, label: `RD ${here.round} · ${shortRaceName(here.name).toUpperCase()}`, previousId: earlier[0]?.id ?? null };
}
