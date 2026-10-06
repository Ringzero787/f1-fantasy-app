// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// F-104. `db.collection('leagues').doc(id)` throws SYNCHRONOUSLY on an id with a slash, a bare
// `.`/`..`, or a reserved `__…__` name — and `fantasyTeams.leagueId` is client-supplied. One
// unusable value rejects every autoLockTeams run (no lineup lock, no ace freeze, for everyone)
// and aborts the league sync in calculatePoints.
//
// firestore.rules cannot call this helper, so the expression exists twice. The pattern string is
// pinned here so the two cannot drift silently; the rules side is covered by the emulator suite
// in rules-tests/firestore.rules.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isUsableLeagueId, LEAGUE_ID_PATTERN, LEAGUE_ID_MAX } = require('../lib/utils/leagueId.js');

test('the pattern and bound match the ones firestore.rules carries', () => {
  // If you change either, change `usableLeagueId` in firestore.rules in the same commit.
  assert.equal(LEAGUE_ID_PATTERN, '^[A-Za-z0-9][A-Za-z0-9_-]*$');
  assert.equal(LEAGUE_ID_MAX, 64);
});

test('null and absent are a solo team, not an error', () => {
  assert.equal(isUsableLeagueId(null), true);
  assert.equal(isUsableLeagueId(undefined), true);
});

test('the shapes production actually holds', () => {
  assert.equal(isUsableLeagueId('aBc123XyZ0aBc123XyZ0'), true); // a Firestore auto-id
  assert.equal(isUsableLeagueId('L1'), true);
  assert.equal(isUsableLeagueId('a-b_c'), true);
  assert.equal(isUsableLeagueId('0abc'), true);
  assert.equal(isUsableLeagueId('a'.repeat(64)), true);
});

test('every shape doc() rejects', () => {
  for (const bad of [
    'a/b',              // the one that stops the sweep for everybody
    '../leagues/L1',    // escapes the collection
    '',
    '.',
    '..',
    '__proto__',        // Firestore reserves __…__
    '__name__',
    '_leading',
    'L1\n',             // RE2's $ is end-of-text, so this must not slip through
    'L 1',
    'L\t1',
    'a.b',
    'aé',
    'ａ１',             // fullwidth
    'a​b',         // zero-width space
    'a%2Fb',
    'a'.repeat(65),
  ]) {
    assert.equal(isUsableLeagueId(bad), false, `expected ${JSON.stringify(bad)} to be refused`);
  }
});

test('anything that is not a string', () => {
  for (const bad of [42, true, false, [], ['L1'], { id: 'L1' }, 0, NaN]) {
    assert.equal(isUsableLeagueId(bad), false, `expected ${JSON.stringify(bad)} to be refused`);
  }
});

test('createTeamSecure validates it, because the Admin SDK never runs the rules', () => {
  // The callable writes with the Admin SDK, so usableLeagueId in firestore.rules does not apply.
  // Before this guard the callable was a way straight back to the hole the rule closes — found by
  // the security review of the rules-only fix, not by the rules tests, which cannot see it.
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'teams', 'teamOperations.ts'), 'utf8');
  const body = src.slice(src.indexOf('createTeamSecure'), src.indexOf('export const addDriverSecure'));
  assert.match(body, /isUsableLeagueId\(leagueId\)/);
  assert.match(body, /invalid-argument/);
  // and the check must come before the write
  assert.ok(body.indexOf('isUsableLeagueId') < body.indexOf('leagueId: leagueId || null'),
    'validate before writing, or the guard is decoration');
});
