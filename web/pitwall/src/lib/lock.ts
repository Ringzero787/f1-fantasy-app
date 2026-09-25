/** Lineups lock at the last session before points are at stake: FP3, or sprint qualifying on a sprint weekend. */
export interface RaceSchedule { fp1?: Date; fp2?: Date; fp3?: Date; sprintQualifying?: Date; sprint?: Date; qualifying?: Date; race?: Date }

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

// our own month names: the platform's en-GB gives "Sept", and the page says "Sep" everywhere else
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
const dayMonth = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

const SESSIONS: Array<[keyof RaceSchedule, string]> = [['fp1', 'FP1'], ['fp2', 'FP2'], ['fp3', 'FP3'], ['sprintQualifying', 'Sprint quali'], ['sprint', 'Sprint'], ['qualifying', 'Qualifying'], ['race', 'Race']];

/**
 * The next session still to run: "Race Sun 27 Sep 11:00 UTC". Once the weekend has started the
 * first session is history, and the bar was still announcing it.
 */
export function nextSession(s: RaceSchedule, now: Date): string | null {
  for (const [key, label] of SESSIONS) {
    const at = s[key];
    if (at && at.getTime() > now.getTime()) {
      return `${label} ${DAYS[at.getUTCDay()]} ${dayMonth(at)} ${hhmm(at)} UTC`;
    }
  }
  return s.race ? 'Weekend complete' : null;
}

/** "25 Sep 16:24 UTC" from an ISO stamp; anything else is shown as it is. */
export function asOfLabel(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(iso)) return iso;
  return `${dayMonth(d)} ${hhmm(d)} UTC`;
}
