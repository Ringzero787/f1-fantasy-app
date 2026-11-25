/**
 * Charter Cloud Functions (F-175 slice 3), exported as the `charter` group (deployed names
 * `charter-…`), so a deploy can target them (`--only functions:charter`).
 *
 * - onMemberWritten: keeps `charterAccess` and `searchPoints` in step with approval, leave, reject
 *   and remove, and sends the request and welcome emails. A second trigger on the member path,
 *   beside memberCount's onLeagueMemberWritten, so the count logic is untouched.
 * - approveMember: the only writer of `approved` in a chartered league (the rules refuse a client
 *   status change there), with the 22-player cap.
 * - giveRankUp: one per approved member per ISO week; never writes points.
 * - onLeagueChartered, onRaceResult, rankUpReminders: the owner, scored and Monday emails; onRaceResult
 *   also recounts `searchPoints` once per race.
 * - unsubscribe: the link in the weekly emails.
 */
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import { timingSafeEqual } from 'crypto';
import { charterActive } from './charter';
import { weekId } from './rankUp';
import { isApproved, wantsRankUpReminder } from './membership';
import { approve, giveRankUp as giveRankUpTx, recomputeSearchPoints, Refused, syncCharterMember } from './memberStore';
import { approvedMail, charteredMail, cleanText, recipient, rankUpMail, requestMail, scoredMail, sendOnce, takeDailySlot, type Transport } from './mail';
import { isUsableLeagueId } from '../utils/leagueId';

/** Join-request emails one owner can receive per league per day; requests past it still show in the app. */
const REQUEST_MAIL_DAILY_CAP = 25;

const db = admin.firestore();
// Already set in Secret Manager (sendInviteEmail uses it), so declaring it here cannot block a deploy.
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');

function transport(): Transport | null {
  const pass = gmailAppPassword.value();
  if (!pass) { console.error('[charter] GMAIL_APP_PASSWORD not set; email skipped'); return null; }
  return nodemailer.createTransport({ service: 'gmail', auth: { user: 'theundercutapp@gmail.com', pass } });
}

// ─── membership ───

export const onMemberWritten = onDocumentWritten(
  { document: 'leagues/{leagueId}/members/{memberId}', retry: true, secrets: [gmailAppPassword] },
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() : undefined;
    const after = event.data?.after.exists ? event.data.after.data() : undefined;
    const { leagueId, memberId } = event.params;
    const synced = await syncCharterMember(db, leagueId, memberId, before, after);
    if (!synced || (!synced.change.requested && !synced.change.approvedNow)) return;
    const { league, change } = synced;
    // the welcome mail only if they are still in: a late event must not welcome someone who left
    const welcome = change.approvedNow && synced.approvedNow;
    const t = transport();
    if (!t) return;
    const name = cleanText(league.name, 'your league');
    const code = typeof league.inviteCode === 'string' ? league.inviteCode : '';
    // A join request is something a stranger can cause, so it is capped per league per day as well
    // as once per player per day: a leave-and-ask-again loop cannot flood the owner or use up the
    // sender's daily quota.
    // One request email per player per league per day, checked BEFORE a league slot is taken, so
    // one account asking again and again cannot use up the day's slots for everyone else.
    const requestKey = `request_${leagueId}_${memberId}_${Math.floor(Date.now() / 86400000)}`;
    if (change.requested && typeof league.ownerId === 'string'
      && !(await db.collection('mail_log').doc(requestKey).get()).exists
      && await takeDailySlot(db, `request_${leagueId}`, REQUEST_MAIL_DAILY_CAP)) {
      const owner = await recipient(db, league.ownerId);
      await sendOnce(db, t, requestKey, owner.email, requestMail(cleanText(after?.displayName, 'A player'), name, code));
    }
    if (welcome) {
      const player = await recipient(db, memberId);
      await sendOnce(db, t, `approved_${leagueId}_${memberId}_${league.charter.expiresAt}`, player.email, approvedMail(name, code));
    }
  },
);

const idArg = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128 && !v.includes('/');

/** Approve a pending join request. Owner only; capped at 22 approved in a chartered league. */
export const approveMember = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { leagueId, userId } = (request.data ?? {}) as { leagueId?: unknown; userId?: unknown };
  if (typeof leagueId !== 'string' || !isUsableLeagueId(leagueId)) throw new HttpsError('invalid-argument', 'leagueId required');
  if (!idArg(userId)) throw new HttpsError('invalid-argument', 'userId required');
  try {
    await approve(db, leagueId, userId, uid);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    if (e.reason === 'no-league') throw new HttpsError('not-found', 'League not found.');
    if (e.reason === 'not-owner') throw new HttpsError('permission-denied', 'Only the league owner can approve players.');
    if (e.reason === 'not-pending') throw new HttpsError('failed-precondition', 'No pending request found for this player.');
    throw new HttpsError('failed-precondition', 'League is full. Remove a member before approving.');
  }
  return { ok: true };
});

const RANK_UP_MESSAGES: Record<string, string> = {
  'not-chartered': 'Rank Ups are for chartered leagues.',
  'not-member': 'You are not an approved member of this league.',
  self: 'Give your Rank Up to another player.',
  'target-not-member': 'That player is not an approved member of this league.',
  'already-given': 'You have given your Rank Up this week. It is back on Monday.',
};

/** Give this week's Rank Up to another approved member of a chartered league. Never writes points. */
export const giveRankUp = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { leagueId, toUid } = (request.data ?? {}) as { leagueId?: unknown; toUid?: unknown };
  if (typeof leagueId !== 'string' || !isUsableLeagueId(leagueId)) throw new HttpsError('invalid-argument', 'leagueId required');
  if (!idArg(toUid)) throw new HttpsError('invalid-argument', 'toUid required');
  try {
    return await giveRankUpTx(db, leagueId, uid, toUid);
  } catch (e) {
    // a parallel second gift loses on create(): the same answer as a sequential one
    const code = (e as { code?: unknown })?.code;
    if (code === 6 || code === 'already-exists') throw new HttpsError('already-exists', RANK_UP_MESSAGES['already-given']);
    if (!(e instanceof Refused)) throw e;
    throw new HttpsError(e.reason === 'already-given' ? 'already-exists' : 'failed-precondition', RANK_UP_MESSAGES[e.reason]);
  }
});

// ─── emails ───

/** The owner's "{League} is chartered" mail, once per charter (a renewal is a new charter). */
export const onLeagueChartered = onDocumentUpdated(
  { document: 'leagues/{leagueId}', retry: true, secrets: [gmailAppPassword] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || after.chartered !== true || !after.charter?.ref) return;
    if (before?.chartered === true && before?.charter?.ref === after.charter.ref) return;
    if (!charterActive(after, Date.now()) || typeof after.ownerId !== 'string') return;
    const t = transport();
    if (!t) return;
    const owner = await recipient(db, after.ownerId);
    const code = typeof after.inviteCode === 'string' ? after.inviteCode : '';
    await sendOnce(db, t, `chartered_${event.params.leagueId}_${after.charter.ref}`, owner.email, charteredMail(cleanText(after.name, 'Your league'), code));
  },
);

/**
 * When a league's race result is written (scoring writes it after the member totals; a correction
 * rewrites it): recount `searchPoints` once for the race. When it is first created: "{League} ·
 * {race} is scored" to each approved member. A failed send is retried by rethrowing after the
 * loop; the mail log makes the retry send only what did not go.
 */
export const onRaceResult = onDocumentWritten(
  { document: 'leagues/{leagueId}/raceResults/{raceId}', retry: true, secrets: [gmailAppPassword], timeoutSeconds: 300 },
  async (event) => {
    if (!event.data?.after.exists) return;
    const { leagueId, raceId } = event.params;
    const now = Date.now();
    if ((await recomputeSearchPoints(db, leagueId, now)) === null) return; // not chartered
    if (event.data.before.exists) return; // a correction: recount only, no second email
    const leagueRef = db.doc(`leagues/${leagueId}`);
    const league = (await leagueRef.get()).data();
    if (!league) return;
    const t = transport();
    if (!t) return;
    const name = cleanText(league.name, 'Your league');
    const race = cleanText(event.data.after.data()?.raceName, 'The race');
    const code = typeof league.inviteCode === 'string' ? league.inviteCode : '';
    const members = await leagueRef.collection('members').get();
    let failed = 0;
    for (const m of members.docs) {
      if (!isApproved(m.data())) continue;
      try {
        const r = await recipient(db, m.id, true);
        if (r.optedOut || !r.unsubscribeUrl) continue;
        await sendOnce(db, t, `scored_${leagueId}_${raceId}_${m.id}`, r.email, scoredMail(name, race, code, r.unsubscribeUrl));
      } catch (e) {
        failed += 1;
        console.error('[charter] scored mail failed for', m.id, e instanceof Error ? e.message : e);
      }
    }
    if (failed) throw new Error(`${failed} scored email(s) failed; retrying`);
  },
);

/** Monday 14:00 UTC: "Your rank up is back" to chartered members who have not given one or opened the app this week. */
export const rankUpReminders = onSchedule({ schedule: '0 14 * * 1', timeZone: 'Etc/UTC', secrets: [gmailAppPassword], timeoutSeconds: 540 }, async () => {
  const now = Date.now();
  const week = weekId(now);
  const t = transport();
  if (!t) return;
  const leagues = await db.collection('leagues').where('chartered', '==', true).get();
  let sent = 0;
  for (const l of leagues.docs) {
    const league = l.data();
    if (!charterActive(league, now)) continue;
    const [members, gifts] = await Promise.all([l.ref.collection('members').get(), l.ref.collection('rankUps').where('weekId', '==', week).get()]);
    const gave = new Set(gifts.docs.map((g) => g.data().fromUid as string));
    const name = cleanText(league.name, 'your league');
    const code = typeof league.inviteCode === 'string' ? league.inviteCode : '';
    for (const m of members.docs) {
      if (!isApproved(m.data())) continue;
      const user = (await db.doc(`users/${m.id}`).get()).data() ?? {};
      const last = user.lastOpenAt?.toMillis?.() ?? (typeof user.lastOpenAt === 'number' ? user.lastOpenAt : null);
      if (!wantsRankUpReminder({ gaveThisWeek: gave.has(m.id), lastOpenAtMs: last, now, optedOut: user.charterEmailOptOut === true })) continue;
      try {
        const r = await recipient(db, m.id, true);
        if (!r.unsubscribeUrl) continue;
        if (await sendOnce(db, t, `rankup_${week}_${l.id}_${m.id}`, r.email, rankUpMail(name, code, r.unsubscribeUrl))) sent += 1;
      } catch (e) {
        console.error('[charter] rank up mail failed for', m.id, e instanceof Error ? e.message : e);
      }
    }
  }
  console.log('[charter] rank up reminders sent:', sent);
});

/**
 * The "Stop these emails" link. A GET only shows a confirm button: mail scanners open every link
 * in a message, and a GET that unsubscribed would unsubscribe people who never clicked. The POST
 * sets `charterEmailOptOut` for the account the token belongs to.
 */
export const unsubscribe = onRequest({ region: 'us-central1' }, async (req, res) => {
  const src = req.method === 'POST' ? (req.body ?? {}) : req.query;
  const u = typeof src.u === 'string' ? src.u : '';
  const t = typeof src.t === 'string' ? src.t : '';
  const page = (body: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Undercut</title></head><body style="background:#000;color:#fff;font-family:-apple-system,sans-serif;padding:48px 16px;text-align:center">${body}</body></html>`;
  const invalid = () => res.status(400).send(page('<p>This link is not valid.</p>'));
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(u) || !/^[a-f0-9]{48}$/.test(t)) { invalid(); return; }
  const ref = db.doc(`users/${u}`);
  const user = (await ref.get()).data();
  const given = Buffer.from(t, 'utf8');
  const stored = Buffer.from(typeof user?.mailToken === 'string' ? user.mailToken : '', 'utf8');
  if (!user || stored.length !== given.length || !timingSafeEqual(stored, given)) { invalid(); return; }
  if (req.method !== 'POST') {
    res.status(200).send(page(`<p>Stop the weekly league emails (Rank Up and race reports)?</p><form method="POST"><input type="hidden" name="u" value="${u}"><input type="hidden" name="t" value="${t}"><button type="submit" style="background:#FF2E2E;color:#fff;border:0;border-radius:8px;padding:12px 28px;font-size:16px;font-weight:700">Stop these emails</button></form>`));
    return;
  }
  await ref.set({ charterEmailOptOut: true }, { merge: true });
  res.status(200).send(page('<p>Done. You will not get the weekly league emails any more.</p>'));
});
