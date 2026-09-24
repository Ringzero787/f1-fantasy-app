import { pitWallSurface, versionBelow } from '../../src/pitwall/config';

const VIEWER = { uid: 'u1', leagueId: 'L1', appVersion: '2.4.0' };
const BLOCK = {
  enabled: true,
  url: 'https://pitwall.humannpc.com',
  minAppVersion: '2.4.0',
  profileRow: { label: 'PIT WALL', free: 'Open', pass: 'Pass' },
  mode: { android: 'open', ios: 'open', amazon: 'open' },
  surfaces: { profile: true },
};

describe('pitWallSurface', () => {
  it('renders nothing at all unless the server says so', () => {
    expect(pitWallSurface(undefined, 'android', VIEWER)).toBeNull();
    expect(pitWallSurface(null, 'android', VIEWER)).toBeNull();
    expect(pitWallSurface({}, 'android', VIEWER)).toBeNull();
    expect(pitWallSurface({ ...BLOCK, enabled: false }, 'android', VIEWER)).toBeNull();
    expect(pitWallSurface({ ...BLOCK, surfaces: { profile: false } }, 'android', VIEWER)).toBeNull();
  });

  it('is per platform, because the store rules on linking out differ', () => {
    const block = { ...BLOCK, mode: { android: 'open', ios: 'off', amazon: 'open' } };
    expect(pitWallSurface(block, 'android', VIEWER)?.mode).toBe('open');
    expect(pitWallSurface(block, 'amazon', VIEWER)?.mode).toBe('open');
    expect(pitWallSurface(block, 'ios', VIEWER)).toBeNull();
    // an unknown or missing mode is off, not open
    expect(pitWallSurface({ ...BLOCK, mode: {} }, 'ios', VIEWER)).toBeNull();
    expect(pitWallSurface({ ...BLOCK, mode: { ios: 'maybe' } }, 'ios', VIEWER)).toBeNull();
  });

  it('limits the surface to the beta list while one is set', () => {
    const beta = { ...BLOCK, beta: { uids: ['someone-else'], leagueIds: [] } };
    expect(pitWallSurface(beta, 'android', VIEWER)).toBeNull();
    expect(pitWallSurface(beta, 'android', { ...VIEWER, uid: 'someone-else' })).not.toBeNull();
    // a member of a listed league gets in too
    const byLeague = { ...BLOCK, beta: { uids: [], leagueIds: ['L1'] } };
    expect(pitWallSurface(byLeague, 'android', VIEWER)).not.toBeNull();
    expect(pitWallSurface(byLeague, 'android', { ...VIEWER, leagueId: 'other' })).toBeNull();
  });

  it('hides the surface on a build too old for it', () => {
    expect(pitWallSurface(BLOCK, 'android', { ...VIEWER, appVersion: '2.3.4' })).toBeNull();
    expect(pitWallSurface(BLOCK, 'android', { ...VIEWER, appVersion: null })).toBeNull();
    expect(pitWallSurface(BLOCK, 'android', { ...VIEWER, appVersion: '2.10.0' })).not.toBeNull();
  });

  it('refuses an address that is not https, since it opens an external browser', () => {
    expect(pitWallSurface({ ...BLOCK, url: 'http://pitwall.humannpc.com' }, 'android', VIEWER)).toBeNull();
    expect(pitWallSurface({ ...BLOCK, url: 'javascript:alert(1)' }, 'android', VIEWER)).toBeNull();
  });

  it('falls back to sane copy when the block omits it', () => {
    expect(pitWallSurface({ ...BLOCK, profileRow: undefined }, 'android', VIEWER)).toEqual({
      mode: 'open', url: 'https://pitwall.humannpc.com', label: 'PIT WALL', free: 'Open', pass: 'Pass',
    });
  });
});

describe('versionBelow', () => {
  it('compares each part as a number', () => {
    expect(versionBelow('2.9.0', '2.10.0')).toBe(true);
    expect(versionBelow('2.10.0', '2.9.0')).toBe(false);
    expect(versionBelow('2.4.0', '2.4.0')).toBe(false);
    expect(versionBelow('2.4', '2.4.1')).toBe(true);
  });

  it('is off when no minimum is set', () => {
    expect(versionBelow('1.0.0', null)).toBe(false);
    expect(versionBelow(null, null)).toBe(false);
  });
});

describe('isPortalUrl', () => {
  const { isPortalUrl } = require('../../src/pitwall/config');

  it('accepts only the known portal hosts, because the link carries a sign-in code', () => {
    expect(isPortalUrl('https://pitwall.humannpc.com')).toBe(true);
    expect(isPortalUrl('https://undercut-pitwall.pages.dev/h#abc')).toBe(true);
    expect(isPortalUrl('https://evil.example.com')).toBe(false);
    expect(isPortalUrl('http://pitwall.humannpc.com')).toBe(false);
    // a host that merely ends with the real one, or hides it in userinfo or a path
    expect(isPortalUrl('https://pitwall.humannpc.com.evil.example')).toBe(false);
    expect(isPortalUrl('https://evil.example/pitwall.humannpc.com')).toBe(false);
    expect(isPortalUrl('https://evil.example#pitwall.humannpc.com')).toBe(false);
  });
});
