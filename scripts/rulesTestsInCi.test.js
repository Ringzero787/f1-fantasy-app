// F-117. The enforcement half of five features — F-056, F-095, F-098, F-104, F-105 — lives in
// rules-tests/ and was never named by the blocking test command, so 72 tests that prove the
// security properties ran on whatever machine someone remembered to run them on.
//
// This guards the WIRING and the emulator PIN, not the rules. A rules test nobody runs is worth
// nothing, and the way it stops being run is silently.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const RUNNER = 'scripts/ops/run-rules-tests.sh';

/** Non-comment lines only, so prose about the code cannot satisfy an assertion about the code. */
const codeLines = (src) => src.split('\n').filter((l) => !l.trim().startsWith('#'));

test('the blocking test command runs the Firestore rules suite', () => {
  // Deliberately no yaml library: js-yaml is in node_modules only transitively, and a test that
  // depends on an undeclared package breaks the day something drops it. Matched on the `test:` key
  // line in either quote style rather than anchored to one exact formatting.
  const line = codeLines(read('.aidlc/aidlc.yaml')).find((l) => /^\s*test:\s*["']/.test(l));
  assert.ok(line, 'no `test:` command found in .aidlc/aidlc.yaml');
  assert.ok(line.includes('npm run test:rules'),
    'the blocking test command must run `npm run test:rules`, or the rules suite is verified on '
    + 'whatever machine someone remembers to run it on');
});

test('test:rules points at the runner, and the suite is not empty', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['test:rules'] ?? '', /run-rules-tests\.sh/);
  const files = fs.readdirSync(path.join(ROOT, 'rules-tests')).filter((f) => f.endsWith('.test.js'));
  assert.ok(files.length >= 5, `rules-tests/ has ${files.length} suites; a vacuous command passes`);
});

test('the emulator is selected by the pinned name and verified before it is executed', () => {
  const src = read(RUNNER);
  const code = codeLines(src).join('\n');
  assert.match(src, /^EMULATOR_VERSION="v\d+\.\d+\.\d+"$/m, 'pin the emulator version');
  assert.match(src, /^EMULATOR_SHA256="[0-9a-f]{64}"$/m, 'pin the emulator sha256');
  // The jar is chosen by the pinned filename, never by picking the highest-sorting one: a planted
  // cloud-firestore-emulator-v9.9.9.jar, or a symlink named that, used to sort above the pinned
  // one and run with the pin never consulted.
  assert.ok(!/sort -V/.test(code), 'select the pinned filename, do not sort whatever is cached');
  assert.ok(/JAR="\$CACHE\/cloud-firestore-emulator-\$EMULATOR_VERSION\.jar"/.test(code),
    'JAR must be the pinned filename');
  // Verified on the cache-hit path too, not only after a download.
  assert.ok(/if ! verify_jar; then/.test(code), 'the cached jar must go through verify_jar');
  const afterMove = code.slice(code.indexOf('mv -f "$TMP" "$JAR"'));
  assert.ok(afterMove.includes('verify_jar'),
    'verify AFTER the move, so the bytes executed are the bytes checked');
  // And the refusals live inside verify_jar, not somewhere a later edit could detach them.
  const body = code.slice(code.indexOf('verify_jar() {'), code.indexOf('\n}', code.indexOf('verify_jar() {')));
  assert.ok(body.includes('-L "$JAR"') && body.includes('exit 1'), 'verify_jar must refuse a symlink');
  assert.ok(body.includes('sha256sum') && body.includes('Refusing to run it'),
    'verify_jar must hash the jar and refuse on mismatch');
});

test('the runner really refuses a jar whose hash is wrong', () => {
  // Behavioural, because the previous version of this test asserted on text and was vacuous: its
  // slice spanned the whole file, so an unrelated `rm -f` elsewhere satisfied it and the safety
  // property could regress with the test still green. This runs the thing instead.
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-emu-'));
  try {
    fs.writeFileSync(path.join(cache, 'cloud-firestore-emulator-v1.19.8.jar'), 'not a jar');
    const r = spawnSync('bash', [path.join(ROOT, RUNNER)], {
      cwd: ROOT, encoding: 'utf8', timeout: 240000,
      env: { ...process.env, FIREBASE_EMULATOR_CACHE: cache },
    });
    const out = (r.stdout || '') + (r.stderr || '');
    assert.notEqual(r.status, 0, `a bad jar must refuse; got exit ${r.status}\n${out.slice(-500)}`);
    assert.ok(out.includes('sha256 mismatch'), `expected a mismatch refusal, got:\n${out.slice(-500)}`);
    assert.ok(out.includes('Refusing to run it'));
  } finally {
    fs.rmSync(cache, { recursive: true, force: true });
  }
});
