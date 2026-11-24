/**
 * F-174: the server-driven notice banner on the Team panel, read from `config/app.notice`.
 *
 * The field is admin-written (firestore.rules: config/{docId} writes need the admin claim), but an
 * admin claim is a person and a doc can be mistyped, so it is parsed as untrusted input: anything
 * malformed means no banner at all (fail closed), never a half-rendered one. The text is rendered as
 * plain React Native <Text>, never as HTML or markdown.
 *
 * Shape (every field but id, title and body is optional):
 *
 *   notice: {
 *     id: string,          // 1–64 of [A-Za-z0-9._-]; the dismissal key, so a new id shows again
 *     title: string,       // 1–80 characters after trimming, one line (no line breaks)
 *     body: string,        // 1–500 characters after trimming; line breaks allowed
 *     tone?: 'info'|'warn',// default 'info'
 *     from?: ISO 8601,     // shown from this instant (inclusive); needs a zone: Z or ±hh:mm
 *     until?: ISO 8601,    // hidden from this instant on (exclusive); must be after `from`
 *     minVersion?: string, // shown only on app versions >= this (dotted numbers, e.g. "2.9.0")
 *     maxVersion?: string, // shown only on app versions <= this
 *     url?: string,        // a "MORE" link: https on humannpc.com (or a subdomain), or a store link;
 *                          // any other value drops the link and keeps the notice
 *   }
 *
 * `from`/`until` may also be Firestore Timestamps (an op that writes a JS Date stores one).
 */
import { isStoreUrl } from '../../config/storeLinks';

export type NoticeTone = 'info' | 'warn';

export interface Notice {
  id: string;
  title: string;
  body: string;
  tone: NoticeTone;
  /** epoch ms, or null when unbounded */
  fromMs: number | null;
  untilMs: number | null;
  minVersion: string | null;
  maxVersion: string | null;
  /** null when absent or not an allowed link */
  url: string | null;
}

export const NOTICE_LIMITS = { id: 64, title: 80, body: 500, url: 300 } as const;

const ID_RE = /^[A-Za-z0-9._-]+$/;
const VERSION_RE = /^\d{1,4}(\.\d{1,4}){0,3}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
// C0/C1 control characters, bidi overrides and zero-width joiners other than \n: none belong in a notice
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/;
const OWN_HOSTS = ['humannpc.com'];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Dotted numeric versions: -1, 0 or 1; null when either is not one. */
export function compareVersions(a: string, b: string): number | null {
  if (!VERSION_RE.test(a) || !VERSION_RE.test(b)) return null;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** https on one of our own hosts (or a subdomain) with no userinfo or port, or a store link. */
export function isNoticeUrl(u: unknown): u is string {
  if (typeof u !== 'string' || !u || u.length > NOTICE_LIMITS.url) return false;
  if (/[\s\\]/.test(u) || CONTROL_RE.test(u)) return false;
  if (isStoreUrl(u)) return true;
  const m = /^https:\/\/([^/?#:@]+)(?:[/?#]|$)/i.exec(u);
  if (!m) return false;
  const host = m[1].toLowerCase();
  return OWN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** An instant as epoch ms: an ISO 8601 string with a zone, or a Firestore Timestamp. undefined = absent, NaN = bad. */
function instant(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return ISO_RE.test(v) ? Date.parse(v) : NaN;
  if (typeof v === 'object') {
    const t = v as { toMillis?: unknown; seconds?: unknown; nanoseconds?: unknown };
    if (typeof t.toMillis === 'function') {
      const ms = (t.toMillis as () => unknown)();
      return typeof ms === 'number' ? ms : NaN;
    }
    if (typeof t.seconds === 'number' && Number.isFinite(t.seconds)) return t.seconds * 1000 + (typeof t.nanoseconds === 'number' ? Math.floor(t.nanoseconds / 1e6) : 0);
  }
  return NaN;
}

function text(v: unknown, max: number, multiline: boolean): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\r\n?/g, '\n').trim();
  if (!s || s.length > max || CONTROL_RE.test(s)) return null;
  if (!multiline && s.includes('\n')) return null;
  return s;
}

/**
 * The notice as written, validated, or null when anything about it is malformed. Does not look at
 * the clock or the app version: see `noticeToShow`.
 */
export function parseNotice(raw: unknown): Notice | null {
  if (!isPlainObject(raw)) return null;
  // Unknown keys are ignored, not refused: a later build may add a field, and refusing it here would
  // blank the notice on every older build still installed. A typo (`untill`) is therefore silent too,
  // so the op that writes a notice must spell the keys as above (spec .aidlc/specs/F-174.md).

  const { id, tone, minVersion, maxVersion, url } = raw;
  if (typeof id !== 'string' || id.length > NOTICE_LIMITS.id || !ID_RE.test(id)) return null;
  const title = text(raw.title, NOTICE_LIMITS.title, false);
  const body = text(raw.body, NOTICE_LIMITS.body, true);
  if (!title || !body) return null;

  if (tone !== undefined && tone !== 'info' && tone !== 'warn') return null;

  const fromMs = instant(raw.from);
  const untilMs = instant(raw.until);
  if (Number.isNaN(fromMs) || Number.isNaN(untilMs)) return null;
  if (fromMs !== undefined && untilMs !== undefined && untilMs <= fromMs) return null;

  if (minVersion !== undefined && (typeof minVersion !== 'string' || !VERSION_RE.test(minVersion))) return null;
  if (maxVersion !== undefined && (typeof maxVersion !== 'string' || !VERSION_RE.test(maxVersion))) return null;
  if (typeof minVersion === 'string' && typeof maxVersion === 'string' && compareVersions(minVersion, maxVersion)! > 0) return null;

  return {
    id,
    title,
    body,
    tone: (tone as NoticeTone | undefined) ?? 'info',
    fromMs: fromMs ?? null,
    untilMs: untilMs ?? null,
    minVersion: (minVersion as string | undefined) ?? null,
    maxVersion: (maxVersion as string | undefined) ?? null,
    // a bad link drops the link, not the notice
    url: url === undefined ? null : isNoticeUrl(url) ? url : null,
  };
}

/** Inside its time window: from <= now < until. */
export function noticeInWindow(n: Notice, nowMs: number): boolean {
  if (n.fromMs != null && nowMs < n.fromMs) return false;
  if (n.untilMs != null && nowMs >= n.untilMs) return false;
  return true;
}

/** Inside its version bounds (both inclusive). An unknown or unparseable app version fails a bounded notice. */
export function noticeForVersion(n: Notice, appVersion: string | null | undefined): boolean {
  if (n.minVersion == null && n.maxVersion == null) return true;
  if (!appVersion) return false;
  if (n.minVersion != null) {
    const c = compareVersions(appVersion, n.minVersion);
    if (c == null || c < 0) return false;
  }
  if (n.maxVersion != null) {
    const c = compareVersions(appVersion, n.maxVersion);
    if (c == null || c > 0) return false;
  }
  return true;
}

/** The notice to render now, or null: valid, in its window, for this version and not dismissed. */
export function noticeToShow(raw: unknown, opts: { nowMs: number; appVersion: string | null | undefined; dismissedIds: ReadonlyArray<string> }): Notice | null {
  const n = parseNotice(raw);
  if (!n) return null;
  if (!noticeInWindow(n, opts.nowMs) || !noticeForVersion(n, opts.appVersion)) return null;
  if (isNoticeDismissed(opts.dismissedIds, n.id)) return null;
  return n;
}

// ── Dismissal ──────────────────────────────────────────────────────────────
/** How many dismissed ids are kept on the device; the oldest go first. */
export const MAX_DISMISSED_NOTICES = 20;

export function isNoticeDismissed(dismissedIds: ReadonlyArray<string> | null | undefined, id: string): boolean {
  return Array.isArray(dismissedIds) && dismissedIds.includes(id);
}

/** The dismissed list with `id` added last (moved there if it was already in it), capped to the newest MAX_DISMISSED_NOTICES. */
export function withDismissed(dismissedIds: ReadonlyArray<string> | null | undefined, id: string): string[] {
  const prior = Array.isArray(dismissedIds) ? dismissedIds.filter((x) => typeof x === 'string' && x !== id) : [];
  return [...prior, id].slice(-MAX_DISMISSED_NOTICES);
}
