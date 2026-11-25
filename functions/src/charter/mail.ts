/**
 * Charter email (F-175 slice 3; BUILD.md, "Email").
 *
 * One template: a black card, red accent #FF2E2E, one button, footer "Undercut". Sender stays
 * theundercutapp@gmail.com through the GMAIL_APP_PASSWORD secret the invite email already uses,
 * so no new secret is declared (a declared secret with no value blocks every functions deploy).
 *
 * The builders are pure; `sendOnce` is the only part that touches Firestore or the network.
 * Every message is keyed, and `mail_log/{key}` is created before sending, so a retried trigger
 * never sends the same email twice.
 */
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';

export const SENDER_EMAIL = 'theundercutapp@gmail.com';
export const BASE_URL = 'https://undercut.humannpc.com';
export const ACCENT = '#FF2E2E';
/** The HTTPS function behind the unsubscribe link (deployed as charter-unsubscribe). */
export const UNSUBSCRIBE_URL = 'https://us-central1-f1-app-18077.cloudfunctions.net/charter-unsubscribe';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A single line of user-written text (league or player name), bounded, for a subject or a heading. */
export function cleanText(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 60);
  return s || fallback;
}

/** The league link every button uses: the app's only league route today is the join link. */
export const joinUrl = (inviteCode: string): string => `${BASE_URL}/join?code=${encodeURIComponent(inviteCode)}`;

export interface MailBody {
  /** plain text; escaped here */
  heading: string;
  /** plain-text paragraphs; escaped here */
  paragraphs: string[];
  button: { label: string; url: string };
  /** optional large code box (the invite code) */
  code?: string;
  /** when set, a footer link to stop these emails */
  unsubscribeUrl?: string;
}

export function cardHtml(b: MailBody): string {
  const p = b.paragraphs.map((t) => `<p style="margin:0 0 16px;color:#B3B3B3;font-size:15px;line-height:1.6;">${escapeHtml(t)}</p>`).join('');
  const code = b.code
    ? `<p style="margin:8px 0 24px;font-size:30px;font-weight:700;color:#FFFFFF;letter-spacing:6px;font-family:'SF Mono','Fira Code','Courier New',monospace;text-align:center;">${escapeHtml(b.code)}</p>`
    : '';
  const unsub = b.unsubscribeUrl
    ? `<br><a href="${escapeHtml(b.unsubscribeUrl)}" style="color:#666666;text-decoration:underline;">Stop these emails</a>`
    : '';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#000000;padding:40px 16px;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#0A0A0A;border:1px solid #222222;border-top:3px solid ${ACCENT};border-radius:12px;">
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;color:#FFFFFF;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${escapeHtml(b.heading)}</h1>
${p}${code}
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-top:8px;">
<a href="${escapeHtml(b.button.url)}" style="display:inline-block;background:${ACCENT};color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:700;">${escapeHtml(b.button.label)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #222222;color:#666666;font-size:12px;">Undercut${unsub}</td></tr>
</table></td></tr></table></body></html>`;
}

export interface Mail { subject: string; html: string }

export function charteredMail(league: string, code: string): Mail {
  return {
    subject: `${league} is chartered`,
    html: cardHtml({
      heading: `${league} is chartered`,
      paragraphs: [
        'Pit Wall is on for every approved player in your league, for the season.',
        'Your league is listed in search. Share it, and approve players as they ask to join.',
      ],
      code,
      button: { label: 'Share the league', url: joinUrl(code) },
    }),
  };
}

export function inviteMail(owner: string, league: string, code: string, chartered: boolean): Mail {
  if (!chartered) {
    // The short version (BUILD.md): league name, code, join link. No Pit Wall sentence.
    return {
      subject: `Join ${league} on Undercut`,
      html: cardHtml({
        heading: `Join ${league}`,
        paragraphs: [`${owner} invited you to ${league} on Undercut.`],
        code,
        button: { label: 'Join the league', url: joinUrl(code) },
      }),
    };
  }
  return {
    subject: `${owner} chartered ${league}`,
    html: cardHtml({
      heading: `${owner} chartered ${league}`,
      paragraphs: [
        `${league} comes with Pit Wall for every approved player this season.`,
        `Ask to join, and ${owner} will approve you.`,
      ],
      code,
      button: { label: 'Ask to join', url: joinUrl(code) },
    }),
  };
}

export function requestMail(name: string, league: string, code: string): Mail {
  // The requester's name is theirs to choose, so it stays out of the subject line of mail from
  // the official address; the heading is the plan's wording, escaped.
  return {
    subject: `New request to join ${league}`,
    html: cardHtml({
      heading: `${name} wants in to ${league}`,
      paragraphs: ['Approve them from the league page. Pit Wall turns on for them when you do.'],
      button: { label: 'Approve', url: joinUrl(code) },
    }),
  };
}

export function approvedMail(league: string, code: string): Mail {
  return {
    subject: `You're in ${league}. Pit Wall is on.`,
    html: cardHtml({
      heading: `You're in ${league}.`,
      paragraphs: ['Pit Wall is on for you while you stay in the league, for the season.'],
      button: { label: 'Open the league', url: joinUrl(code) },
    }),
  };
}

export function rankUpMail(league: string, code: string, unsubscribeUrl: string): Mail {
  return {
    subject: 'Your rank up is back',
    html: cardHtml({
      heading: 'Your rank up is back',
      paragraphs: [`You have a new Rank Up to give in ${league} this week. Give it to a player in your league and ${league} climbs in search.`],
      button: { label: 'Give it', url: joinUrl(code) },
      unsubscribeUrl,
    }),
  };
}

export function scoredMail(league: string, race: string, code: string, unsubscribeUrl: string): Mail {
  return {
    subject: `${league} · ${race} is scored`,
    html: cardHtml({
      heading: `${league} · ${race} is scored`,
      paragraphs: ['The round report is ready: who won the weekend, and how the table moved.'],
      button: { label: 'See the report', url: joinUrl(code) },
      unsubscribeUrl,
    }),
  };
}

// ─── sending ───

type Db = FirebaseFirestore.Firestore;
export type Transport = { sendMail: (m: { from: string; to: string; subject: string; html: string }) => Promise<unknown> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Send one email at most once per key. The log row is created first (create fails if it exists),
 * so two deliveries of the same trigger send once; a failed send removes the row and rethrows, so
 * the trigger's retry sends it then. Returns false when skipped (already sent, or no address).
 *
 * The usual at-most-once trade-offs remain: an instance that dies between the row and the send
 * loses that email, and a send that times out after the server accepted it is sent again.
 */
export async function sendOnce(db: Db, transport: Transport, key: string, to: unknown, mail: Mail): Promise<boolean> {
  if (typeof to !== 'string' || !EMAIL_RE.test(to)) return false;
  const row = db.collection('mail_log').doc(key.replace(/\//g, '_').slice(0, 1400));
  try {
    await row.create({ subject: mail.subject.slice(0, 200), at: admin.firestore.FieldValue.serverTimestamp() });
  } catch (e) {
    const code = (e as { code?: unknown })?.code;
    if (code === 6 || code === 'already-exists') return false;
    throw e;
  }
  try {
    await transport.sendMail({ from: `Undercut <${SENDER_EMAIL}>`, to, subject: mail.subject, html: mail.html });
    return true;
  } catch (e) {
    await row.delete().catch(() => undefined);
    throw e;
  }
}

/** The account's address and whether it has opted out of the weekly Charter emails. */
export interface Recipient { uid: string; email: string | null; optedOut: boolean; unsubscribeUrl: string | null }

/**
 * Read a user for mailing. The unsubscribe link carries a random per-user token kept on the user
 * document (`mailToken`, server-written), so no signing secret is needed and a link names one
 * account only.
 */
export async function recipient(db: Db, uid: string, withUnsubscribe = false, auth: Pick<admin.auth.Auth, 'getUser'> = admin.auth()): Promise<Recipient> {
  const ref = db.doc(`users/${uid}`);
  // The sign-in address, not `users/{uid}.email`: that field is client-writable, and mail from the
  // official address must not be pointed at whoever a player likes.
  let email: string | null = null;
  try {
    const u = await auth.getUser(uid);
    email = typeof u.email === 'string' ? u.email : null;
  } catch {
    email = null;
  }
  // The token is created at most once, in a transaction, so two emails going out together cannot
  // each make one and leave the first link dead.
  const { token, optedOut } = await db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() ?? {};
    let t = typeof data.mailToken === 'string' && data.mailToken.length >= 32 ? (data.mailToken as string) : null;
    if (withUnsubscribe && !t && email) {
      t = randomBytes(24).toString('hex');
      tx.set(ref, { mailToken: t }, { merge: true });
    }
    return { token: t, optedOut: data.charterEmailOptOut === true };
  });
  return {
    uid,
    email,
    optedOut,
    unsubscribeUrl: withUnsubscribe && token ? `${UNSUBSCRIBE_URL}?u=${encodeURIComponent(uid)}&t=${token}` : null,
  };
}

/**
 * A per-key daily allowance, for mail a stranger can cause (a join request). Returns true when a
 * slot was taken. The count lives in mail_log, which no client can read or write.
 */
export async function takeDailySlot(db: Db, key: string, cap: number, now = Date.now()): Promise<boolean> {
  const ref = db.collection('mail_log').doc(`cap_${key.replace(/\//g, '_')}_${Math.floor(now / 86400000)}`);
  return db.runTransaction(async (tx) => {
    const n = ((await tx.get(ref)).data()?.n as number | undefined) ?? 0;
    if (n >= cap) return false;
    tx.set(ref, { n: n + 1 }, { merge: true });
    return true;
  });
}
