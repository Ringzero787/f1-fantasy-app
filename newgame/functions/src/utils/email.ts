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

// Track Limits brand palette (matches the app's dark theme).
const BRAND = {
  bg: '#0D1117',
  card: '#161B22',
  border: '#30363D',
  text: '#E6EDF3',
  textMuted: '#8B949E',
  accent: '#F87171', // TL red
  link: '#58A6FF',
};

const WORDMARK_URL = 'https://humannpc.com/tracklimits/images/wordmark-white.png';
const SITE_URL = 'https://humannpc.com/tracklimits/';
const PRIVACY_URL = 'https://humannpc.com/tracklimits/privacy.html';
const DELETE_URL = 'https://humannpc.com/tracklimits/delete-account.html';

export interface BrandTemplateArgs {
  /** Single-line title shown above the body, e.g. "Deletion request received". */
  heading: string;
  /** HTML body content (paragraphs, lists, etc). Will be wrapped in the card. */
  bodyHtml: string;
  /** Optional preheader (the preview snippet next to the subject in inbox listings). */
  preheader?: string;
}

/** Wrap caller-provided body HTML in the TL-branded email shell. All styling
 *  is inline (most email clients strip <style>). Layout uses tables for
 *  Outlook compatibility. */
export function renderBrandEmail({ heading, bodyHtml, preheader }: BrandTemplateArgs): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};color:${BRAND.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  ${preheader ? `<div style="display:none;font-size:1px;color:${BRAND.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <a href="${SITE_URL}" style="text-decoration:none;display:inline-block;">
                <img src="${WORDMARK_URL}" alt="Track Limits" width="180" style="display:block;width:180px;max-width:60vw;height:auto;border:0;outline:none;">
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:14px;padding:28px 28px 24px;">
              <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;letter-spacing:-0.01em;font-weight:700;color:${BRAND.text};">${escapeHtml(heading)}</h1>
              <div style="font-size:15px;line-height:1.7;color:${BRAND.text};">
                ${bodyHtml}
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">
              <p style="margin:0 0 6px;">
                <a href="${PRIVACY_URL}" style="color:${BRAND.textMuted};text-decoration:underline;">Privacy policy</a>
                &nbsp;·&nbsp;
                <a href="${DELETE_URL}" style="color:${BRAND.textMuted};text-decoration:underline;">Delete account or data</a>
              </p>
              <p style="margin:0;opacity:0.6;">Track Limits — a HumanNPC game</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
