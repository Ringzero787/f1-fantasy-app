// tlCommitRoll: the starting bankroll is a server constant; the client cannot dictate it (PR #47, G06-001).
// Run: npm --prefix newgame/functions run build && node --test newgame/functions/test/*.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tracklimits-test' });
const garage = require('../lib/economy/garageCallables.js');

test('ROLL_STARTING_CASH is the server-owned opening bankroll', () => {
  assert.equal(garage.ROLL_STARTING_CASH, 100);
  assert.equal(typeof garage.tlCommitRoll, 'function');
});

test('tlCommitRoll never reads a cash amount from the client payload', () => {
  // Guard against reintroducing client-dictated balances: the compiled handler must only consume the hand
  // (driverIds/constructorIds) and must fund the garage from ROLL_STARTING_CASH.
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'economy', 'garageCallables.js'), 'utf8');
  // The compiled file hoists `exports.a = exports.b = ... = void 0;` at the top; the definition is the onCall assignment.
  const start = src.indexOf('exports.tlCommitRoll = functions.https.onCall(');
  assert.ok(start >= 0, 'tlCommitRoll definition not found in compiled output');
  const next = src.indexOf(' = functions.https.onCall(', start + 'exports.tlCommitRoll = functions.https.onCall('.length);
  const handler = src.slice(start, next === -1 ? undefined : src.lastIndexOf('\nexports.', next));
  assert.doesNotMatch(handler, /data\??\.\s*(cash|cashRemaining|startingCash|balance|bankroll)/, 'handler reads a cash field from client data');
  assert.match(handler, /ROLL_STARTING_CASH/, 'handler must fund the garage from ROLL_STARTING_CASH');
  assert.match(handler, /data\??\.driverIds/);
  assert.match(handler, /data\??\.constructorIds/);
});
