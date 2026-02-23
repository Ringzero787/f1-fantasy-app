import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import { sendPushToUsers } from './sendPush';

const db = admin.firestore();
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');

const SENDER_EMAIL = 'theundercutapp@gmail.com';
const RATE_LIMIT_SECONDS = 60;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'critical': return '#EF4444';
    case 'warning': return '#F59E0B';
    default: return '#06B6D4';
  }
}

function buildBroadcastEmailHtml(
  title: string,
  body: string,
  priority: string,
): string {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replace(/\n/g, '<br>');
  const accentColor = getPriorityColor(priority);
  const priorityLabel = priority.charAt(0).toUpperCase() + priority.slice(1);

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
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#161B22;border-radius:12px;border:1px solid #30363D;border-top:4px solid ${accentColor};">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 16px;text-align:center;">
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#14B8A6;letter-spacing:-0.5px;">Undercut</h1>
              <p style="margin:8px 0 0;color:${accentColor};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${priorityLabel} Announcement</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:16px 32px 32px;">
              <h2 style="margin:0 0 12px;color:#E6EDF3;font-size:20px;font-weight:600;">${safeTitle}</h2>
              <p style="margin:0;color:#8B949E;font-size:15px;line-height:1.6;">${safeBody}</p>
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

export const sendGlobalBroadcast = onCall(
  {
    secrets: [gmailAppPassword],
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (request) => {
    // Verify admin
    if (!request.auth?.token?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { title, body, priority, sendEmail } = request.data;

    // Validate inputs
    if (!title || typeof title !== 'string' || title.length < 1 || title.length > 100) {
      throw new HttpsError('invalid-argument', 'Title must be 1-100 characters');
    }
    if (!body || typeof body !== 'string' || body.length < 1 || body.length > 2000) {
      throw new HttpsError('invalid-argument', 'Body must be 1-2000 characters');
    }
    if (!['info', 'warning', 'critical'].includes(priority)) {
      throw new HttpsError('invalid-argument', 'Priority must be info, warning, or critical');
    }

    // Rate limit: check for broadcasts in last 60 seconds
    const recentBroadcasts = await db
      .collection('broadcasts')
      .where('createdAt', '>', new Date(Date.now() - RATE_LIMIT_SECONDS * 1000))
      .limit(1)
      .get();

    if (!recentBroadcasts.empty) {
      throw new HttpsError(
        'resource-exhausted',
        'A broadcast was sent less than 60 seconds ago. Please wait.',
      );
    }

    // Fetch all users (IDs + emails)
    const usersSnapshot = await db.collection('users').select('email').get();
    const userIds: string[] = [];
    const emails: string[] = [];

    usersSnapshot.docs.forEach((doc) => {
      userIds.push(doc.id);
      const email = doc.data().email;
      if (email && typeof email === 'string') {
        emails.push(email);
      }
    });

    // Send push notifications + in-app notifications
    await sendPushToUsers(userIds, title, body, {
      type: 'system_broadcast',
      priority,
    });

    // Send emails if requested
    let emailsSent = 0;
    if (sendEmail && emails.length > 0) {
      const password = gmailAppPassword.value();
      if (!password) {
        console.error('GMAIL_APP_PASSWORD secret not set');
      } else {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: SENDER_EMAIL,
            pass: password,
          },
        });

        const html = buildBroadcastEmailHtml(title, body, priority);
        const batchSize = 50;

        for (let i = 0; i < emails.length; i += batchSize) {
          const chunk = emails.slice(i, i + batchSize);
          const results = await Promise.allSettled(
            chunk.map((email) =>
              transporter.sendMail({
                from: `"Undercut" <${SENDER_EMAIL}>`,
                to: email,
                subject: `[${priority.toUpperCase()}] ${title}`,
                html,
              }),
            ),
          );

          emailsSent += results.filter((r) => r.status === 'fulfilled').length;
        }
      }
    }

    // Store audit record
    await db.collection('broadcasts').add({
      title,
      body,
      priority,
      sendEmail: !!sendEmail,
      sentBy: request.auth.uid,
      recipientCount: userIds.length,
      emailsSent,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      recipientCount: userIds.length,
      emailsSent,
    };
  },
);
