// F-163. Pure half of the admin stats aggregator: turns rows the I/O half read into the shared
// stats document the humannpc admin App Stats page renders (the same contract QuiltWall and
// QuestLog write to admin/projects/{app}/stats). No Firestore or Auth here, so it is unit-tested.
import { passActive, Pass } from '../pitwall/pass';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const STATS_SCHEMA = 1;
export const SIGNUP_DAYS = 30;

/** A Firestore Timestamp, epoch ms, an ISO string or a Date — whatever a doc happens to hold. */
export type TimeLike = { toMillis(): number } | number | string | Date | null | undefined;

export function toMillis(t: TimeLike): number {
  if (t == null) return 0;
  if (typeof t === 'number') return Number.isFinite(t) ? t : 0;
  if (typeof t === 'string') { const n = Date.parse(t); return Number.isNaN(n) ? 0 : n; }
  if (t instanceof Date) return t.getTime();
  if (typeof (t as { toMillis?: unknown }).toMillis === 'function') return (t as { toMillis(): number }).toMillis();
  return 0;
}

export interface UserRow {
  uid: string;
  createdAt: TimeLike;
  pass?: Partial<Pass> | null;
  /** F-164: set on store testers and reviewers; they are not counted as users. */
  testAccount?: unknown;
}

/** Auth metadata for one uid: the later of last sign-in and last token refresh (an open app refreshes hourly). */
export type LastSeen = Map<string, number>;

export interface UsageCount { today: number; all: number }

export interface UndercutStatsInput {
  now: number;
  users: UserRow[];
  lastSeen: LastSeen;
  content: { teams: number; leagues: number; racesCompleted: number; moonshots: number };
  usage: { teamsCreated: UsageCount; leaguesCreated: UsageCount; moonshots: UsageCount; purchases: UsageCount };
  errors24h: number;
}

/** UTC calendar day, YYYY-MM-DD. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Signups per UTC day for the last `days` days (oldest first, zero-filled). */
export function signupsByDay(createdMs: number[], now: number, days = SIGNUP_DAYS): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) out[utcDay(now - i * DAY_MS)] = 0;
  for (const ms of createdMs) {
    if (!ms) continue;
    const k = utcDay(ms);
    if (k in out) out[k]++;
  }
  return out;
}

/** Active-user windows over a set of uids, from Auth last-seen times. */
export function activeWindows(uids: string[], lastSeen: LastSeen, now: number) {
  let day = 0, week = 0, month = 0;
  for (const uid of uids) {
    const seen = lastSeen.get(uid) || 0;
    if (!seen) continue;
    const age = now - seen;
    if (age < DAY_MS) day++;
    if (age < 7 * DAY_MS) week++;
    if (age < 30 * DAY_MS) month++;
  }
  return { activeUsersDay: day, activeUsersWeek: week, activeUsersMonth: month };
}

export function buildUndercutStats(input: UndercutStatsInput) {
  const { now, lastSeen } = input;
  // F-164: store testers and reviewers are counted once, apart, and nowhere else
  const users = input.users.filter((u) => !u.testAccount);
  const testAccounts = input.users.length - users.length;
  const created = users.map((u) => toMillis(u.createdAt));
  let paid = 0, trial = 0;
  for (const u of users) {
    if (!passActive(u.pass, now)) continue;
    if (u.pass?.ref === 'league_trial') trial++; else paid++;
  }
  return {
    schema: STATS_SCHEMA,
    app: 'undercut',
    updatedAt: now,
    totalUsers: users.length,
    testAccounts,
    newUsersToday: created.filter((ms) => ms && now - ms < DAY_MS).length,
    newUsersWeek: created.filter((ms) => ms && now - ms < 7 * DAY_MS).length,
    ...activeWindows(users.map((u) => u.uid), lastSeen, now),
    activeSource: 'auth-refresh',
    paidSubscribers: paid,
    trialUsers: trial,
    freeUsers: Math.max(0, users.length - paid - trial),
    estimatedMRR: null,
    signupsByDay: signupsByDay(created, now),
    content: input.content,
    usage: input.usage,
    health: { errors24h: input.errors24h },
  };
}
