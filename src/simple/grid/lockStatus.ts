/**
 * Grid header status strings — pure, so they can be unit-tested and shared
 * by the Team, Picker and member screens.
 *
 *   RD 17 / 24 · BAKU            (left, muted)
 *   LOCKS IN 2D 14H              (right, red)   before the weekend lock
 *   LOCKED · QUALI IN 9H         (right, red)   locked, quali still ahead
 *   LOCKED · RACE IN 2H          (right, red)   quali done, race ahead
 *   LOCKED · RACING              (right, red)   race under way
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
}

export function formatLockStatus(i: LockStatusInput): string {
  if (!i.hasNextRace) return 'SEASON OVER';
  const now = i.now.getTime();
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
