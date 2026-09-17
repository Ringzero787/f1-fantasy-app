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

// F-047: the app may read pack prices from config, but the server re-checks the
// real price in tlBuyCosmeticPack. A config price that disagrees would quote a
// player one number and charge another, so they must never drift apart.
// Loads the server's authoritative price table from the compiled functions.
// buyCosmeticPack touches Firebase at module scope, so admin must be
// initialised first (same pattern as test/settlement.test.js). Returns null
// ONLY when lib/ isn't built; if it exists but won't load, that's a failure,
// not a skip — otherwise this test passes while comparing nothing.
function loadServerPrices() {
  const fs = require('node:fs');
  const path = require('node:path');
  const lib = path.join(__dirname, '..', 'lib', 'purchases', 'buyCosmeticPack.js');
  if (!fs.existsSync(lib)) return null; // not built yet
  const admin = require('../node_modules/firebase-admin');
  if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tracklimits-test' });
  const { PACK_PRICES_GAME_CASH } = require(lib);
  assert.ok(
    PACK_PRICES_GAME_CASH && Object.keys(PACK_PRICES_GAME_CASH).length > 0,
    'compiled buyCosmeticPack exports no PACK_PRICES_GAME_CASH — the drift check would be silently vacuous'
  );
  return PACK_PRICES_GAME_CASH;
}

// F-047: the app may read pack prices from config, but the server re-checks the
// real price in tlBuyCosmeticPack. A config price that disagrees would quote a
// player one number and charge another, so they must never drift apart.
test('any packPrices in DESIRED match the server-authoritative table', () => {
  const server = loadServerPrices();
  if (!server) return; // lib/ not built; the hygiene command builds first.
  const prices = DESIRED.packPrices;
  if (!prices) return; // config carries no price overrides — bundled table wins.
  for (const [packId, price] of Object.entries(prices)) {
    const entry = server[packId];
    assert.ok(entry, `config prices unknown pack "${packId}" — the server would reject it`);
    assert.equal(
      price,
      entry.price,
      `pack "${packId}": config says ${price}, server charges ${entry.price}`
    );
  }
});

// Proves the comparison itself works, independently of whether DESIRED
// currently carries any overrides — so this file can't rot into a no-op.
test('the price-drift comparison catches a mismatch and an unknown pack', () => {
  const server = loadServerPrices();
  if (!server) return;
  const [knownPack, entry] = Object.entries(server)[0];
  const check = (prices) => {
    for (const [packId, price] of Object.entries(prices)) {
      const e = server[packId];
      assert.ok(e, `unknown pack "${packId}"`);
      assert.equal(price, e.price, `pack "${packId}" mismatch`);
    }
  };
  // Correct price passes.
  check({ [knownPack]: entry.price });
  // Wrong price and unknown pack both throw.
  assert.throws(() => check({ [knownPack]: entry.price + 1 }), /mismatch/);
  assert.throws(() => check({ no_such_pack: 75 }), /unknown pack/);
});
