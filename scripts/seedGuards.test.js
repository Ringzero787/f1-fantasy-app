// node --test scripts/*.test.js
//
// Several scripts here write production Firestore directly using a
// service-account key that may be present on the build box. Some of them used
// to do it *on import*: they read the key and called their entry point at
// module scope, so running or merely requiring the file wrote live data with
// no prompt and no flag. The `races` collection two of them touch is
// maintained by Undercut's ingestion and settled against, so this is not a
// local-only concern.
//
// The first version of this test was not fit for purpose and is worth
// recording, because the failure is instructive. It asserted three things as
// substrings: that `main();` did not appear at column zero, that
// `require.main === module` appeared somewhere, and that `--apply` appeared
// somewhere. All three are defeated by trivial edits — one leading space
// before the call, and leaving the two magic strings in a comment while
// deleting the actual guard. Reconstructing the original vulnerable shape that
// way passed 2 of its 3 assertions. A test that passes on the exact code it
// was written to reject is worse than no test, because the next person trusts
// it.
//
// So this version works on code with comments stripped, and checks structure
// rather than presence: every call to the entry point must lie inside the
// `require.main === module` block, by character offset.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// Blank out comments while preserving offsets and line structure, so a magic
// string in a comment cannot satisfy an assertion about code.
function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
    } else if (two === '/*') {
      while (i < src.length && src.slice(i, i + 2) !== '*/') { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
    } else {
      out += src[i]; i++;
    }
  }
  return out;
}

const read = (file) => {
  const p = path.join(ROOT, file);
  assert.ok(fs.existsSync(p), `${file} is missing — if it was deleted, delete its entry here too`);
  return stripComments(fs.readFileSync(p, 'utf8'));
};

// The character range of the `if (require.main === module) { … }` block.
function guardRange(code, file) {
  const m = /if\s*\(\s*require\.main\s*===\s*module\s*\)\s*\{/.exec(code);
  assert.ok(m, `${file} has no \`require.main === module\` guard in code (a comment does not count)`);
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) return [m.index, i]; }
  }
  assert.fail(`${file}: the require.main guard block is unbalanced`);
}

// Lines where a pattern sits at column zero — i.e. runs on import.
function atModuleScope(code, re) {
  return code.split('\n').filter((line) => re.test(line) && !/^[ \t]/.test(line));
}

const GUARDED = [
  { file: 'scripts/runSeed.ts', entry: 'main' },
  { file: 'functions/src/seedData.ts', entry: 'seedDatabase' },
];

for (const { file, entry } of GUARDED) {
  test(`${file}: the entry point is only called inside the require.main guard`, () => {
    const code = read(file);
    const [start, end] = guardRange(code, file);
    // Call sites only — `function main()` and `async function main()` are declarations.
    const callRe = new RegExp(`(?<!function\\s)(?<!\\w)${entry}\\s*\\(`, 'g');
    for (const m of code.matchAll(callRe)) {
      assert.ok(
        m.index > start && m.index < end,
        `${file} calls ${entry}() outside the require.main guard, at offset ${m.index} — it would run on import`
      );
    }
  });

  test(`${file}: the guard requires an explicit --apply`, () => {
    const code = read(file);
    const [start, end] = guardRange(code, file);
    const block = code.slice(start, end);
    // Both halves matter. Checking only for the string `--apply` passed when
    // the condition was replaced with `if (true)`, because the dry-run message
    // inside the block still mentions the flag. The flag has to actually be
    // read from argv. (This still would not catch a contrived condition that
    // reads argv and ignores it; it catches the plausible regressions.)
    assert.match(block, /--apply/, `${file} must name --apply inside the guard`);
    assert.match(
      block,
      /process\.argv/,
      `${file} must read --apply from process.argv inside the guard, not merely print it`
    );
  });

  test(`${file}: credentials are not touched on import`, () => {
    const code = read(file);
    assert.deepEqual(atModuleScope(code, /admin\.initializeApp\s*\(/), [], `${file} initialises firebase-admin at module scope`);
    assert.deepEqual(atModuleScope(code, /serviceAccountKey\.json/), [], `${file} reads the service-account key at module scope`);
    assert.deepEqual(atModuleScope(code, /admin\.firestore\s*\(\s*\)/), [], `${file} builds a Firestore handle at module scope`);
  });
}

// A ratchet rather than a completeness claim. The previous version asserted
// `SEEDERS.length === 2`, which was a tautology dressed up as coverage — and
// false, because four other scripts in this directory read the same key at
// module scope. They are listed here so that adding a new one fails, and so
// that guarding one of these is a visible deletion from the list rather than
// something nobody notices. scripts/cleanAll.ts is the one to do next: it
// deletes teams, leagues and transactions.
const KNOWN_UNGUARDED = [
  'scripts/cleanAll.ts',
  'scripts/deleteTsunoda.ts',
  'scripts/getIndexLink.ts',
  'scripts/setAdminClaim.ts',
];

test('no new script reads the production key on import', () => {
  const found = fs
    .readdirSync(path.join(ROOT, 'scripts'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `scripts/${f}`)
    .filter((rel) => atModuleScope(read(rel), /serviceAccountKey\.json/).length > 0)
    .sort();

  assert.deepEqual(
    found,
    [...KNOWN_UNGUARDED].sort(),
    'the set of scripts reading the service-account key at module scope changed — ' +
      'guard the new one, or if you have guarded an old one, remove it from KNOWN_UNGUARDED'
  );
});
