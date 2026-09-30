/**
 * The runtime version decides which native binary an over-the-air JavaScript bundle may be loaded
 * into. It was the fixed string "1.0.0" for four Expo SDKs, so a bundle published in March 2026 was
 * still being served to every build, which downgraded 2.3.x users silently for six months.
 *
 * It has been reverted to a fixed string once already, during an SDK upgrade. This test is the
 * guard: a fixed value means old bundles can reach new binaries, so it has to be a policy.
 */
import path from 'path';

const config = require(path.join(__dirname, '..', '..', 'app.config.js'));
const expo = config.expo ?? config;

describe('OTA runtime version', () => {
  it('is a policy, never a fixed string', () => {
    const rv = expo.runtimeVersion;
    expect(typeof rv).toBe('object');
    expect(typeof rv?.policy).toBe('string');
    // appVersion, not fingerprint: the two store binaries are built on different hosts (gradle on
    // the Linux box, xcodebuild on the Mac Mini) and a fingerprint is sensitive to that difference.
    expect(rv.policy).toBe('appVersion');
  });

  it('is checked together with the update url, since one without the other is the same trap', () => {
    if (!expo.updates?.url) return; // no OTA configured at all is safe
    expect(typeof expo.runtimeVersion).toBe('object');
  });
});
