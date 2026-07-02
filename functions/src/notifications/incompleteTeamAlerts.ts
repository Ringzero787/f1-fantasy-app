import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import { sendPushToUser } from './sendPush';
import { effectiveLockTime, lockSessionLabel } from '../utils/lockTime';

const db = admin.firestore();

// Reuses the same Gmail app-password secret as league invites.
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');
const SENDER_EMAIL = 'theundercutapp@gmail.com';

const TEAM_SIZE = 5;

// Two nudges before qualifying locks the team:
//   early  — ~24h out ("build your team")
//   last   — ~2h out ("last chance"); fires while status is still 'upcoming'
//            (autoLockTeams flips to in_progress / locks at <=1h).
const EARLY_MAX_HOURS = 24;
const LAST_HOURS = 2.5;

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

/** Safe constructor read — a doc with no `constructor` field returns Object.prototype.constructor. */
function hasConstructor(team: Record<string, any>): boolean {
  const c = Object.prototype.hasOwnProperty.call(team, 'constructor') ? team['constructor'] : null;
  return !!(c && typeof c === 'object' && !Array.isArray(c) && typeof c.constructorId === 'string');
}

function describeMissing(team: Record<string, any>): string {
  const drivers = Array.isArray(team.drivers) ? team.drivers : [];
  const parts: string[] = [];
  const short = TEAM_SIZE - drivers.length;
  if (short > 0) parts.push(`${short} driver${short > 1 ? 's' : ''}`);
  if (!hasConstructor(team)) parts.push('a constructor');
  return parts.join(' and ');
}

function buildEmailHtml(raceName: string, missing: string, stage: 'early' | 'last'): string {
  const when = stage === 'last' ? 'locks in about 2 hours' : 'locks soon';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 12px">Your team isn't race-ready</h2>
    <p style="font-size:15px;line-height:1.5;margin:0 0 16px">
      <strong>${escapeHtml(raceName)}</strong> ${when}, and your Undercut team is still missing
      <strong>${escapeHtml(missing)}</strong>. Add ${missing.includes('and') || missing.includes('driver') ? 'them' : 'it'} before qualifying so you don't miss out on points.
    </p>
    <a href="https://undercut.humannpc.com" style="display:inline-block;background:#00D4FF;color:#03242b;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px">Open Undercut</a>
    <p style="font-size:12px;color:#64748b;margin-top:20px">You can turn off these reminders in the app under notification settings.</p>
  </div>`;
}

/**
 * Scheduled: remind owners of INCOMPLETE teams (missing drivers or a
 * constructor) before qualifying locks them. Two nudges per race (~24h, ~2h),
 * deduped per team per race per stage. Push if the user has a token, else
 * email (address from Firebase Auth). Opt-out via
 * users/{uid}.notificationPrefs.incompleteTeamReminder === false.
 *
 * Replaces the fragile on-device local reminder (which needs the app open).
 */
export const notifyIncompleteTeams = onSchedule(
  { schedule: 'every 30 minutes', secrets: [gmailAppPassword], timeoutSeconds: 300 },
  async () => {
    const nowMs = Date.now();
    const windowEndMs = nowMs + EARLY_MAX_HOURS * 3600 * 1000;

    // Upcoming races whose lock session (sprint qualifying on sprint
    // weekends, otherwise qualifying) is within the next 24h. Filtered in
    // code, matching autoLockTeams.
    const racesSnap = await db.collection('races')
      .where('status', '==', 'upcoming')
      .get();

    const dueRaces = racesSnap.docs.filter((doc) => {
      const lockAt = effectiveLockTime(doc.data());
      if (!lockAt) return false;
      const ms = lockAt.toMillis();
      return ms > nowMs && ms <= windowEndMs;
    });

    if (dueRaces.length === 0) {
      console.log('[IncompleteAlerts] No upcoming races locking within 24h');
      return;
    }

    let transporter: nodemailer.Transporter | null = null;
    const password = gmailAppPassword.value();
    if (password) {
      transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: SENDER_EMAIL, pass: password } });
    } else {
      console.warn('[IncompleteAlerts] GMAIL_APP_PASSWORD not set — email fallback disabled');
    }

    for (const raceDoc of dueRaces) {
      const race = raceDoc.data();
      const raceId = raceDoc.id;
      const lockMs = effectiveLockTime(race)?.toMillis() ?? 0;
      const hoursUntil = (lockMs - nowMs) / 3600000;
      const stageForRace: 'early' | 'last' = hoursUntil <= LAST_HOURS ? 'last' : 'early';

      // Only unlocked teams can still be fixed.
      const teamsSnap = await db.collection('fantasyTeams').where('isLocked', '==', false).get();

      let pushed = 0, emailed = 0, skipped = 0;
      const stampOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

      for (const teamDoc of teamsSnap.docs) {
        const team = teamDoc.data();
        const drivers = Array.isArray(team.drivers) ? team.drivers : [];
        const incomplete = drivers.length < TEAM_SIZE || !hasConstructor(team);
        if (!incomplete) continue;

        // Don't nag pristine, never-touched teams (fresh sign-ups who haven't
        // built once). Remind partial builds and previously-active teams.
        const hasHistory = drivers.length > 0 || (team.scoredRaces || []).length > 0;
        if (!hasHistory) { skipped++; continue; }

        // Per-team / per-race / per-stage dedupe.
        const stamp = team.incompleteReminder;
        const fresh = !stamp || stamp.raceId !== raceId;
        const earlySent = !fresh && stamp.early === true;
        const lastSent = !fresh && stamp.last === true;
        if (stageForRace === 'last' && lastSent) continue;
        if (stageForRace === 'early' && earlySent) continue;

        const userId = team.userId;
        if (!userId) continue;

        // Opt-out (default on).
        const userSnap = await db.doc(`users/${userId}`).get();
        const user = userSnap.data() || {};
        if (user.notificationPrefs?.incompleteTeamReminder === false) { skipped++; continue; }

        const missing = describeMissing(team);
        const title = stageForRace === 'last' ? `Last call — ${race.name} locks soon` : `Your team isn't race-ready`;
        const body = stageForRace === 'last'
          ? `${race.name} locks in ~2 hours and you're missing ${missing}. Add now to score.`
          : `${race.name} ${lockSessionLabel(race)} locks soon. Add ${missing} to earn points.`;
        const data = { type: 'incomplete_team', raceId, teamId: teamDoc.id, stage: stageForRace };

        let delivered = false;
        if (user.pushToken) {
          try { await sendPushToUser(userId, title, body, data); delivered = true; pushed++; }
          catch (e) { console.warn(`[IncompleteAlerts] push failed for ${userId}:`, e); }
        }
        if (!delivered && transporter) {
          try {
            const authUser = await admin.auth().getUser(userId).catch(() => null);
            const email = authUser?.email;
            if (email) {
              await transporter.sendMail({
                from: `"Undercut" <${SENDER_EMAIL}>`,
                to: email,
                subject: stageForRace === 'last' ? `Last call: ${race.name} locks soon` : `Your Undercut team is incomplete`,
                html: buildEmailHtml(race.name, missing, stageForRace),
              });
              delivered = true; emailed++;
            }
          } catch (e) { console.warn(`[IncompleteAlerts] email failed for ${userId}:`, e); }
        }

        if (delivered) {
          stampOps.push({
            ref: teamDoc.ref,
            data: {
              incompleteReminder: {
                raceId,
                early: earlySent || stageForRace === 'early',
                last: lastSent || stageForRace === 'last',
              },
            },
          });
        }
      }

      // Persist dedupe stamps in batches.
      for (let i = 0; i < stampOps.length; i += 400) {
        const batch = db.batch();
        for (const op of stampOps.slice(i, i + 400)) batch.set(op.ref, op.data, { merge: true });
        await batch.commit();
      }

      console.log(`[IncompleteAlerts] ${raceId} (${stageForRace}, ${hoursUntil.toFixed(1)}h): pushed=${pushed} emailed=${emailed} skipped=${skipped}`);
    }
  }
);
