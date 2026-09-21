/** Lineups lock at the last session before points are at stake: FP3, or sprint qualifying on a sprint weekend. */
export interface RaceSchedule { fp1?: Date; fp3?: Date; sprintQualifying?: Date; qualifying?: Date; race?: Date }

export function lockTime(s: RaceSchedule, hasSprint: boolean): Date | null {
  return (hasSprint ? s.sprintQualifying ?? s.qualifying : s.fp3 ?? s.qualifying) ?? null;
}

/** "6d 04h", "3h 12m", "LOCKED". */
export function countdown(now: Date, at: Date | null): string {
  if (!at) return '—';
  const ms = at.getTime() - now.getTime();
  if (ms <= 0) return 'LOCKED';
  const mins = Math.floor(ms / 60000), d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(h)}h` : `${h}h ${pad(m)}m`;
}
