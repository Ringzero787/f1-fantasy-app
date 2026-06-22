// Scheduled reminder: nudge engaged players who haven't made any picks for an
// upcoming race before qualifying locks. Under the "no selection = win nothing"
// rule, not picking means scoring nothing, so this is the safety net.
//
// Two nudges per race, deduped per user/race/stage:
//   early — within ~24h of qualifying ("lines are up, make your calls")
//   last  — within ~2.5h ("last call, locks soon")
//
// Delivery: FCM push if the user has a token, else Resend email (address from
// tl_users.email, falling back to Firebase Auth). Opt-out via
// tl_users.notificationPrefs.missingPicksReminder === false.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { sendPushToTLUser } from './sendPush';
import { sendEmail, renderBrandEmail } from '../utils/email';

const db = admin.firestore();
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

const EARLY_MAX_HOURS = 24;
const LAST_HOURS = 2.5;
const SITE_URL = 'https://humannpc.com/tracklimits/';

interface ReminderStamp {
  raceId: string;
  early?: boolean;
  last?: boolean;
}

// A picks doc counts as "participated" only if it holds at least one actual
// pick (a doc can exist with everything cleared back to no-selection).
function hasAnyPick(picks: unknown): boolean {
  if (!picks || typeof picks !== 'object') return false;
  for (const session of Object.values(picks as Record<string, unknown>)) {
    if (session && typeof session === 'object' && Object.keys(session).length > 0) return true;
  }
  return false;
}

export const tlNotifyMissingPicks = onSchedule(
  {
    schedule: 'every 30 minutes',
    secrets: [RESEND_API_KEY],
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'us-central1',
  },
  async () => {
    const nowMs = Date.now();
    const nowTs = admin.firestore.Timestamp.now();
    const windowEnd = admin.firestore.Timestamp.fromMillis(nowMs + EARLY_MAX_HOURS * 3600 * 1000);

    // Upcoming races whose qualifying is within the next 24h and hasn't passed.
    const racesSnap = await db
      .collection('races')
      .where('status', '==', 'upcoming')
      .where('schedule.qualifying', '>', nowTs)
      .where('schedule.qualifying', '<=', windowEnd)
      .get();
    if (racesSnap.empty) {
      console.log('[tl notify] no upcoming races within 24h');
      return;
    }

    for (const raceDoc of racesSnap.docs) {
      const race = raceDoc.data();
      const raceId = raceDoc.id;
      const qualiMs = (race.schedule?.qualifying as admin.firestore.Timestamp | undefined)?.toMillis?.() ?? 0;
      const hoursUntil = (qualiMs - nowMs) / 3600000;
      const stage: 'early' | 'last' = hoursUntil <= LAST_HOURS ? 'last' : 'early';
      const raceName = (race.name as string) ?? 'the next race';

      // Players who already participated (picks doc with >=1 real pick).
      const pickedSnap = await db.collection('tl_picks').where('raceId', '==', raceId).get();
      const pickedSet = new Set<string>();
      pickedSnap.forEach((d) => {
        const data = d.data();
        if (hasAnyPick(data.picks)) pickedSet.add(data.userId as string);
      });

      // Engaged players = anyone with a garage.
      const garagesSnap = await db.collection('tl_garages').get();

      let pushed = 0;
      let emailed = 0;
      let skipped = 0;
      const stamps: Array<{ ref: admin.firestore.DocumentReference; data: Record<string, unknown> }> = [];

      for (const g of garagesSnap.docs) {
        const userId = g.id;
        if (pickedSet.has(userId)) continue; // already made picks — nothing to nag

        const userSnap = await db.doc(`tl_users/${userId}`).get();
        const user = userSnap.data() ?? {};
        // Skip simulation/persona accounts — they have synthetic emails and
        // aren't real players to remind.
        if (user.isBot === true) {
          skipped++;
          continue;
        }
        if ((user.notificationPrefs as { missingPicksReminder?: boolean } | undefined)?.missingPicksReminder === false) {
          skipped++;
          continue;
        }

        // Per-user / per-race / per-stage dedupe.
        const stamp = user.pickReminder as ReminderStamp | undefined;
        const fresh = !stamp || stamp.raceId !== raceId;
        const earlySent = !fresh && stamp?.early === true;
        const lastSent = !fresh && stamp?.last === true;
        if (stage === 'last' && lastSent) continue;
        if (stage === 'early' && earlySent) continue;

        const title = stage === 'last' ? `Last call — ${raceName}` : `Picks due — ${raceName}`;
        const body =
          stage === 'last'
            ? `${raceName} locks in ~2 hours and you haven't made any picks. No pick = no points.`
            : `Ben's lines are up for ${raceName}. Make your calls before qualifying or you score nothing.`;
        const data = { type: 'missing_picks', raceId, stage };

        let delivered = false;
        if (user.pushToken) {
          delivered = await sendPushToTLUser(userId, title, body, data);
          if (delivered) pushed++;
        }
        if (!delivered) {
          const email =
            (user.email as string | undefined) ??
            (await admin.auth().getUser(userId).catch(() => null))?.email;
          if (email) {
            const html = renderBrandEmail({
              heading: stage === 'last' ? `${raceName} locks soon` : `Make your picks — ${raceName}`,
              preheader: 'No pick means no points this week.',
              bodyHtml:
                `<p>You haven't made any picks for <strong>${raceName}</strong>` +
                `${stage === 'last' ? ', and it locks in about 2 hours' : ''}.</p>` +
                `<p>Under the current rules, <strong>no selection means you score nothing this week</strong> — ` +
                `open Track Limits and call Ben's lines before qualifying.</p>` +
                `<p style="margin-top:20px"><a href="${SITE_URL}" style="display:inline-block;background:#DC2626;color:#fff;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px">Open Track Limits</a></p>`,
            });
            const res = await sendEmail({ to: email, subject: title, html });
            if (res.sent) {
              delivered = true;
              emailed++;
            }
          }
        }

        if (delivered) {
          stamps.push({
            ref: userSnap.ref,
            data: {
              pickReminder: {
                raceId,
                early: earlySent || stage === 'early',
                last: lastSent || stage === 'last',
              },
            },
          });
        } else {
          skipped++;
        }
      }

      // Persist dedupe stamps in batches (≤500 writes/batch).
      for (let i = 0; i < stamps.length; i += 400) {
        const batch = db.batch();
        for (const op of stamps.slice(i, i + 400)) batch.set(op.ref, op.data, { merge: true });
        await batch.commit();
      }

      console.log(
        `[tl notify] ${raceId} (${stage}, ${hoursUntil.toFixed(1)}h): pushed=${pushed} emailed=${emailed} skipped=${skipped}`,
      );
    }
  },
);
