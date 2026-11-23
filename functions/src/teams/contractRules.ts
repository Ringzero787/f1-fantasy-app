/**
 * F-169: how long a contract may run.
 *
 * 1. Never past the end of the season. With one race left, a six-race contract is a one-race
 *    contract (and the early-termination fee would otherwise be quoted on races that will never run).
 * 2. Never more than MAX_CONSECUTIVE_RACES with the same driver in a row. Selling and re-buying in
 *    the same window does not reset the count: the team held the driver for every race. Once the
 *    run reaches the cap the driver is locked out for STREAK_LOCKOUT_RACES race(s), the same
 *    `driverLockouts` clock as contract expiry (Phase 3.5).
 *
 * The server CLAMPS a requested length rather than refusing it: shipped builds send their default
 * (3) whatever the calendar says, and refusing would block every purchase near the season's end.
 * Keep in sync with src/config/contractRules.ts (the picker's copy).
 */

export const MIN_CONTRACT_LENGTH = 1;
export const MAX_CONTRACT_LENGTH = 6;
export const MAX_CONSECUTIVE_RACES = 6;
export const STREAK_LOCKOUT_RACES = 1;

/** A driver sold in the current window: races held in a row up to the sale, and the clock then. */
export interface StreakEntry { held: number; atRace: number }

/** Pure: races of the season still to run (not completed, not cancelled). */
export function racesLeftInSeason(races: ReadonlyArray<{ status?: unknown }>): number {
  return races.filter((r) => r.status !== 'completed' && r.status !== 'cancelled').length;
}

const own = (o: unknown, k: string): unknown =>
  o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? (o as Record<string, unknown>)[k] : undefined;

/**
 * Pure: races this team has already held `driverId` in a row, coming into a purchase now.
 * Only a sale in this same window counts (no race since): a race without the driver breaks the run.
 */
export function priorStreak(driverStreaks: unknown, driverId: string, completedRaceCount: number): number {
  const e = own(driverStreaks, driverId) as Partial<StreakEntry> | undefined;
  if (!e || typeof e.held !== 'number' || typeof e.atRace !== 'number') return 0;
  return e.atRace === completedRaceCount ? Math.max(0, Math.floor(e.held)) : 0;
}

/**
 * Pure: the contract length a purchase gets. `requested` has already passed the integer/≥1 check.
 * Returns 0 when the driver may not be bought at all (the run is already at the cap).
 */
export function allowedContractLength(requested: number, racesLeft: number, prior = 0): number {
  const streakRoom = MAX_CONSECUTIVE_RACES - prior;
  if (streakRoom <= 0) return 0;
  // An exhausted calendar (after the final, before the rollover) still allows a one-race contract.
  const seasonRoom = Math.max(MIN_CONTRACT_LENGTH, racesLeft);
  return Math.max(MIN_CONTRACT_LENGTH, Math.min(requested, MAX_CONTRACT_LENGTH, seasonRoom, streakRoom));
}

/**
 * Pure: the team's `driverStreaks` after selling a driver now. Entries from an earlier window are
 * dropped (they can no longer carry). Returns null when nothing is left to store.
 */
export function streaksAfterSale(
  driverStreaks: unknown,
  driver: { driverId: string; racesHeld?: number; streakBefore?: number },
  completedRaceCount: number,
): Record<string, StreakEntry> | null {
  const next: Record<string, StreakEntry> = {};
  if (driverStreaks && typeof driverStreaks === 'object') {
    for (const [id, e] of Object.entries(driverStreaks as Record<string, Partial<StreakEntry>>)) {
      if (e && typeof e.held === 'number' && e.atRace === completedRaceCount) next[id] = { held: e.held, atRace: e.atRace };
    }
  }
  const held = (typeof driver.streakBefore === 'number' ? driver.streakBefore : 0) + (driver.racesHeld || 0);
  if (held > 0) next[driver.driverId] = { held, atRace: completedRaceCount };
  else delete next[driver.driverId];
  return Object.keys(next).length ? next : null;
}
