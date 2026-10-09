// F-117. The enforcement half of every rules feature — F-056, F-095, F-098, F-104, F-105 — was
// written as rules-tests/ and then only ever run by hand, because the blocking test command did
// not mention it and the runner could not work on a GitHub runner anyway (no firebase CLI, no
// cached emulator). Four features' security properties were verified on exactly one machine.
//
// So this test guards the wiring, not the rules: that the command CI runs still invokes the suite,
// that the suite is not empty, and that the emulator the runner downloads is pinned. A rules test
// nobody runs is worth nothing, and the way it stops being run is silently.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Every quoted `test:` value in the project config, read from the raw text rather than parsed.
 * Deliberately no yaml library: js-yaml is present in node_modules only transitively, and a test
 * that depends on an undeclared package fails the day a dependency drops it. Commented-out lines
 * are skipped so a disabled command cannot satisfy the assertion.
 */
function testCommands() {
  return read('.aidlc/aidlc.yaml').split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .map((l) => l.match(/^\s*test:\s*"(.*)"\s*$/))
    .filter(Boolean)
    .map((m) => m[1]);
}

test('the blocking test command runs the Firestore rules suite', () => {
  const cmds = testCommands();
  assert.ok(cmds.length > 0, 'no test command found in .aidlc/aidlc.yaml');
  assert.ok(cmds.some((c) => c.includes('npm run test:rules')),
    'the blocking test command must run `npm run test:rules`, or the rules suite is verified on '
    + 'whatever machine someone remembers to run it on');
});

test('test:rules points at the runner, and the suite is not empty', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['test:rules'] ?? '', /run-rules-tests\.sh/);
  const files = fs.readdirSync(path.join(ROOT, 'rules-tests')).filter((f) => f.endsWith('.test.js'));
  assert.ok(files.length >= 5, `rules-tests/ has ${files.length} suites; a vacuous command passes`);
});

test('the emulator the runner may download is pinned by version and hash', () => {
  // It is fetched over the network and then EXECUTED. Unpinned, that is a supply-chain hole.
  const sh = read('scripts/ops/run-rules-tests.sh');
  assert.match(sh, /^EMULATOR_VERSION="v\d+\.\d+\.\d+"$/m, 'pin the emulator version');
  assert.match(sh, /^EMULATOR_SHA256="[0-9a-f]{64}"$/m, 'pin the emulator sha256');
  assert.ok(sh.includes('sha256sum'), 'the download must be hashed');
  assert.ok(sh.includes('Refusing to run it'), 'a hash mismatch must refuse, not warn');
  // And the jar must not survive a failed check, or the next run trusts it.
  const refusal = sh.slice(sh.indexOf('sha256 mismatch'));
  assert.ok(/rm -f "\$TMP"/.test(sh.slice(0, sh.indexOf('sha256 mismatch') + refusal.length)),
    'a jar that fails the hash check must be deleted');
});
