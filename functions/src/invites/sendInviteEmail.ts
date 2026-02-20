import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';

const db = admin.firestore();

// Secret managed via: firebase functions:secrets:set GMAIL_APP_PASSWORD
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');

const SENDER_EMAIL = 'theundercutapp@gmail.com';
const BASE_URL = 'https://f1-app-18077.web.app';

// Rate limits: invites per league
const BASE_INVITE_LIMIT = 100;
const EXPANDED_INVITE_LIMIT = 200;  // when league slots > 40
const MAX_INVITE_LIMIT = 10_000;    // hard cap regardless of slots
const EXPANDED_SLOT_THRESHOLD = 40;

// Simple email format validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEmailHtml(leagueName: string, inviteCode: string, joinUrl: string): string {
  const safeName = escapeHtml(leagueName);
  const safeCode = escapeHtml(inviteCode);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0D1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#161B22;border-radius:12px;border:1px solid #30363D;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 16px;text-align:center;border-bottom:2px solid #14B8A6;">
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#14B8A6;letter-spacing:-0.5px;">Undercut</h1>
              <p style="margin:4px 0 0;color:#8B949E;font-size:14px;">Leave Me To It</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 8px;color:#E6EDF3;font-size:20px;font-weight:600;">You're invited!</h2>
              <p style="margin:0 0 24px;color:#8B949E;font-size:15px;line-height:1.6;">
                You've been invited to join <strong style="color:#E6EDF3;">${safeName}</strong> on Undercut.
              </p>
              <!-- Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#0D1117;border:2px solid #30363D;border-radius:8px;padding:16px;text-align:center;">
                    <p style="margin:0 0 4px;color:#8B949E;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Your Invite Code</p>
                    <p style="margin:0;font-size:32px;font-weight:700;color:#E6EDF3;letter-spacing:6px;font-family:'SF Mono','Fira Code','Courier New',monospace;">${safeCode}</p>
                  </td>
                </tr>
              </table>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td align="center">
                    <a href="${joinUrl}" style="display:inline-block;background:#14B8A6;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">
                      Join League
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Instructions -->
              <p style="margin:24px 0 0;color:#8B949E;font-size:13px;line-height:1.6;text-align:center;">
                Or open the Undercut app, go to Leagues, tap "Join with Code", and enter the code above.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #30363D;">
              <p style="margin:0;color:#8B949E;font-size:12px;">
                &copy; 2026 Undercut. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Get the invite limit for a league based on its maxMembers (slot count).
 */
function getInviteLimit(maxMembers: number | undefined): number {
  if (!maxMembers) return BASE_INVITE_LIMIT;
  const limit = maxMembers > EXPANDED_SLOT_THRESHOLD
    ? EXPANDED_INVITE_LIMIT
    : BASE_INVITE_LIMIT;
  return Math.min(limit, MAX_INVITE_LIMIT);
}

/**
 * Check if the league has exceeded its invite rate limit.
 * Counts all invite docs (regardless of status) in the subcollection.
 */
async function checkInviteRateLimit(leagueId: string, maxMembers: number | undefined): Promise<void> {
  const limit = getInviteLimit(maxMembers);
  const countSnapshot = await db
    .collection(`leagues/${leagueId}/invites`)
    .count()
    .get();
  const totalInvites = countSnapshot.data().count;

  if (totalInvites > limit) {
    throw new Error(`Invite limit reached (${limit}) for this league`);
  }
}

/**
 * Firestore trigger: sends an invite email when a new invite document is created.
 *
 * Set the secret: firebase functions:secrets:set GMAIL_APP_PASSWORD
 */
export const sendInviteEmail = onDocumentCreated(
  {
    document: 'leagues/{leagueId}/invites/{inviteId}',
    secrets: [gmailAppPassword],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data associated with the event');
      return;
    }

    const inviteData = snapshot.data();
    const { leagueId } = event.params;

    // Guard: skip if no email
    const email = inviteData.email;
    if (!email) {
      console.log('No email in invite doc, skipping');
      return;
    }

    // Validate email format
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
      console.log(`Invalid email format: ${typeof email === 'string' ? email.slice(0, 50) : 'non-string'}`);
      await snapshot.ref.update({ status: 'failed', error: 'Invalid email format' });
      return;
    }

    // Guard: skip if already processed
    const status = inviteData.status;
    if (status === 'sent' || status === 'failed') {
      console.log(`Invite already processed (status: ${status}), skipping`);
      return;
    }

    // Get the Gmail app password
    const password = gmailAppPassword.value();
    if (!password) {
      console.error('GMAIL_APP_PASSWORD secret not set. Run: firebase functions:secrets:set GMAIL_APP_PASSWORD');
      await snapshot.ref.update({ status: 'failed', error: 'Email not configured' });
      return;
    }

    // Look up league for name, invite code, and slot count
    let leagueName = 'a league';
    let inviteCode = '';
    let maxMembers: number | undefined;
    try {
      const leagueDoc = await db.doc(`leagues/${leagueId}`).get();
      if (leagueDoc.exists) {
        const leagueData = leagueDoc.data();
        leagueName = leagueData?.name || 'a league';
        inviteCode = leagueData?.inviteCode || '';
        maxMembers = leagueData?.maxMembers;
      }
    } catch (err) {
      console.error('Failed to fetch league:', err);
    }

    if (!inviteCode) {
      console.error('No invite code found for league');
      await snapshot.ref.update({ status: 'failed', error: 'No invite code for league' });
      return;
    }

    // Check rate limit
    try {
      await checkInviteRateLimit(leagueId, maxMembers);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rate limit exceeded';
      console.log(`Invite rate limited for league ${leagueId}: ${msg}`);
      await snapshot.ref.update({ status: 'failed', error: msg });
      return;
    }

    const joinUrl = `${BASE_URL}/join?code=${encodeURIComponent(inviteCode)}`;

    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: SENDER_EMAIL,
        pass: password,
      },
    });

    try {
      await transporter.sendMail({
        from: `"Undercut" <${SENDER_EMAIL}>`,
        to: email,
        subject: `You're invited to join "${escapeHtml(leagueName)}" on Undercut!`,
        html: buildEmailHtml(leagueName, inviteCode, joinUrl),
      });

      await snapshot.ref.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Invite email sent for league "${leagueName}"`);
    } catch (err) {
      console.error('Failed to send invite email:', err);
      await snapshot.ref.update({
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }
);
