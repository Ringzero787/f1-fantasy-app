// Shared transactional-email helper for the TL functions codebase. Backed by
// Resend (resend.com) with a verified humannpc.com sending domain.
//
// Usage: declare `secrets: [RESEND_API_KEY]` on the function via
// functions.runWith({ secrets: ['RESEND_API_KEY'] }), then call
// sendEmail({ to, subject, html, text? }). The key is loaded from
// process.env.RESEND_API_KEY at request time.
//
// Failures are caught and logged but do NOT throw — the email is always a
// side-effect, never the primary product, so a Resend outage should not
// cascade into a failed user-facing request.

import * as functions from 'firebase-functions/v1';
import { Resend } from 'resend';

const DEFAULT_FROM = 'Track Limits <no-reply@humannpc.com>';
const DEFAULT_REPLY_TO = 'nathan.shanks@gmail.com';

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  sent: boolean;
  id?: string;
  error?: string;
}

let cachedClient: Resend | null = null;
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    functions.logger.warn('RESEND_API_KEY missing; email send will be skipped');
    return null;
  }
  if (!cachedClient) cachedClient = new Resend(key);
  return cachedClient;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const client = getClient();
  if (!client) return { sent: false, error: 'no_api_key' };

  try {
    const resp = await client.emails.send({
      from: args.from || DEFAULT_FROM,
      to: Array.isArray(args.to) ? args.to : [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: args.replyTo || DEFAULT_REPLY_TO,
    });
    if (resp.error) {
      functions.logger.error('Resend send failed', resp.error);
      return { sent: false, error: resp.error.message };
    }
    return { sent: true, id: resp.data?.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    functions.logger.error('Resend threw', msg);
    return { sent: false, error: msg };
  }
}

/** Strip user-supplied text down to safe inline-html. No tags, no entities
 *  beyond &amp; / &lt; / &gt;. Keep linebreaks → <br>. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}
