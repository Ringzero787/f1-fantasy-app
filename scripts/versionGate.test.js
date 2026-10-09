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
  // Amazon has no API, so the live set cannot be queried; it is declared in the script's header
  // instead, and this test ties the floor to that declaration. Raising the floor therefore forces
  // whoever raises it to restate what is live.
  const src = read('functions/scripts/setAppVersionGate.js');
  const floor = src.match(/minVersion:\s*'(\d+\.\d+\.\d+)'/)[1];
  const line = src.match(/Known live at \d{4}-\d{2}-\d{2}:([^\n]*(?:\n\/\/[^\n]*)?)/);
  assert.ok(line, 'the header must carry a "Known live at <date>: ..." line naming all three stores');
  const declared = line[1].match(/\d+\.\d+\.\d+/g) || [];
  assert.ok(declared.length >= 3,
    `the live line must name a version for Play, the App Store and Amazon (found ${declared.length})`);
  const oldest = declared.map(semver).sort((a, b) => (lte(a, b) ? -1 : 1))[0];
  assert.ok(lte(semver(floor), oldest),
    `floor ${floor} is above the oldest live store (${oldest.join('.')}) — those users would be `
    + 'blocked with no way to update, Amazon users to a store they cannot open');
});
