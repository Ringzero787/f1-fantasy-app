// node --test newgame/functions/scripts/ — remote-config merge, diff and the
// version-floor guard. No Firestore.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DESIRED, CURRENT_SHIPPED_VC, mergeConfig, diffConfig, blocksVersion } = require('./setAppConfig');

test('the shipped DESIRED config is inert: it arms the lever without using it', () => {
  // A falsy floor means AppConfigGate never blocks, whatever the running build.
  assert.equal(DESIRED.minSupportedVersionCode, 0);
  assert.equal(blocksVersion(DESIRED, CURRENT_SHIPPED_VC), false);
  assert.equal(blocksVersion(DESIRED, 1), false);
  // The notice banner is off, so creating the doc changes nothing players see.
  assert.equal(DESIRED.notice.enabled, false);
  // World-readable doc: no secrets, ever.
  assert.deepEqual(DESIRED.features, {});
});

test('blocksVersion: only a positive floor above the running build blocks it', () => {
  assert.equal(blocksVersion({ minSupportedVersionCode: 46 }, 45), true);
  assert.equal(blocksVersion({ minSupportedVersionCode: 45 }, 45), false);
  assert.equal(blocksVersion({ minSupportedVersionCode: 44 }, 45), false);
  // 0, missing, or a non-number never blocks — the gate must fail open.
  assert.equal(blocksVersion({ minSupportedVersionCode: 0 }, 45), false);
  assert.equal(blocksVersion({}, 45), false);
  assert.equal(blocksVersion(null, 45), false);
  assert.equal(blocksVersion({ minSupportedVersionCode: '46' }, 45), false);
  assert.equal(blocksVersion({ minSupportedVersionCode: 46 }, null), false);
});

test('mergeConfig deep-merges objects and replaces scalars', () => {
  const current = { minSupportedVersionCode: 0, notice: { enabled: true, title: 'old', id: 'a' }, features: { x: true } };
  const merged = mergeConfig(current, { notice: { enabled: false, title: 'new' }, features: { y: false } });
  // Nested keys not mentioned survive.
  assert.equal(merged.notice.id, 'a');
  assert.equal(merged.notice.enabled, false);
  assert.equal(merged.notice.title, 'new');
  // Sibling top-level keys survive.
  assert.equal(merged.minSupportedVersionCode, 0);
  assert.deepEqual(merged.features, { x: true, y: false });
});

test('mergeConfig handles a missing document', () => {
  assert.deepEqual(mergeConfig({}, DESIRED), DESIRED);
  assert.deepEqual(mergeConfig(null, { a: 1 }), { a: 1 });
  assert.deepEqual(mergeConfig(undefined, { a: { b: 2 } }), { a: { b: 2 } });
});

test('mergeConfig replaces arrays wholesale rather than merging them', () => {
  assert.deepEqual(mergeConfig({ xs: [1, 2, 3] }, { xs: [9] }), { xs: [9] });
});

test('diffConfig reports leaf changes with dotted paths', () => {
  const changes = diffConfig({ notice: { enabled: true, id: 'a' } }, { notice: { enabled: false, id: 'a' } });
  assert.deepEqual(changes, [{ path: 'notice.enabled', from: true, to: false }]);
});

test('diffConfig on a missing document reports every desired leaf as new', () => {
  const changes = diffConfig({}, DESIRED);
  const paths = changes.map((c) => c.path);
  assert.ok(paths.includes('minSupportedVersionCode'));
  assert.ok(paths.includes('notice.enabled'));
  assert.ok(paths.includes('updateUrl'));
  // features is an empty object, so it contributes no leaves.
  assert.ok(!paths.some((p) => p.startsWith('features.')));
  assert.ok(changes.every((c) => c.from === undefined));
});

test('diffConfig is empty when the doc already matches', () => {
  assert.deepEqual(diffConfig(DESIRED, DESIRED), []);
  assert.deepEqual(diffConfig(mergeConfig({}, DESIRED), DESIRED), []);
});
