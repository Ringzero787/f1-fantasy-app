// node --test scripts/ops/*.test.js — parameter validation for the aidlc op helpers.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validFirestorePath, withinRoots, validScriptName } = require('./_paths');

test('Firestore paths: plain segments only', () => {
  assert.ok(validFirestorePath('ben_lines/madrid_2026_race'));
  assert.ok(validFirestorePath('fantasyTeams'));
  for (const bad of ['', '/abs', 'a//b', 'a/../b', 'a/./b', "a/b'c", 'a/b c', 'a;rm', 'a/$HOME']) {
    assert.equal(validFirestorePath(bad), false, bad);
  }
});

test('restore allowlist: a document must sit under a declared root', () => {
  const roots = ['ben_lines/madrid_2026_race', 'fantasyTeams'];
  assert.ok(withinRoots('ben_lines/madrid_2026_race', roots));
  assert.ok(withinRoots('fantasyTeams/abc', roots));
  assert.equal(withinRoots('ben_lines/madrid_2026_race_x', roots), false);
  assert.equal(withinRoots('users/abc', roots), false);
});

test('script names: a plain file in the scripts folder', () => {
  assert.ok(validScriptName('repairStuckLocks.js'));
  assert.ok(validScriptName('seed-v2.mjs'));
  for (const bad of ['../x.js', '/tmp/x.js', 'x.sh', '.hidden.js', 'a b.js', "x';rm.js", 'dir/x.js']) {
    assert.equal(validScriptName(bad), false, bad);
  }
});
