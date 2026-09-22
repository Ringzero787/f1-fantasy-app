/**
 * App-to-web sign-in handoff (F-075, ARCHITECTURE section 3) — pure rules.
 *
 * The app asks for a code, opens the portal with the code in the URL fragment, and the portal
 * swaps it for a Firebase custom token. A code is 32 random bytes, lives 60 seconds, works once,
 * and only its SHA-256 is stored, so a leaked database row cannot be replayed.
 */
import { createHash, randomBytes } from 'crypto';

export const HANDOFF_TTL_MS = 60_000;
export const ALLOWED_SOURCES = ['profile', 'upgrade_sheet', 'team_teaser', 'recap_teaser'] as const;

export const newHandoffCode = (): string => randomBytes(32).toString('base64url');
export const hashHandoffCode = (code: string): string => createHash('sha256').update(code, 'utf8').digest('hex');
export const isWellFormedCode = (code: unknown): code is string => typeof code === 'string' && /^[A-Za-z0-9_-]{43}$/.test(code);
export const cleanSource = (src: unknown): string | null => (typeof src === 'string' && (ALLOWED_SOURCES as readonly string[]).includes(src) ? src : null);

export interface HandoffDoc { uid: string; expiresAt: number; used: boolean; src: string | null; createdAt: number }

export function newHandoffDoc(uid: string, src: string | null, now: number): HandoffDoc {
  return { uid, expiresAt: now + HANDOFF_TTL_MS, used: false, src, createdAt: now };
}

export type RedeemCheck = 'ok' | 'missing' | 'used' | 'expired';
export function checkRedeem(doc: Partial<HandoffDoc> | undefined, now: number): RedeemCheck {
  if (!doc || typeof doc.uid !== 'string' || typeof doc.expiresAt !== 'number') return 'missing';
  if (doc.used === true) return 'used';
  if (doc.expiresAt <= now) return 'expired';
  return 'ok';
}

/** Fixed-window rate limit. Returns the next window state, or null when the caller is over the limit. */
export interface RateWindow { windowStart: number; count: number }
export function nextRateWindow(prev: Partial<RateWindow> | undefined, now: number, windowMs: number, max: number): RateWindow | null {
  if (!prev || typeof prev.windowStart !== 'number' || typeof prev.count !== 'number' || now - prev.windowStart >= windowMs) return { windowStart: now, count: 1 };
  if (prev.count >= max) return null;
  return { windowStart: prev.windowStart, count: prev.count + 1 };
}

export const CREATE_LIMIT = { windowMs: 60_000, max: 10 };
export const REDEEM_LIMIT = { windowMs: 60_000, max: 20 };
/** Rate-limit keys never store an IP address, only its hash. */
export const ipKey = (ip: string | undefined): string => `ip_${createHash('sha256').update(ip || 'unknown', 'utf8').digest('hex').slice(0, 32)}`;
