/**
 * League round report (F-120): pure helpers.
 *
 * After a race the league wants one answer: how did everybody do against each other? The server
 * already writes one leaderboard per race (F-062), and this turns two of them, the round and the
 * one before it, into a handful of callouts: the podium, the best and lowest score, who gained
 * and who lost the most on their own previous round, and the Moonshots that landed or missed.
 * Nothing here reads the network; the screen passes the documents in.
 */
import type { LeagueRaceResultDoc, RaceResultEntry } from './raceLeaderboard';

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
  moonshotHit: ReportCallout | null;
  moonshotMiss: ReportCallout | null;
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
  const value = pick === 'max' ? Math.max(...values) : Math.min(...values);
  const people = items.filter((i) => valueOf(i) === value).map((i) => person(entryOf(i), userId))
    .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
  return { people, value, includesMe: people.some((p) => p.isMe) };
}

/**
 * Build the report for one round. `previous` is the same league's leaderboard for the round
 * before; without it the report still stands, minus the two callouts that need a comparison.
 */
export function buildRoundReport(current: LeagueRaceResultDoc | null, previous: LeagueRaceResultDoc | null, userId: string | null): RoundReport | null {
  if (!current || !Array.isArray(current.entries) || current.entries.length === 0) return null;
  const entries = current.entries.filter((e) => e && typeof e.points === 'number' && Number.isFinite(e.points));
  if (entries.length === 0) return null;
  const same = (e: RaceResultEntry) => e;

  const podium = [...entries].filter((e) => e.rank >= 1 && e.rank <= 3)
    .sort((a, b) => a.rank - b.rank || b.points - a.points || (a.displayName || '').localeCompare(b.displayName || ''))
    .slice(0, PODIUM_MAX_ROWS)
    .map((e) => ({ ...person(e, userId), rank: e.rank, points: e.points }));

  const topScore = callout(entries, (e) => e.points, 'max', same, userId);
  const bottom = callout(entries, (e) => e.points, 'min', same, userId);
  // A lowest score is only a callout when it is not also the best one and there is a field to be last in.
  const lowScore = bottom && topScore && bottom.value < topScore.value && entries.length >= 3 ? bottom : null;

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
    moonshotHit,
    moonshotMiss,
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
