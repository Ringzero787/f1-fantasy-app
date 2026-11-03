/**
 * Grid header status strings — pure, so they can be unit-tested and shared
 * by the Team, Picker and member screens.
 *
 *   RD 17 / 24 · BAKU            (left, muted)
 *   LOCKS IN 2D 14H              (right, red)   before the weekend lock
 *   LOCKED · QUALI IN 9H         (right, red)   locked, quali still ahead
 *   LOCKED · RACE IN 2H          (right, red)   quali done, race ahead
 *   LOCKED · RACING              (right, red)   race under way
 *   RESULTS PENDING              (right, red)   race over, not scored yet, server holds the roster (F-136)
 *   REOPENS IN 45M               (right, red)   results in, server still holds the roster
 *   REOPENING SOON               (right, red)   the hold has lapsed, the unlock sweep is due
 *   SEASON LOCKED                (right, red)   the player season-locked the team
 *   SEASON OVER                                 no next race
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** `2D 14H`, `9H`, `45M`, `NOW` — coarse countdown in the handoff's style. */
export function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return 'NOW';
  const days = Math.floor(msLeft / DAY);
  const hours = Math.floor((msLeft % DAY) / HOUR);
  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H`;
  return `${Math.max(1, Math.floor(msLeft / 60000))}M`;
}

export interface LockStatusInput {
  isLocked: boolean;
  lockTime: Date | null;
  qualifyingTime: Date | null;
  raceStartTime: Date | null;
  hasNextRace: boolean;
  now: Date;
  /**
   * F-136: the lock the SERVER has on the team (`lockStatus.canModify === false`), read off
   * the team document, as opposed to `isLocked`, which is worked out from the calendar. The
   * two part company after a race: the calendar moves on to the next round four hours after
   * lights out, while the server keeps every team until the results are scored plus a
   * buffer, and the 30-minute unlock sweep after that. In that gap the screen said
   * "LOCKS IN 5D" over dead rows and nothing explained why (Mexico 2026). `serverUnlockAt`
   * is `lockStatus.nextUnlockTime` when the team carries one.
   */
  serverLocked?: boolean;
  serverUnlockAt?: Date | null;
  seasonLocked?: boolean;
  /** The stamp is the pre-scoring failsafe, not a reopen time: the race has not been scored yet. */
  resultsPending?: boolean;
}

export function formatLockStatus(i: LockStatusInput): string {
  if (!i.hasNextRace) return 'SEASON OVER';
  const now = i.now.getTime();
  if (!i.isLocked && i.serverLocked) {
    if (i.seasonLocked) return 'SEASON LOCKED';
    if (i.resultsPending) return 'RESULTS PENDING';
    const at = i.serverUnlockAt?.getTime();
    if (at !== undefined && !Number.isNaN(at) && at > now) return `REOPENS IN ${formatCountdown(at - now)}`;
    return 'REOPENING SOON';
  }
  if (!i.isLocked) {
    if (!i.lockTime) return 'OPEN';
    return `LOCKS IN ${formatCountdown(i.lockTime.getTime() - now)}`;
  }
  if (i.qualifyingTime && i.qualifyingTime.getTime() > now) {
    return `LOCKED · QUALI IN ${formatCountdown(i.qualifyingTime.getTime() - now)}`;
  }
  if (i.raceStartTime && i.raceStartTime.getTime() > now) {
    return `LOCKED · RACE IN ${formatCountdown(i.raceStartTime.getTime() - now)}`;
  }
  return 'LOCKED · RACING';
}

/** `RD 17 / 24 · BAKU` — the next race's round over the season length. */
export function formatRoundStatus(round: number | null, total: number, city?: string | null): string {
  if (!round || total <= 0) return `SEASON ${new Date().getFullYear()}`;
  const place = (city ?? '').trim().toUpperCase();
  return place ? `RD ${round} / ${total} · ${place}` : `RD ${round} / ${total}`;
}

/** Season progress bar fill = rounds completed / total (0..1). */
export function seasonProgress(completedRounds: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, completedRounds / total));
}
