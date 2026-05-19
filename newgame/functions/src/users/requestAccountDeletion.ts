// tlRequestAccountDeletion — public HTTPS endpoint that records account-
// deletion requests submitted from humannpc.com/tracklimits/delete-account.
//
// Required by Google Play's Data Safety form: users must be able to request
// deletion of their account and data without being signed in. We record the
// request to Firestore so the admin can look up the matching auth UID and
// either delete the account directly (via Firebase Console) or via the
// existing adminDeleteUser callable in the Undercut codebase.

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { applyCors } from '../triggers/_cors';
import { sendEmail, escapeHtml } from '../utils/email';

const db = admin.firestore();
const ADMIN_NOTIFY_TO = 'nathan.shanks@gmail.com';

interface DeletionRequestBody {
  email?: string;
  reason?: string;
  /** "account_and_data" deletes the auth user + all docs; "data_only" wipes
   *  docs but leaves the auth user signable-in. Defaults to account_and_data
   *  for safety + back-compat with form posts that pre-date this field. */
  requestType?: 'account_and_data' | 'data_only';
}

export const tlRequestAccountDeletion = functions
  .runWith({ secrets: ['RESEND_API_KEY'] })
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' });
      return;
    }
    const { email, reason, requestType } = (req.body || {}) as DeletionRequestBody;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'email required' });
      return;
    }
    const trimmedEmail = email.trim().toLowerCase().slice(0, 320);
    const trimmedReason = (reason || '').toString().slice(0, 2000);
    const safeRequestType: 'account_and_data' | 'data_only' =
      requestType === 'data_only' ? 'data_only' : 'account_and_data';

    const docRef = await db.collection('tl_deletion_requests').add({
      email: trimmedEmail,
      reason: trimmedReason,
      requestType: safeRequestType,
      status: 'pending',
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      userAgent: req.headers['user-agent'] || null,
    });

    const requestTypeLabel = safeRequestType === 'data_only'
      ? 'Data only (account stays)'
      : 'Account + all data';

    // 1. Acknowledge to the user. Single fire-and-forget; failures are logged
    //    but never block the response — the doc is already persisted.
    void sendEmail({
      to: trimmedEmail,
      subject: 'Track Limits — deletion request received',
      html: `
        <p>Hi,</p>
        <p>We received your Track Limits deletion request. Here's what you asked for:</p>
        <ul>
          <li><strong>Request type:</strong> ${escapeHtml(requestTypeLabel)}</li>
          <li><strong>Account email:</strong> ${escapeHtml(trimmedEmail)}</li>
        </ul>
        <p>We'll process your request within 30 days and email you again when it's complete. If you didn't make this request, reply to this email immediately and we'll cancel it.</p>
        <p>— Track Limits</p>
      `,
      text:
        `We received your Track Limits deletion request.\n` +
        `Request type: ${requestTypeLabel}\n` +
        `Account email: ${trimmedEmail}\n\n` +
        `We'll process your request within 30 days and email you when complete.\n` +
        `If you didn't make this request, reply to this email and we'll cancel it.\n\n` +
        `— Track Limits`,
    });

    // 2. Notify the admin.
    void sendEmail({
      to: ADMIN_NOTIFY_TO,
      subject: `[TL] Deletion request: ${trimmedEmail}`,
      html: `
        <p>New Track Limits deletion request.</p>
        <ul>
          <li><strong>Email:</strong> ${escapeHtml(trimmedEmail)}</li>
          <li><strong>Request type:</strong> ${escapeHtml(requestTypeLabel)}</li>
          <li><strong>Reason:</strong> ${trimmedReason ? escapeHtml(trimmedReason) : '<em>none given</em>'}</li>
          <li><strong>Firestore doc:</strong> tl_deletion_requests/${docRef.id}</li>
        </ul>
        <p>Action via Firebase console or the adminDeleteUser callable.</p>
      `,
    });

    res.status(200).json({ ok: true });
  });
