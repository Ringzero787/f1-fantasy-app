/**
 * Lockout utility - pure functions for race weekend team lockout logic.
 *
 * Teams lock at FP3 (normal weekend) or Sprint Qualifying (sprint weekend)
 * and unlock when the race is marked complete.
 * Ace selection locks at race start time.
 */

import type { Race, RaceSchedule } from '../types';

export interface LockoutInfo {
  isLocked: boolean;
  lockReason: string | null;
  nextRace: Race | null;
  lockTime: Date | null;
  raceStartTime: Date | null;
  aceLocked: boolean;
}

/**
 * Find the next incomplete race (lowest round not in completedRaceIds).
 * Races whose scheduled race time is more than 4 hours in the past are
 * treated as implicitly complete — this prevents stale locks when
 * syncCompletedRaces hasn't run or failed silently.
 */
export function getNextIncompleteRace(
  races: Race[],
  completedRaceIds: Set<string>,
  now?: Date,
): Race | null {
  const sorted = [...races].sort((a, b) => a.round - b.round);
  const nowMs = (now ?? new Date()).getTime();
  const IMPLICIT_COMPLETE_MS = 4 * 60 * 60 * 1000; // 4 hours after race start
  return sorted.find((r) => {
    if (completedRaceIds.has(r.id)) return false;
    // If race start time is well past, treat as implicitly complete
    const raceTimeRaw = r.schedule?.race;
    if (raceTimeRaw) {
      const raceTime = new Date(raceTimeRaw).getTime();
      if (!isNaN(raceTime) && nowMs > raceTime + IMPLICIT_COMPLETE_MS) return false;
    }
    return true;
  }) ?? null;
}

/**
 * Determine the lockout time for a race:
 * - Sprint weekend → sprintQualifying time
 * - Normal weekend → fp3 time
 */
export function getLockoutTime(race: Race): Date | null {
  if (race.hasSprint && race.schedule.sprintQualifying) {
    return new Date(race.schedule.sprintQualifying);
  }
  if (race.schedule.fp3) {
    return new Date(race.schedule.fp3);
  }
  // Fallback: qualifying time
  return new Date(race.schedule.qualifying);
}

/**
 * Compute the full lockout status.
 *
 * @param races - All races in the season
 * @param completedRaceIds - Set of race IDs that have been marked complete
 * @param now - Current time
 * @param adminOverride - 'locked' | 'unlocked' | null
 */
export function computeLockoutStatus(
  races: Race[],
  completedRaceIds: Set<string>,
  now: Date,
  adminOverride: 'locked' | 'unlocked' | null,
): LockoutInfo {
  // Default: season complete, everything locked
  const seasonComplete: LockoutInfo = {
    isLocked: true,
    lockReason: 'Season complete',
    nextRace: null,
    lockTime: null,
    raceStartTime: null,
    aceLocked: true,
  };

  const nextRace = getNextIncompleteRace(races, completedRaceIds, now);
  if (!nextRace) {
    // Admin override can unlock even when season is "complete" (for testing)
    if (adminOverride === 'unlocked') {
      return { ...seasonComplete, isLocked: false, lockReason: null, aceLocked: false };
    }
    return seasonComplete;
  }

  const lockTime = getLockoutTime(nextRace);
  const raceStartTime = new Date(nextRace.schedule.race);
  const nowMs = now.getTime();

  // Compute natural lockout state
  const isNaturallyLocked = lockTime ? nowMs >= lockTime.getTime() : false;
  const isAceNaturallyLocked = nowMs >= raceStartTime.getTime();

  // Apply admin override
  if (adminOverride === 'locked') {
    return {
      isLocked: true,
      lockReason: `Teams locked for ${nextRace.name} (admin override)`,
      nextRace,
      lockTime,
      raceStartTime,
      aceLocked: isAceNaturallyLocked,
    };
  }

  if (adminOverride === 'unlocked') {
    return {
      isLocked: false,
      lockReason: null,
      nextRace,
      lockTime,
      raceStartTime,
      aceLocked: false,
    };
  }

  // Natural schedule
  return {
    isLocked: isNaturallyLocked,
    lockReason: isNaturallyLocked ? `Teams locked for ${nextRace.name}` : null,
    nextRace,
    lockTime,
    raceStartTime,
    aceLocked: isAceNaturallyLocked,
  };
}
