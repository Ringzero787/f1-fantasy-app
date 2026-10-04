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
    if (r.status === 'cancelled') return false;
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

/**
 * F-095/F-098: the ace freeze the SERVER enforces, read off the team rather than worked
 * out from the calendar.
 *
 * Three sessions score with the ace applied — qualifying, the sprint, the race — and the
 * freeze covers all of them, from the first one to the failsafe ceiling, with one gap:
 * once qualifying has been scored and before the race starts, the ace moves freely. That
 * gap is the feature, and it opens on the qualifying key appearing in `scoredRaces`
 * rather than on a clock, so it cannot open before the points it would change are banked.
 *
 * `computeLockoutStatus` derives only the race start from the schedule, and it has no way
 * to know when qualifying was scored. The two agree about the race; this one additionally
 * knows about the earlier sessions, and about the four hours after a race when
 * `getNextIncompleteRace` has moved on to the next round and reports the ace free while
 * the rules still refuse the write. That is the shape of bug that offers a player a button
 * and then tells them no, so the stamped freeze wins where it is present.
 *
 * Mirrors `aceIsFrozen` in firestore.rules exactly, fallbacks included: a weekend stamped
 * before `aceFreezeFrom` existed still freezes from the race start it does carry, and a
 * half-written or unreadable window freezes nothing — fail open, not shut.
 *
 * The timestamps arrive from Firestore and survive a round trip through the persisted
 * store as `{seconds, nanoseconds}` — hence the coercion rather than a cast.
 */
export function serverAceLocked(
  team: { lockStatus?: unknown; scoredRaces?: unknown } | null | undefined,
  now: Date,
): boolean {
  const ls = team?.lockStatus as {
    aceFreezeFrom?: unknown; aceLockTime?: unknown; aceLockUntil?: unknown;
    aceQualiKey?: unknown; aceSprintKey?: unknown;
  } | null | undefined;
  const raceStart = toMillis(ls?.aceLockTime);
  const from = toMillis(ls?.aceFreezeFrom) ?? raceStart;
  const until = toMillis(ls?.aceLockUntil);
  if (from === null || until === null) return false;

  const t = now.getTime();
  if (t < from || t >= until) return false;

  const scored = Array.isArray(team?.scoredRaces) ? (team!.scoredRaces as unknown[]) : [];
  const marker = (v: unknown) => (typeof v === 'string' ? v : '');
  const qualiMarker = marker(ls?.aceQualiKey);
  const sprintMarker = marker(ls?.aceSprintKey);
  const qualifyingScored = qualiMarker !== '' && scored.includes(qualiMarker);
  // The sprint can miss its own scoring run too, and is then folded into race scoring
  // from a live ace read. Only stamped on sprint weekends; elsewhere it asks nothing.
  const sprintSettled = sprintMarker === '' || scored.includes(sprintMarker);
  const afterQualifyingBeforeRace = qualifyingScored && sprintSettled && raceStart !== null && t < raceStart;
  return !afterQualifyingBeforeRace;
}


/** Date, Firestore Timestamp, a rehydrated `{seconds}` plain object, ISO string or epoch ms. */
function toMillis(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object') {
    const v = value as { toMillis?: () => number; toDate?: () => Date; seconds?: unknown; _seconds?: unknown };
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.toDate === 'function') return toMillis(v.toDate());
    const seconds = typeof v.seconds === 'number' ? v.seconds : typeof v._seconds === 'number' ? v._seconds : null;
    if (seconds !== null) return seconds * 1000;
  }
  return null;
}
