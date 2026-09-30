/**
 * The runtime version decides which native binary an over-the-air JavaScript bundle may be loaded
 * into. It was the fixed string "1.0.0" for four Expo SDKs, so a bundle published in March 2026 was
 * still being served to every build — which downgraded 2.3.x users silently for six months and
 * aborted 2.4.0 half a second into launch, and is what Apple rejected build 43 for.
 *
 * It has been reverted to a fixed string once already, during an SDK upgrade. This test is the
 * guard: a fixed value means old bundles can reach new binaries, so it has to be a policy.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const config = require(path.join(__dirname, '..', '..', 'app.config.js'));
const expo = config.expo ?? config;

test('the OTA runtime version is a policy, never a fixed string', () => {
  const rv = expo.runtimeVersion;
  assert.equal(typeof rv, 'object', `runtimeVersion must be a policy, got ${JSON.stringify(rv)} — a fixed value lets a bundle built for an older native runtime load into this one`);
  assert.ok(rv && typeof rv.policy === 'string', 'runtimeVersion needs a policy');
  // appVersion, not fingerprint: the two store binaries are built on different hosts (gradle on the
  // Linux box, xcodebuild on the Mac Mini) and a fingerprint is sensitive to that difference.
  assert.equal(rv.policy, 'appVersion');
});

test('an update url without a runtime policy would be the same trap, so they are checked together', () => {
  if (!expo.updates?.url) return;   // no OTA configured at all is safe
  assert.equal(typeof expo.runtimeVersion, 'object', 'an updates.url with a fixed runtimeVersion serves old bundles to new binaries');
});
