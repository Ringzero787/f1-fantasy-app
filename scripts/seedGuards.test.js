// node --test scripts/*.test.js
//
// Several scripts here write production Firestore directly using a
// service-account key that may be present on the build box. Some of them used
// to do it *on import*: they read the key and called their entry point at
// module scope, so running or merely requiring the file wrote — or deleted —
// live data with no prompt and no flag. The `races` collection two of them
// touch is maintained by Undercut's ingestion and settled against, so this is
// not a local-only concern.
//
// WHAT THIS IS, AND WHAT IT IS NOT.
//
// It is a tripwire for the obvious regression: someone deleting a guard, or
// adding a new script that reads the key on import. It is NOT a proof of
// import-safety, and it should not be read as one.
//
// That distinction is the whole history of this file. Three versions, three
// classes of hole, each one looking correct:
//
//   1. substring assertions  — fell to one leading space, and to leaving the
//      magic strings in a comment while deleting the real guard.
//   2. hand-rolled comment stripper + indentation — no string or template
//      state, and it skipped every function, so an IIFE walked straight past.
//      That one was executed into real deletions while reporting all green.
//   3. a transpile-and-execute harness asserting import-safety — defeated six
//      ways: a deferred arrow (the probe reported before the timer fired), an
//      early process.exit, a spoofed output line, a key read through fs
//      instead of require, a transpile that omitted the project's own
//      compiler options so a crash scored as "touched nothing", and a stub
//      the subject could detect.
//
// So the import-safety harness is gone. What remains is static analysis via
// the TypeScript compiler, which is sound for the shapes it checks, plus one
// behavioural test for the refusal path — kept because its static equivalent
// was provably useless: deleting cleanAll's --project requirement left
// `--project=` in the help text, and a source check passed on it.
//
// KNOWN GAPS, so nobody mistakes green for safe:
//   - A script can still reach credentials through a path this does not model
//     (fs.readFileSync of a concatenated path, ADC with no key string at all,
//     a deferred callback body).
//   - The ratchet scans scripts/** and functions/src/**. It does NOT scan
//     functions/scripts/, where nine files self-invoke at module scope and
//     eight of them read a key there — three pointing at a real admin-SDK key
//     on the share, two of which write. That cluster is larger than
//     everything guarded here and is tracked separately.
//   - Three tracked scripts at the repo root — cleanup-dup-teams.js,
//     repair-dedouble.js, diagnose-scoring.js — call initializeApp with a
//     bare projectId and self-invoke. They are the ADC shape above, and they
//     are outside the scan roots entirely.
//   - It keys on the string `serviceAccount`, which the production key path
//     in functions/scripts/ does not contain.
//
// Treat a failure here as real. Do not treat a pass as clearance.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');

function parse(file) {
  const p = path.join(ROOT, file);
  assert.ok(fs.existsSync(p), `${file} is missing — if it was deleted, delete its entry here too`);
  return ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true);
}

const KEY_RE = /serviceAccountKey\.json/;

// Every node reachable from the module's top-level statements WITHOUT
// descending into a function that only runs when something calls it, and
// without descending into the `require.main === module` guard. That is
// "what runs on import", which is what is being asserted.
//
// The subtlety that broke the previous version: skipping every function is
// wrong, because an immediately-invoked one DOES run on import.
// `(async () => { await main(); })()` is the most obvious way to run code at
// module scope while looking like a function, and the review executed exactly
// that into real deletions while this test reported all green. So a function
// expression or arrow is skipped only when it is NOT the thing being called.
function moduleScopeNodes(sf) {
  const out = [];
  const isFn = (n) =>
    ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) || ts.isMethodDeclaration(n) ||
    ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);

  // An IIFE: the callee of a call, possibly wrapped in parens, possibly
  // invoked via .call/.apply, possibly `new function(){}`. Each of these runs
  // the body on import while looking like a function declaration.
  const isImmediatelyInvoked = (n) => {
    let cur = n;
    let outer = cur.parent;
    while (outer && ts.isParenthesizedExpression(outer)) { cur = outer; outer = outer.parent; }
    if (!outer) return false;
    if (ts.isNewExpression(outer) && outer.expression === cur) return true;
    if (ts.isCallExpression(outer) && outer.expression === cur) return true;
    // (function(){}).call(null) / .apply(null)
    if (ts.isPropertyAccessExpression(outer) && outer.expression === cur &&
        ['call', 'apply', 'bind'].includes(outer.name.text) &&
        outer.parent && ts.isCallExpression(outer.parent)) return true;
    return false;
  };

  const walk = (n) => {
    if (isFn(n) && !isImmediatelyInvoked(n)) return;
    if (isMainGuard(n)) {
      // Only the then-branch is guarded. An else branch runs precisely when
      // the file IS imported, which is the opposite of safe.
      if (n.elseStatement) walk(n.elseStatement);
      return;
    }
    out.push(n);
    n.forEachChild(walk);
  };
  sf.statements.forEach(walk);
  return out;
}

function isMainGuard(n) {
  if (!ts.isIfStatement(n)) return false;
  const c = n.expression;
  return (
    ts.isBinaryExpression(c) &&
    c.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
    /require\s*\.\s*main/.test(c.left.getText()) &&
    c.right.getText() === 'module'
  );
}

function findMainGuard(sf, file) {
  const found = sf.statements.find(isMainGuard);
  assert.ok(found, `${file} has no \`require.main === module\` guard (a comment does not count)`);
  return found;
}

const callsNamed = (node, name) => {
  const hits = [];
  const walk = (n) => {
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      // main(), main.call(), main.apply(), and `const go = main` aliases are
      // all worth catching; a plain identifier reference is reported too.
      if (ts.isIdentifier(e) && e.text === name) hits.push(n);
      if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === name) hits.push(n);
    }
    n.forEachChild(walk);
  };
  walk(node);
  return hits;
};

// `obj.name(...)` as a node shape, resolving `obj['name']` too, and ignoring
// a longer chain like admin.firestore.Timestamp.fromDate().
function isMemberCall(call, objName, propName) {
  const e = call.expression;
  let obj, prop;
  if (ts.isPropertyAccessExpression(e)) { obj = e.expression; prop = e.name.text; }
  else if (ts.isElementAccessExpression(e) && e.argumentExpression && ts.isStringLiteral(e.argumentExpression)) {
    obj = e.expression; prop = e.argumentExpression.text;
  } else return false;
  return ts.isIdentifier(obj) && obj.text === objName && prop === propName;
}

// Transpile the subject and run it in a temp dir against a stub
// firebase-admin and a fake key, so the ONE thing below can be asserted by
// running it: that cleanAll refuses --apply without --project.
//
// That is all this does now. An earlier version used the same machinery to
// claim import-safety by observation, and was defeated six ways — a deferred
// arrow reporting before its timer fired, an early process.exit, a spoofed
// output line, a key read through fs, a transpile omitting the project's own
// compiler options so a crash read as "touched nothing", and a stub the
// subject could detect. It is gone. The refusal check survives because its
// static equivalent provably did not work: deleting the --project
// requirement left `--project=` in the help text and a source check passed.
function runUnderStub(file, argv) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seedguard-'));
  const entryFile = path.join(dir, 'subject.js');
  fs.writeFileSync(entryFile, js);
  // A stub that records instead of connecting, and a key that is never real.
  fs.mkdirSync(path.join(dir, 'node_modules', 'firebase-admin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'firebase-admin', 'package.json'), JSON.stringify({ name: 'firebase-admin', main: 'index.js' }));
  fs.writeFileSync(path.join(dir, 'node_modules', 'firebase-admin', 'index.js'), `
    const calls = [];
    const rec = (n) => (...a) => { calls.push(n); return handle; };
    const handle = new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : rec(String(k))) });
    module.exports = {
      __calls: calls,
      initializeApp: (...a) => { calls.push('initializeApp'); return {}; },
      credential: { cert: (...a) => { calls.push('cert'); return {}; } },
      firestore: Object.assign(() => { calls.push('firestore'); return handle; }, { Timestamp: { fromDate: (d) => d } }),
    };
  `);
  fs.writeFileSync(path.join(dir, 'serviceAccountKey.json'), JSON.stringify({ project_id: 'stub-project' }));
  // seedData.ts imports ./seedData for its data; give it an inert stand-in.
  fs.writeFileSync(path.join(dir, 'seedData.js'), 'module.exports={drivers2026:[],constructors2026:[],races2025:[],season2025:{id:"x"}};');

  try {
    // SIGKILL, not the default SIGTERM: a subject that traps SIGTERM made the
    // suite hang past three minutes, and this file gates CI.
    const r = require('node:child_process').spawnSync(process.execPath, [entryFile, ...argv], {
      cwd: dir, encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL',
    });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const GUARDED = [
  { file: 'scripts/runSeed.ts', entry: 'main' },
  // cleanAll destroys data that cannot be regenerated, so it needs a second
  // flag. That requirement is asserted behaviourally below, not by looking
  // for the string: deleting the --project check outright still left
  // `--project=` in the help text, so a substring assertion passed on a
  // script that no longer required it.
  { file: 'scripts/cleanAll.ts', entry: 'main', refusesWithout: ['--apply'] },
  { file: 'functions/src/seedData.ts', entry: 'seedDatabase' },
];

for (const { file, entry } of GUARDED) {
  test(`${file}: the entry point is never reached on import`, () => {
    const sf = parse(file);
    findMainGuard(sf, file);
    // Any mention of the entry point at module scope, not just a call. The
    // previous version checked for calls, so `setTimeout(main, 0)`,
    // `Promise.resolve().then(main)` and `const go = main; go()` all walked
    // past it — each of which the review executed into real deletions on a
    // bare require(). A bare reference is enough to run it, so a bare
    // reference is the thing to forbid.
    for (const n of moduleScopeNodes(sf)) {
      if (!ts.isIdentifier(n) || n.text !== entry) continue;
      // The declaration's own name is not a use of it.
      const p = n.parent;
      if ((ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p)) && p.name === n) continue;
      if (ts.isPropertyAccessExpression(p) && p.name === n) continue;
      assert.fail(
        `${file} mentions ${entry} at module scope (line ${
          sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
        }) — calling, deferring or aliasing it there all run it on import`
      );
    }
  });

  test(`${file}: the guard reads an explicit flag from argv`, () => {
    const sf = parse(file);
    const guard = findMainGuard(sf, file);
    const text = guard.getText();
    assert.match(text, /--apply/, `${file} must name --apply inside the guard`);
    assert.match(text, /process\s*\.\s*argv/, `${file} must read the flag from process.argv, not merely print it`);
    // The entry point must be called somewhere inside the guard, or the guard
    // is decoration.
    assert.ok(callsNamed(guard, entry).length > 0, `${file} never calls ${entry}() inside its guard`);
  });

  test(`${file}: credentials are not touched on import`, () => {
    const sf = parse(file);
    for (const n of moduleScopeNodes(sf)) {
      if (ts.isCallExpression(n)) {
        // Match the callee structurally. Comparing stripped text to
        // 'admin.firestore' was still a text test: `admin['firestore']()`,
        // `const f = admin.firestore; f()` and `admin./*c*/initializeApp()`
        // all walked through it. Matching the node shape does not care about
        // spelling or comments.
        //
        // It has to be the member access itself, not a prefix of a longer
        // one: `admin.firestore.Timestamp.fromDate(...)` is a pure static
        // helper that seedData.ts uses legitimately at module scope to build
        // race data, and needs no initialised app.
        for (const bad of ['initializeApp', 'firestore']) {
          assert.ok(
            !isMemberCall(n, 'admin', bad),
            `${file} calls admin.${bad}() at module scope`
          );
        }
      }
      // Any mention of the key filename at module scope, however it is
      // reached — require(), fs.readFileSync(), or a concatenated path.
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
        assert.doesNotMatch(n.text, KEY_RE, `${file} references the service-account key at module scope`);
        assert.doesNotMatch(n.text, /serviceAccount/, `${file} references a service-account path at module scope`);
      }
    }
  });
}

// A ratchet, not a completeness claim. An earlier version asserted
// `SEEDERS.length === 2`, a tautology dressed as coverage — and false, since
// several siblings read the same key at module scope. Listing them means a new
// one fails this test, and guarding one is a visible deletion here rather than
// something nobody notices.
// Each of these also calls its entry point at module scope, not merely reads
// the key — scripts/deleteTsunoda.ts deletes a production document on import.
// functions/src/updateData.ts was missed entirely by the earlier flat scan.
const KNOWN_UNGUARDED = [
  'scripts/deleteTsunoda.ts',
  'scripts/getIndexLink.ts',
  'scripts/setAdminClaim.ts',
  'functions/src/updateData.ts',
];

test('no new script reaches the production key on import', () => {
  // The previous scan was flat `scripts/*.ts` and only looked at require().
  // scripts/ops, scripts/release and functions/src were all outside it, which
  // is how functions/src/updateData.ts — module-scope key, initializeApp,
  // firestore() and an unguarded main().catch() — went unlisted. Walk the
  // trees, and count any mention of the key path however it is reached.
  const roots = ['scripts', 'functions/src'];
  const files = [];
  const walkDir = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'lib') walkDir(rel); continue; }
      if (/\.(ts|js)$/.test(e.name) && !/\.test\.[tj]s$/.test(e.name)) files.push(rel);
    }
  };
  roots.forEach(walkDir);

  const unguarded = files
    .filter((rel) => moduleScopeNodes(parse(rel)).some(
      (n) => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && /serviceAccount/.test(n.text)
    ))
    .sort();

  assert.deepEqual(
    unguarded,
    [...KNOWN_UNGUARDED].sort(),
    'the set of files reaching the service-account key on import changed — guard the new one, ' +
      'or if you have guarded an old one, remove it from KNOWN_UNGUARDED'
  );
});

for (const { file, refusesWithout } of GUARDED) {
  if (!refusesWithout) continue;
  test(`${file}: refuses ${refusesWithout.join(' ')} without its second flag`, () => {
    // The only behavioural assertion kept, and it is here because the static
    // equivalent was useless: deleting the --project requirement outright left
    // `--project=` in the help text, so a source check passed on a script that
    // no longer required it. Running it and reading the exit code cannot be
    // fooled that way.
    const { status } = runUnderStub(file, refusesWithout);
    assert.equal(status, 2, `${file} must refuse ${refusesWithout.join(' ')} alone with exit 2, got ${status}`);
  });
}
