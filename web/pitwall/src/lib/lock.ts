/**
 * Lineups lock at the first session whose outcome scores: sprint qualifying on a sprint weekend,
 * qualifying otherwise. Mirrors `effectiveLockTime` in functions/src/utils/lockTime.ts, which is
 * what `autoLockTeams` enforces. It said FP3 for a normal weekend until F-103, three and a half
 * hours before the server actually locked anything.
 */
export interface RaceSchedule { fp1?: Date; fp2?: Date; fp3?: Date; sprintQualifying?: Date; sprint?: Date; qualifying?: Date; race?: Date }

export function lockTime(s: RaceSchedule, hasSprint: boolean): Date | null {
  return (hasSprint ? s.sprintQualifying ?? s.qualifying : s.qualifying) ?? null;
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
 * True only when the ace outlives the roster lock by enough to be worth saying. On a normal
 * weekend the server locks the roster at qualifying and the ace freezes at the same moment, so
 * there is nothing to tell anyone; on a sprint weekend the roster goes at sprint qualifying on
 * Friday and the ace survives until Saturday's sprint.
 */
export function aceOutlivesLineup(s: RaceSchedule, hasSprint: boolean): boolean {
  const lock = lockTime(s, hasSprint), ace = aceFreezeTime(s, hasSprint);
  return !!lock && !!ace && ace.getTime() > lock.getTime();
}

/** "Sat 10 Oct 09:00 UTC" — the moment itself, for a line that has to be unambiguous. */
export function sessionMoment(at: Date | null): string | null {
  return at ? `${DAYS[at.getUTCDay()]} ${dayMonth(at)} ${hhmm(at)} UTC` : null;
}

/**
 * What the ace line says, or null when there is nothing to say — evaluated at RENDER time, not
 * when the account loaded.
 *
 * `loadAccount` runs once per sign-in and nothing ticks, so a countdown baked into it is a
 * snapshot that quietly ages: leave the tab open past the sprint and a stale string would still be
 * promising a window that has shut. Taking the moment as epoch ms and deriving both halves here
 * means the line is right whenever anything re-renders, and disappears on its own once the freeze
 * has passed.
 */
export function aceFreezeLine(atMs: number | null, now: Date): { in: string; at: string } | null {
  if (atMs === null || !Number.isFinite(atMs)) return null;
  const at = new Date(atMs);
  if (at.getTime() <= now.getTime()) return null;
  const moment = sessionMoment(at);
  return moment ? { in: countdown(now, at), at: moment } : null;
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
