import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import { inviteMail, cleanText } from '../charter/mail';
import { charterActive } from '../charter/charter';

const db = admin.firestore();

// Secret managed via: firebase functions:secrets:set GMAIL_APP_PASSWORD
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');

const SENDER_EMAIL = 'theundercutapp@gmail.com';

// Rate limits: invites per league
const BASE_INVITE_LIMIT = 100;
const EXPANDED_INVITE_LIMIT = 200;  // when league slots > 40
const MAX_INVITE_LIMIT = 10_000;    // hard cap regardless of slots
const EXPANDED_SLOT_THRESHOLD = 40;

// Simple email format validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


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
    let ownerName = 'A friend';
    let chartered = false;
    try {
      const leagueDoc = await db.doc(`leagues/${leagueId}`).get();
      if (leagueDoc.exists) {
        const leagueData = leagueDoc.data();
        leagueName = leagueData?.name || 'a league';
        inviteCode = leagueData?.inviteCode || '';
        maxMembers = leagueData?.maxMembers;
        ownerName = cleanText(leagueData?.ownerName, 'A friend');
        // F-175: a chartered league's invite says so; an ordinary one gets the short version.
        chartered = charterActive(leagueData, Date.now());
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

    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: SENDER_EMAIL,
        pass: password,
      },
    });

    try {
      // F-175: the black card with the red accent (charter/mail.ts) replaces the teal template.
      const mail = inviteMail(ownerName, cleanText(leagueName, 'a league'), inviteCode, chartered);
      await transporter.sendMail({
        from: `"Undercut" <${SENDER_EMAIL}>`,
        to: email,
        subject: mail.subject,
        html: mail.html,
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
