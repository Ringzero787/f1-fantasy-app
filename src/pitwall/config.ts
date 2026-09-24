/**
 * Server-driven control of the Pit Wall surfaces in the app (F-077, ARCHITECTURE section 8).
 *
 * Placement, copy and whether anything shows at all live in the `pitwall` block of `config/app`,
 * so the surface can be changed, limited to a beta group, or switched off entirely without a store
 * build. Nothing renders unless the block says so: a missing or malformed block means no surface,
 * which is the safe default for a promotion.
 *
 * `mode` is per platform because store rules on linking out differ by store and by storefront, and
 * change. `open` means no price and no purchase wording anywhere in the app; the row simply opens
 * the portal. `iap` waits for the purchase library to come back (F-060/F-061).
 *
 * Pure, so every gate is tested without a device.
 */
export type PitWallMode = 'open' | 'iap' | 'off';
export type StorePlatform = 'android' | 'ios' | 'amazon';

export interface PitWallSurface {
  mode: Exclude<PitWallMode, 'off'>;
  url: string;
  label: string;
  /** right-hand text for someone without a pass */
  free: string;
  /** right-hand text for a pass holder, before the expiry is appended */
  pass: string;
}

export interface Viewer {
  uid: string | null;
  leagueId: string | null;
  /** the running app's version, e.g. "2.3.4" */
  appVersion: string | null;
}

const DEFAULT_URL = 'https://pitwall.humannpc.com';
const str = (v: unknown, d: string): string => (typeof v === 'string' && v.trim() !== '' ? v : d);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Compare dotted versions numerically: "2.10.0" is above "2.9.0", which a string compare gets wrong. */
export function versionBelow(version: string | null, min: string | null): boolean {
  if (!min) return false;
  if (!version) return true;
  const a = version.split('.').map((n) => parseInt(n, 10) || 0);
  const b = min.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/**
 * The profile surface to render, or null for none. Only `https` addresses are accepted: the block
 * is admin-written, but it drives an external browser open, so it is not worth trusting blindly.
 */
export function pitWallSurface(raw: unknown, platform: StorePlatform, viewer: Viewer): PitWallSurface | null {
  if (!raw || typeof raw !== 'object') return null;
  const cfg = raw as Record<string, unknown>;
  if (cfg.enabled !== true) return null;
  if (versionBelow(viewer.appVersion, typeof cfg.minAppVersion === 'string' ? cfg.minAppVersion : null)) return null;

  const surfaces = (cfg.surfaces && typeof cfg.surfaces === 'object' ? cfg.surfaces : {}) as Record<string, unknown>;
  if (surfaces.profile === false) return null;

  // While a beta list is set, only those users and leagues see anything.
  const beta = (cfg.beta && typeof cfg.beta === 'object' ? cfg.beta : {}) as Record<string, unknown>;
  const uids = list(beta.uids), leagueIds = list(beta.leagueIds);
  if (uids.length > 0 || leagueIds.length > 0) {
    const allowed = (viewer.uid !== null && uids.includes(viewer.uid)) || (viewer.leagueId !== null && leagueIds.includes(viewer.leagueId));
    if (!allowed) return null;
  }

  const modes = (cfg.mode && typeof cfg.mode === 'object' ? cfg.mode : {}) as Record<string, unknown>;
  const mode = str(modes[platform], 'off');
  if (mode !== 'open' && mode !== 'iap') return null;

  const url = str(cfg.url, DEFAULT_URL);
  if (!url.startsWith('https://')) return null;

  const row = (cfg.profileRow && typeof cfg.profileRow === 'object' ? cfg.profileRow : {}) as Record<string, unknown>;
  return {
    mode,
    url,
    label: str(row.label, 'PIT WALL'),
    free: str(row.free, 'Open'),
    pass: str(row.pass, 'Pass'),
  };
}
