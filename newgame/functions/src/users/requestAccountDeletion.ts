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
import { sendEmail, escapeHtml, renderBrandEmail } from '../utils/email';

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
      html: renderBrandEmail({
        heading: 'We received your deletion request',
        preheader: `${requestTypeLabel} · We'll process within 30 days.`,
        bodyHtml: `
          <p style="margin:0 0 14px;">Thanks — your Track Limits deletion request is in our queue. Here's what you asked for:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 12px;border:1px solid #30363D;border-right:0;background:#0D1117;width:40%;color:#8B949E;font-size:13px;">Request type</td>
              <td style="padding:8px 12px;border:1px solid #30363D;background:#0D1117;color:#E6EDF3;font-size:14px;"><strong>${escapeHtml(requestTypeLabel)}</strong></td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border:1px solid #30363D;border-top:0;border-right:0;background:#0D1117;color:#8B949E;font-size:13px;">Account email</td>
              <td style="padding:8px 12px;border:1px solid #30363D;border-top:0;background:#0D1117;color:#E6EDF3;font-size:14px;">${escapeHtml(trimmedEmail)}</td>
            </tr>
          </table>
          <p style="margin:0 0 14px;">We'll process your request within <strong>30 days</strong> and email you again when it's complete.</p>
          <p style="margin:0;color:#8B949E;font-size:13px;">If you didn't make this request, reply to this email and we'll cancel it.</p>
        `,
      }),
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
      html: renderBrandEmail({
        heading: 'New deletion request',
        preheader: `${trimmedEmail} · ${requestTypeLabel}`,
        bodyHtml: `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 12px;border:1px solid #30363D;border-right:0;background:#0D1117;width:40%;color:#8B949E;font-size:13px;">Email</td>
              <td style="padding:8px 12px;border:1px solid #30363D;background:#0D1117;color:#E6EDF3;font-size:14px;">${escapeHtml(trimmedEmail)}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border:1px solid #30363D;border-top:0;border-right:0;background:#0D1117;color:#8B949E;font-size:13px;">Request type</td>
              <td style="padding:8px 12px;border:1px solid #30363D;border-top:0;background:#0D1117;color:#E6EDF3;font-size:14px;">${escapeHtml(requestTypeLabel)}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border:1px solid #30363D;border-top:0;border-right:0;background:#0D1117;color:#8B949E;font-size:13px;">Reason</td>
              <td style="padding:8px 12px;border:1px solid #30363D;border-top:0;background:#0D1117;color:#E6EDF3;font-size:14px;">${trimmedReason ? escapeHtml(trimmedReason) : '<em style="color:#8B949E;">none given</em>'}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border:1px solid #30363D;border-top:0;border-right:0;background:#0D1117;color:#8B949E;font-size:13px;">Firestore doc</td>
              <td style="padding:8px 12px;border:1px solid #30363D;border-top:0;background:#0D1117;color:#E6EDF3;font-size:13px;font-family:'SF Mono','Menlo',monospace;">tl_deletion_requests/${docRef.id}</td>
            </tr>
          </table>
          <p style="margin:0;color:#8B949E;font-size:13px;">Action via Firebase console or the <code style="background:#0D1117;border:1px solid #30363D;border-radius:4px;padding:2px 6px;font-size:12px;">adminDeleteUser</code> callable.</p>
        `,
      }),
    });

    res.status(200).json({ ok: true });
  });
