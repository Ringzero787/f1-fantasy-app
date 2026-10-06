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

test('the pattern and bound are READ OUT OF firestore.rules, not copied beside it', () => {
  // The first version of this asserted LEAGUE_ID_PATTERN against a hardcoded copy of itself, so
  // editing usableLeagueId in firestore.rules and nothing else left every test green — a pin
  // that pinned nothing. It reads the rule now.
  const fs = require('node:fs');
  const path = require('node:path');
  const rules = fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
  const fn = rules.slice(rules.indexOf('function usableLeagueId('));
  const body = fn.slice(0, fn.indexOf('\n    }'));

  const pattern = body.match(/matches\('([^']+)'\)/);
  assert.ok(pattern, 'usableLeagueId in firestore.rules no longer calls matches() — these two have to agree');
  assert.equal(pattern[1], LEAGUE_ID_PATTERN,
    'the rule and functions/src/utils/leagueId.ts disagree about what a league id looks like');

  const bound = body.match(/size\(\)\s*<=\s*(\d+)/);
  assert.ok(bound, 'usableLeagueId in firestore.rules no longer bounds the length');
  assert.equal(Number(bound[1]), LEAGUE_ID_MAX,
    'the rule and the helper disagree about the maximum length');

  // and both halves of the shape the rule relies on, so a loosened rule cannot pass quietly
  assert.match(body, /id is string/);
  assert.match(body, /size\(\) > 0/);

  // The definition agreeing is not the same as the definition being USED. Deleting the conjunct
  // from `allow update` while leaving the function intact passed every assertion above — the
  // emulator suite caught it, but that suite is not in CI's test command, so this has to.
  const teams = rules.slice(rules.indexOf('match /fantasyTeams/{teamId} {'));
  const block = teams.slice(0, teams.indexOf('allow delete:'));
  const uses = block.match(/usableLeagueId\(request\.resource\.data\)/g) ?? [];
  assert.equal(uses.length, 2,
    'usableLeagueId must be a conjunct of BOTH allow create and allow update on fantasyTeams — '
    + `found ${uses.length}. A create-only rule leaves the hole open to anyone who creates a team `
    + 'properly and then edits it.');
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

test('every server dereference of a team leagueId goes through the helper', () => {
  // The predicate is only as good as the number of doors it stands in front of. The first
  // version of this feature was a rules change alone; the second missed the admin repair path
  // and left a weaker inline copy in the lock sweep. This counts the doors.
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', 'src', p), 'utf8');

  const scoring = read('scoring/calculatePoints.ts');
  // three league-sync loops plus the admin repair path
  const syncs = scoring.match(/const affectedLeagues = \[[\s\S]{0,140}?;/g) ?? [];
  assert.equal(syncs.length, 3, 'the number of league-sync loops changed — check each one filters');
  for (const s of syncs) assert.match(s, /keepUsableLeague/);
  assert.match(scoring, /team\.leagueId && team\.userId && keepUsableLeague\(team\.leagueId\)/,
    'the repair path dereferences leagueId and must guard it too — and log, like the sync loops');

  const locks = read('locks/teamLocks.ts');
  assert.match(locks, /isUsableLeagueId\(id\)/, 'the lock sweep must use the shared helper');
  assert.ok(!/!id\.includes\('\/'\)/.test(locks),
    'the inline includes-slash check is weaker than the helper: ., .. and __name__ pass doc() and fail the RPC');

  const teams = read('teams/teamOperations.ts');
  assert.match(teams, /isUsableLeagueId\(leagueId\)/, 'createTeamSecure writes with the Admin SDK and the rules never run on it');

  // the last door the helper reached: this one only self-DoSes its caller, but it was the final
  // copy of the weaker includes('/') check
  const expansion = read('purchases/leagueExpansion.ts');
  assert.match(expansion, /isUsableLeagueId\(leagueId\)/);
  assert.ok(!/leagueId\.includes\('\/'\)/.test(expansion), 'the weaker check should be gone');
});
