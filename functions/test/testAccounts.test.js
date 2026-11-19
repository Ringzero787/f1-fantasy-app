// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// F-164: the test-account classifier. A wrong "yes" hides a real player from the counts, so every
// rule is pinned from both sides.
const test = require('node:test');
const assert = require('node:assert/strict');
const { testAccountReason, RETURNED_AFTER_MS } = require('../lib/users/testAccounts.js');

const T0 = Date.UTC(2026, 9, 1);
const acct = (o) => ({ email: 'miraweber.40417@gmail.com', displayName: 'Mira Weber', createdMs: T0, lastActiveMs: T0 + 3600e3, ...o });

test('a tester-farm account: display name run together + .NNNNN at gmail, gone within a day', () => {
  assert.equal(testAccountReason(acct({})), 'tester-farm');
  assert.equal(testAccountReason(acct({ email: 'MiraWeber.40417@Gmail.com ' })), 'tester-farm');
  assert.equal(testAccountReason(acct({ displayName: 'Mira  Weber-' })), 'tester-farm');
});

test('the address must be the whole display name, nothing more or less', () => {
  assert.equal(testAccountReason(acct({ displayName: 'Mira' })), null);
  assert.equal(testAccountReason(acct({ displayName: 'Mira Weber Jr' })), null);
  assert.equal(testAccountReason(acct({ displayName: 'Jonas Weber' })), null);
  assert.equal(testAccountReason(acct({ displayName: '' })), null);
});

test('anyone who came back a day later is a player, whatever the address', () => {
  assert.equal(testAccountReason(acct({ lastActiveMs: T0 + RETURNED_AFTER_MS })), null);
  assert.equal(testAccountReason(acct({ email: 'x@amazon.com', lastActiveMs: T0 + 2 * RETURNED_AFTER_MS })), null);
  assert.equal(testAccountReason(acct({ email: 'x@cloudtestlabaccounts.com', lastActiveMs: T0 + 2 * RETURNED_AFTER_MS })), null);
});

test('other digit counts, separators and domains are not the farm shape', () => {
  for (const email of ['miraweber.4041@gmail.com', 'miraweber.404170@gmail.com', 'miraweber40417@gmail.com', 'mira.weber.40417@gmail.com', 'miraweber_40417@gmail.com', 'miraweber.40417@outlook.com', 'miraweber.40417@googlemail.com']) {
    assert.equal(testAccountReason(acct({ email })), null, email);
  }
});

test('Google test lab and Amazon reviewers', () => {
  assert.equal(testAccountReason(acct({ email: 'robot-1@cloudtestlabaccounts.com' })), 'test-lab');
  assert.equal(testAccountReason(acct({ email: 'reviewer@amazon.com' })), 'store-reviewer');
});

test('unknown times or no address: never marked', () => {
  assert.equal(testAccountReason(acct({ createdMs: 0 })), null);
  assert.equal(testAccountReason(acct({ lastActiveMs: 0 })), null);
  assert.equal(testAccountReason(acct({ lastActiveMs: T0 - 1 })), null);
  assert.equal(testAccountReason(acct({ email: null })), null);
  assert.equal(testAccountReason(acct({ email: '@gmail.com' })), null);
});
