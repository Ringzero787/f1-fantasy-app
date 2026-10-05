/** Lineups lock at the last session before points are at stake: FP3, or sprint qualifying on a sprint weekend. */
export interface RaceSchedule { fp1?: Date; fp2?: Date; fp3?: Date; sprintQualifying?: Date; sprint?: Date; qualifying?: Date; race?: Date }

export function lockTime(s: RaceSchedule, hasSprint: boolean): Date | null {
  return (hasSprint ? s.sprintQualifying ?? s.qualifying : s.fp3 ?? s.qualifying) ?? null;
}

/**
 * When the ACE stops moving — later than the lineup, and on a sprint weekend much later
 * (F-098). Three sessions score with the ace applied, so it freezes when the first of them
 * begins: the sprint where there is one, otherwise qualifying.
 *
 * Mirrors `aceFreezeStart` in functions/src/utils/lockTime.ts, including reading the sprint off
 * `schedule.sprint` rather than the `hasSprint` flag — the flag is only ever set to true and a
 * round whose sessions are unpublished would otherwise read as freezing at qualifying, hours
 * after the sprint it has to cover. `hasSprint` is the fallback when the time is missing, which
 * fails closed: sprint qualifying comes before the sprint.
 */
export function aceFreezeTime(s: RaceSchedule, hasSprint: boolean): Date | null {
  const sprint = s.sprint ?? (hasSprint ? s.sprintQualifying : undefined);
  const quali = s.qualifying;
  if (sprint && quali) return sprint.getTime() <= quali.getTime() ? sprint : quali;
  return sprint ?? quali ?? s.race ?? null;
}

/**
 * The roster lock the SERVER applies: `effectiveLockTime` in functions/src/utils/lockTime.ts.
 *
 * Deliberately not `lockTime` above, which says FP3 on a normal weekend where the server says
 * qualifying — the two have disagreed since before this change, and the ace line must be measured
 * against the lock that is actually enforced rather than the one the header happens to display.
 */
function serverLockTime(s: RaceSchedule, hasSprint: boolean): Date | null {
  return (hasSprint ? s.sprintQualifying ?? s.qualifying : s.qualifying) ?? null;
}

/**
 * True only when the ace outlives the roster lock by enough to be worth saying. On a normal
 * weekend the server locks the roster at qualifying and the ace freezes at the same moment, so
 * there is nothing to tell anyone; on a sprint weekend the roster goes at sprint qualifying on
 * Friday and the ace survives until Saturday's sprint.
 */
export function aceOutlivesLineup(s: RaceSchedule, hasSprint: boolean): boolean {
  const lock = serverLockTime(s, hasSprint), ace = aceFreezeTime(s, hasSprint);
  return !!lock && !!ace && ace.getTime() > lock.getTime();
}

/** "Sat 10 Oct 09:00 UTC" — the moment itself, for a line that has to be unambiguous. */
export function sessionMoment(at: Date | null): string | null {
  return at ? `${DAYS[at.getUTCDay()]} ${dayMonth(at)} ${hhmm(at)} UTC` : null;
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

/** Older than this and the bar says so: the worker publishes at least daily. */
export const STALE_AFTER_MS = 30 * 3600 * 1000;
export const isStale = (iso: string, now: Date): boolean => { const d = new Date(iso); return /^\d{4}-\d{2}-\d{2}T/.test(iso) && !Number.isNaN(d.getTime()) && now.getTime() - d.getTime() > STALE_AFTER_MS; };
