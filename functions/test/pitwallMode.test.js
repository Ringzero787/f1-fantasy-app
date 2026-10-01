/**
 * The Pit Wall mode decision (F-077).
 *
 * This is a production switch with no build behind it: the value written here decides whether the
 * app sells the pass in-store or sends the player to the portal, and it reaches every installed
 * 2.4.0 client within a read. It had no test at all, so a slip in the flag precedence would ship
 * silently — which matters most for `--mode=off`, the kill switch.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { DESIRED, PLATFORMS, resolveMode, invalidPlatform, carryContainment, invalidEnabled, unknownFlag, modeChanges } = require('../scripts/lib/pitwallMode');

test('with no flags, the committed production state is what gets written', () => {
  assert.deepEqual(resolveMode([]), { android: 'iap', ios: 'iap', amazon: 'open' });
});

test('iOS and Android sell in-app, Amazon does not: the decision this file records', () => {
  assert.equal(DESIRED.ios, 'iap');
  assert.equal(DESIRED.android, 'iap');
  // Amazon has no store product yet, and `iap` without one is an error at the payment sheet.
  assert.equal(DESIRED.amazon, 'open');
});

test('--mode=off still turns every platform off: this is the kill switch', () => {
  assert.deepEqual(resolveMode(['--mode=off']), { android: 'off', ios: 'off', amazon: 'off' });
});

test('--mode sets all three, and a per-platform flag beats it', () => {
  assert.deepEqual(resolveMode(['--mode=iap']), { android: 'iap', ios: 'iap', amazon: 'iap' });
  assert.deepEqual(resolveMode(['--mode=iap', '--amazon=off']), { android: 'iap', ios: 'iap', amazon: 'off' });
});

test('a per-platform flag beats the desired state without disturbing the others', () => {
  assert.deepEqual(resolveMode(['--ios=open']), { android: 'iap', ios: 'open', amazon: 'open' });
  assert.deepEqual(resolveMode(['--android=off']), { android: 'off', ios: 'iap', amazon: 'open' });
});

test('an empty --mode= is rejected rather than falling through to the desired state', () => {
  // `??` and not `||`: an empty string must reach the validator. With `||` this would silently
  // write the production defaults when the operator meant to pass something and fumbled it.
  const mode = resolveMode(['--mode=']);
  assert.equal(mode.ios, '');
  assert.equal(invalidPlatform(mode), 'android');
});

test('invalidPlatform names the offender and passes a good set', () => {
  assert.equal(invalidPlatform({ android: 'open', ios: 'iap', amazon: 'off' }), null);
  assert.equal(invalidPlatform({ android: 'open', ios: 'sell', amazon: 'off' }), 'ios');
});

test('every platform the app knows about has a desired state', () => {
  assert.deepEqual(PLATFORMS.sort(), ['amazon', 'android', 'ios']);
  for (const p of PLATFORMS) assert.ok(DESIRED[p], `${p} has no desired mode`);
});

test('a flagless run keeps the live kill switch and allowlist rather than resetting them', () => {
  const live = { enabled: false, beta: { uids: ['u1', 'u2'], leagueIds: ['l1'] } };
  assert.deepEqual(carryContainment(live, []), { enabled: false, beta: { uids: ['u1', 'u2'], leagueIds: ['l1'] } });
});

test('a flag still overrides each of them', () => {
  const live = { enabled: false, beta: { uids: ['u1'], leagueIds: [] } };
  assert.equal(carryContainment(live, ['--enabled=true']).enabled, true);
  assert.deepEqual(carryContainment(live, ['--beta=']).beta, { uids: [], leagueIds: [] });
  assert.deepEqual(carryContainment(live, ['--beta=a,b']).beta, { uids: ['a', 'b'], leagueIds: [] });
});

test('a document with no pitwall block yet reads as on and unrestricted', () => {
  assert.deepEqual(carryContainment({}, []), { enabled: true, beta: { uids: [], leagueIds: [] } });
  assert.deepEqual(carryContainment(undefined, []), { enabled: true, beta: { uids: [], leagueIds: [] } });
});

test('the carried allowlist is a copy, so the live document cannot be mutated through it', () => {
  const live = { beta: { uids: ['u1'], leagueIds: [] } };
  carryContainment(live, []).beta.uids.push('u2');
  assert.deepEqual(live.beta.uids, ['u1']);
});

test('a flag it does not understand stops the run instead of falling through to the defaults', () => {
  // The fall-through now means "iOS sells the pass", so a fumbled kill switch must not reach it.
  assert.equal(unknownFlag(['--mode', 'off']), '--mode');
  assert.equal(unknownFlag(['--ois=off']), '--ois=off');
  assert.equal(unknownFlag(['off']), 'off');
  assert.equal(unknownFlag(['--mode=off', '--apply']), null);
  assert.equal(unknownFlag([]), null);
});

test('--enabled takes a boolean and nothing else', () => {
  assert.equal(invalidEnabled(['--enabled=yes']), 'yes');
  assert.equal(invalidEnabled(['--enabled=1']), '1');
  assert.equal(invalidEnabled(['--enabled=true']), null);
  assert.equal(invalidEnabled(['--enabled=false']), null);
  assert.equal(invalidEnabled([]), null);
});

test('clearing one allowlist leaves the other alone', () => {
  const live = { beta: { uids: ['u1'], leagueIds: ['l1'] } };
  assert.deepEqual(carryContainment(live, ['--beta=']).beta, { uids: [], leagueIds: ['l1'] });
  assert.deepEqual(carryContainment(live, ['--betaLeagues=']).beta, { uids: ['u1'], leagueIds: [] });
});

test('a null or malformed live document does not throw', () => {
  assert.deepEqual(carryContainment(null, []), { enabled: true, beta: { uids: [], leagueIds: [] } });
  assert.deepEqual(carryContainment('nonsense', []), { enabled: true, beta: { uids: [], leagueIds: [] } });
  assert.deepEqual(carryContainment({ beta: 'nope' }, []), { enabled: true, beta: { uids: [], leagueIds: [] } });
  assert.deepEqual(carryContainment({ beta: { uids: 'u1' } }, []).beta.uids, []);
});

test('a mode the run reverts is reported, because modes are asserted and not carried', () => {
  const live = { mode: { android: 'open', ios: 'off', amazon: 'open' } };
  assert.deepEqual(modeChanges(live, { android: 'open', ios: 'iap', amazon: 'open' }), [{ platform: 'ios', from: 'off', to: 'iap' }]);
  assert.deepEqual(modeChanges(live, { android: 'open', ios: 'off', amazon: 'open' }), []);
  assert.deepEqual(modeChanges(null, { android: 'open', ios: 'iap', amazon: 'open' }), []);
});

test('a platform the live document turned off stays off through a flagless run', () => {
  // `off` is a containment control like enabled and the allowlists. Asserting DESIRED over it would
  // mean a routine run for another platform silently re-opened a paid surface someone shut down.
  const live = { mode: { android: 'open', ios: 'off', amazon: 'open' } };
  assert.equal(resolveMode([], DESIRED, live).ios, 'off');
  assert.equal(resolveMode(['--android=iap'], DESIRED, live).ios, 'off');
  // and for Android too, which is the platform now carrying a purchase and so the one most likely
  // to be killed in a hurry
  const androidKilled = { mode: { android: 'off', ios: 'iap', amazon: 'open' } };
  assert.equal(resolveMode([], DESIRED, androidKilled).android, 'off');
  assert.equal(resolveMode(['--ios=open'], DESIRED, androidKilled).android, 'off');
});

test('turning a killed platform back on is deliberate', () => {
  const live = { mode: { android: 'open', ios: 'off', amazon: 'open' } };
  assert.equal(resolveMode(['--ios=iap'], DESIRED, live).ios, 'iap');
  assert.equal(resolveMode(['--mode=open'], DESIRED, live).ios, 'open');
});

test('with no live document the desired state still applies', () => {
  assert.deepEqual(resolveMode([], DESIRED, null), DESIRED);
  assert.deepEqual(resolveMode([], DESIRED, {}), DESIRED);
  assert.equal(resolveMode([], DESIRED, { mode: { ios: 'open' } }).ios, 'iap');
  assert.equal(resolveMode([], DESIRED, { mode: { android: 'open' } }).android, 'iap');
});
