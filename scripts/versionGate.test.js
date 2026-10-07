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
