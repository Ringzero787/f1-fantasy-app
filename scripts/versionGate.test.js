// The app-version floor the gate script would write can never be above the version this
// checkout ships: config/app.minVersion hard-blocks every device below it with no dismiss, so a
// floor above the current build would lock every player out until a rollback op (F-112).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const semver = (s) => s.split('.').map((n) => parseInt(n, 10));
const lte = (a, b) => { for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] < b[i]; } return true; };

test('setAppVersionGate.js: DESIRED.minVersion is a full version no newer than app.config.js ships', () => {
  const floor = read('functions/scripts/setAppVersionGate.js').match(/minVersion:\s*'(\d+\.\d+\.\d+)'/);
  assert.ok(floor, 'DESIRED.minVersion must be MAJOR.MINOR.PATCH');
  const shipping = read('app.config.js').match(/^\s*version:\s*"(\d+\.\d+\.\d+)"/m);
  assert.ok(shipping, 'app.config.js version not found');
  assert.ok(lte(semver(floor[1]), semver(shipping[1])), `floor ${floor[1]} is above the shipping version ${shipping[1]}`);
});

test('setAppVersionGate.js: the floor is not above the OLDEST store that is live', () => {
  // The shipping-version check above is necessary but not sufficient: it compares the floor to what
  // this checkout BUILDS, while the floor blocks what users have INSTALLED, store by store. A floor
  // above the oldest live store hard-blocks those users — and on Amazon they cannot even reach
  // their own store, because AppUpdateGate.openStore has no Amazon branch and opens the Play url.
  //
  // Amazon has no API, so the live set is declared by hand in KNOWN_LIVE. It is read here as
  // STRUCTURED DATA, per store. An earlier version of this test scraped the script's header prose
  // for version-shaped substrings, which could be made to pass vacuously: mention the floor near
  // the declaration and it becomes its own "oldest live store".
  const gate = require('../functions/scripts/setAppVersionGate.js');
  for (const store of gate.STORES) {
    assert.match(gate.KNOWN_LIVE[store] ?? '', /^\d+\.\d+\.\d+$/,
      `KNOWN_LIVE.${store} must be the version live in that store`);
  }
  assert.match(gate.KNOWN_LIVE.asOf ?? '', /^\d{4}-\d{2}-\d{2}$/, 'KNOWN_LIVE.asOf must be a date');
  const floor = read('functions/scripts/setAppVersionGate.js').match(/minVersion:\s*'(\d+\.\d+\.\d+)'/)[1];
  assert.ok(lte(semver(floor), gate.oldestLive()),
    `floor ${floor} is above the oldest live store (${gate.oldestLive().join('.')}) — those users `
    + 'would be blocked with no way to update, Amazon users to a store they cannot open');
});

test('setAppVersionGate.js: the script itself refuses a floor that locks a store out', () => {
  // Not only the test: the op applies by running this script, so the refusal has to live in the
  // script or a hand run with --minVersion walks straight past it.
  const gate = require('../functions/scripts/setAppVersionGate.js');
  const oldest = gate.oldestLive().join('.');
  const above = [...gate.oldestLive()];
  above[2] += 1;
  const run = (floor) => {
    const r = require('node:child_process').spawnSync(process.execPath,
      [path.join(ROOT, 'functions/scripts/setAppVersionGate.js'), `--minVersion=${floor}`],
      { encoding: 'utf8', env: { ...process.env, SA_KEY: '' } });
    return { code: r.status, err: (r.stderr || '') + (r.stdout || '') };
  };
  const bad = run(above.join('.'));
  assert.equal(bad.code, 2, 'a floor above the oldest live store must refuse');
  assert.match(bad.err, /Refusing to write minVersion/);
  assert.match(bad.err, new RegExp(`oldest live store is ${oldest.replace(/\./g, '\\.')}`));
  // And it refuses BEFORE connecting: no SA_KEY is set, so a script that got as far as initAdmin
  // would complain about the key instead.
  assert.doesNotMatch(bad.err, /SA_KEY must point at/,
    'the lockout refusal must happen before initAdmin, so it cannot be skipped by a missing key');
});
