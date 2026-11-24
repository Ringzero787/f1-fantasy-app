/**
 * F-155: the notice that tells players about the season reset before the rollover runs. Pure, so
 * the wording, the recipients and the rollover's gate on it are tested; functions/scripts/
 * sendSeasonNotice.js reads the users and sends.
 *
 * Channels, and what each one reaches (read 2026-11-24): 66 real players (125 users, 59 store test
 * accounts — F-164). The Grid UI that every player has used since 2.3 never registers a push token,
 * so only 10 users hold one, all from the old tabs UI, and the in-app inbox (`notifications`) is shown
 * only in that old UI. Push + inbox therefore reach almost nobody; they are sent because they cost
 * nothing. The channel that reaches every player is email (every user has an address), which
 * Undercut sends only from inside Cloud Functions (GMAIL_APP_PASSWORD is a functions secret, not on
 * the build box): the admin page's broadcast (sendGlobalBroadcast, "send email" ticked), which F-155
 * makes skip test accounts too. The owner stamps `resetNotice.emailAt` (stampSeasonNoticeEmail.js) once
 * it has gone out, and the rollover waits for both stamps.
 */
export const NOTICE_ID = 'season-reset-2026';

/** Hours the notice must have been out before the rollover may write (rollover.ts rolloverBlockers). */
export const NOTICE_LEAD_HOURS = 24;

/** The placeholder the script refuses to send: the day is filled in when the rollover is scheduled. */
export const DAY_PLACEHOLDER = '<RESET DAY>';

export const NOTICE_TITLE = 'Undercut 2027: every team starts fresh';

/** The body, with the reset day (e.g. "Monday 14 December"). No trademark terms in a name (CLAUDE.md). */
export function noticeBody(resetDay: string): string {
  return [
    `The 2026 season is over. On ${resetDay} every Undercut team starts again for 2027: an empty lineup, a $1,000 budget and zero points.`,
    'Your team keeps its name and stays in its leagues. Your 2026 points and every league\'s final table and champion are saved.',
    'Driver prices are reset from their 2026 results, and the market stays open all winter, so you can build your 2027 lineup straight away.',
    'If a driver you pick has no seat when the 2027 grid is confirmed, we take him off your team and give you back his price.',
    'Round 1 is Australia on 14 March 2027. Your lineup locks at qualifying the day before.',
  ].join(' ');
}

type Doc = Record<string, unknown>;

/** Push goes only to an Expo token: the format sendPush.ts accepts. */
export const isExpoToken = (t: unknown): t is string =>
  typeof t === 'string' && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));

/**
 * Who gets the notice. Test accounts (F-164, server-owned `testAccount`) get nothing. Everyone else
 * gets an inbox entry; a push only with a valid Expo token and notifications not switched off in the
 * app's settings (`settings.notifications === false`). `alreadySent` (ids with a ledger entry) are
 * skipped, so a re-run sends nobody anything twice.
 */
export function noticeRecipients(users: Array<{ id: string; data: Doc }>, alreadySent: ReadonlySet<string> = new Set()) {
  const inbox: string[] = [];
  const push: Array<{ uid: string; token: string }> = [];
  let tests = 0, skipped = 0;
  for (const u of users) {
    if (u.data.testAccount === true) { tests++; continue; }
    if (alreadySent.has(u.id)) { skipped++; continue; }
    inbox.push(u.id);
    const settings = (u.data.settings && typeof u.data.settings === 'object' ? u.data.settings : {}) as Doc;
    if (isExpoToken(u.data.pushToken) && settings.notifications !== false) push.push({ uid: u.id, token: u.data.pushToken });
  }
  return { inbox, push, tests, skipped };
}

/** sendGlobalBroadcast's recipients: every user but the test accounts. */
export function broadcastRecipients(users: Array<{ id: string; data: Doc }>): { userIds: string[]; emails: string[] } {
  const real = users.filter((u) => u.data.testAccount !== true);
  return {
    userIds: real.map((u) => u.id),
    emails: real.map((u) => u.data.email).filter((e): e is string => typeof e === 'string' && e.length > 0),
  };
}

const stampMs = (v: unknown): number | null => {
  const ms = v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis()
    : typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? ms : null;
};
const noticeField = (fromSeason: Doc, k: string): unknown => {
  const n = fromSeason.resetNotice;
  return n && typeof n === 'object' ? (n as Doc)[k] : undefined;
};

/** When the inbox + push notice went out, from `seasons/{from}.resetNotice.sentAt` (a Timestamp, ms or ISO); null if never. */
export function noticeSentMs(fromSeason: Doc): number | null {
  return stampMs(noticeField(fromSeason, 'sentAt'));
}

/** When the owner said the email broadcast went out (`resetNotice.emailAt`, stampSeasonNoticeEmail.js); null if never. */
export function noticeEmailMs(fromSeason: Doc): number | null {
  return stampMs(noticeField(fromSeason, 'emailAt'));
}
