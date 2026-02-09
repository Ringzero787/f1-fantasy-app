/**
 * Lockout utility - pure functions for race weekend team lockout logic.
 *
 * Teams lock at FP3 (normal weekend) or Sprint Qualifying (sprint weekend)
 * and unlock when the race is marked complete.
 * Captain/ace selection locks at race start time.
 */

import type { Race, RaceSchedule } from '../types';

export interface LockoutInfo {
  isLocked: boolean;
  lockReason: string | null;
  nextRace: Race | null;
  lockTime: Date | null;
  raceStartTime: Date | null;
  captainLocked: boolean;
}

/**
 * Find the next incomplete race (lowest round not in completedRaceIds).
 */
export function getNextIncompleteRace(
  races: Race[],
  completedRaceIds: Set<string>,
): Race | null {
  const sorted = [...races].sort((a, b) => a.round - b.round);
  return sorted.find((r) => !completedRaceIds.has(r.id)) ?? null;
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
    captainLocked: true,
  };

  const nextRace = getNextIncompleteRace(races, completedRaceIds);
  if (!nextRace) {
    // Admin override can unlock even when season is "complete" (for testing)
    if (adminOverride === 'unlocked') {
      return { ...seasonComplete, isLocked: false, lockReason: null, captainLocked: false };
    }
    return seasonComplete;
  }

  const lockTime = getLockoutTime(nextRace);
  const raceStartTime = new Date(nextRace.schedule.race);
  const nowMs = now.getTime();

  // Compute natural lockout state
  const isNaturallyLocked = lockTime ? nowMs >= lockTime.getTime() : false;
  const isCaptainNaturallyLocked = nowMs >= raceStartTime.getTime();

  // Apply admin override
  if (adminOverride === 'locked') {
    return {
      isLocked: true,
      lockReason: `Teams locked for ${nextRace.name} (admin override)`,
      nextRace,
      lockTime,
      raceStartTime,
      captainLocked: isCaptainNaturallyLocked,
    };
  }

  if (adminOverride === 'unlocked') {
    return {
      isLocked: false,
      lockReason: null,
      nextRace,
      lockTime,
      raceStartTime,
      captainLocked: false,
    };
  }

  // Natural schedule
  return {
    isLocked: isNaturallyLocked,
    lockReason: isNaturallyLocked ? `Teams locked for ${nextRace.name}` : null,
    nextRace,
    lockTime,
    raceStartTime,
    captainLocked: isCaptainNaturallyLocked,
  };
}
