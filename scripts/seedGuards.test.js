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
//   - A script can still reach credentials through a path this does not
//     model: fs.readFileSync of a concatenated path, or a deferred callback
//     body. Plain ADC via a module-scope `admin.initializeApp()` IS caught —
//     only the modular-SDK spelling of it escapes, as below.
//   - The ratchet scans scripts/**, functions/src/** and functions/scripts/**.
//     All ten operational scripts in functions/scripts are now guarded and
//     checked above; they are import-safe but their write discipline comes
//     from the `aidlc op` kind, not from this test.
//   - Three tracked scripts at the repo root — cleanup-dup-teams.js,
//     repair-dedouble.js, diagnose-scoring.js — call initializeApp with a
//     bare projectId and self-invoke. They are the ADC shape above, and they
//     are outside the scan roots entirely.
//   - It keys on a module-scope `admin.initializeApp(` call, plus any
//     mention of a serviceAccount path. The first arm covers an SA_KEY env
//     read and plain ADC. The second arm catches nothing under
//     functions/scripts at all — the real key path there contains no such
//     substring — so do not read it as a second line of defence.
//     Three shapes are known to escape, each verified writing production on
//     import while this suite stayed green:
//       * the modular SDK — `require('firebase-admin/app').initializeApp()`,
//         which is the current Admin API, not an exotic spelling;
//       * an alias — `const fb = require('firebase-admin'); fb.initializeApp()`;
//       * a module-scope `fs.readFileSync` of the key path.
//     The first two are the same credential obtained the same way, reached
//     through a differently-spelled call. Closing them needs symbol
//     resolution, not a shape match.
//   - `flagInGuard: false` waives more than the flag assertion: the check
//     that the guard actually calls the entry point lives in the same test.
//     That now covers the ten operational scripts plus getIndexLink and
//     updateData, so for twelve of the files below nothing verifies the
//     guard invokes its entry point. An empty guard body fails safe — the
//     script becomes a no-op — but it would not be caught here. The
//     initialiser check added alongside it runs for every file either way.
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

// The nine operational scripts under functions/scripts. They are run by
// `aidlc op` via scripts/ops/run-script.js, which spawns them directly, so
// require.main holds.
//
// Checked for IMPORT-SAFETY ONLY, and that limit is worth stating precisely:
//   - Six of the nine write (backfillLeagueRaceResults, backfillZandvoortTsunoda,
//     pitwallPass, repairStuckLocks, setConstructorColors, setPitWallConfig);
//     three are read-only (checkRaceCalendar, exportPitwallHistory,
//     verifyRaceScoring).
//   - All six writers gate on --apply today, and the `uc-script` op kind
//     passes it only on apply. But NOTHING HERE ENFORCES THAT. Deleting the
//     `if (!APPLY)` line from any of them leaves this suite green, and
//     `aidlc op dryrun` would then write production. Asserting it properly
//     needs a behavioural check per writer, which this file does not have.
//   - All nine now require SA_KEY explicitly and refuse a key for the wrong
//     project. Three of them used to fall back to a hardcoded admin-SDK key
//     on the share when SA_KEY was unset, so running them without the env
//     var still reached production, with nothing checking which project the
//     key was for. Found by running them rather than reading them, and
//     removed. NOTHING HERE ENFORCES THAT EITHER: delete a project check and
//     this suite stays green while the comment above it lies. Same gap as
//     the --apply note, and worth the same scepticism.
const OP_SCRIPTS = [
  'backfillLeagueRaceResults', 'backfillZandvoortTsunoda', 'checkRaceCalendar',
  'exportPitwallHistory', 'pitwallPass', 'repairStuckLocks',
  'setConstructorColors', 'setPitWallConfig', 'stampAceWindowForLiveRace',
  'verifyRaceScoring',
].map((n) => ({
  file: `functions/scripts/${n}.js`,
  entry: 'main',
  // checkRaceCalendar names its initialiser setup(); the rest use initAdmin().
  init: n === 'checkRaceCalendar' ? 'setup' : 'initAdmin',
  flagInGuard: false,
}));

const GUARDED = [
  { file: 'scripts/runSeed.ts', entry: 'main', flagInGuard: true },
  // cleanAll destroys data that cannot be regenerated, so it needs a second
  // flag. That requirement is asserted behaviourally below, not by looking
  // for the string: deleting the --project check outright still left
  // `--project=` in the help text, so a substring assertion passed on a
  // script that no longer required it.
  { file: 'scripts/cleanAll.ts', entry: 'main', flagInGuard: true, refusesWithout: ['--apply'] },
  { file: 'functions/src/seedData.ts', entry: 'seedDatabase', flagInGuard: true },
  // The last four. deleteTsunoda deletes a production document and
  // setAdminClaim grants an admin claim on a real account, so both need the
  // flag; getIndexLink only runs queries and updateData prints usage before
  // it asks for a credential, so neither does.
  { file: 'scripts/deleteTsunoda.ts', entry: 'deleteTsunoda', flagInGuard: true },
  { file: 'scripts/setAdminClaim.ts', entry: 'main', flagInGuard: true },
  { file: 'scripts/getIndexLink.ts', entry: 'testQueries', flagInGuard: false },
  { file: 'functions/src/updateData.ts', entry: 'main', flagInGuard: false },
  ...OP_SCRIPTS,
];

for (const { file, entry, flagInGuard, init = 'initAdmin' } of GUARDED) {
  // The refactor that guards these files introduces its own escape: every one
  // of them moves credential work into initAdmin(), and a module-scope call to
  // THAT is a plain identifier, not `admin.initializeApp(`, so the ratchet does
  // not see it. Hoisting `initAdmin();` one line above the guard restored
  // full connect-on-import with the suite green. Treat the initialiser exactly
  // like the entry point.
  test(`${file}: the initialiser is never reached on import`, () => {
    const sf = parse(file);
    findMainGuard(sf, file);
    for (const n of moduleScopeNodes(sf)) {
      if (!ts.isIdentifier(n) || n.text !== init) continue;
      const p = n.parent;
      if ((ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p)) && p.name === n) continue;
      if (ts.isPropertyAccessExpression(p) && p.name === n) continue;
      if (ts.isExportSpecifier(p) || ts.isExportAssignment(p)) continue;
      assert.fail(`${file} mentions ${init} at module scope — it would connect on import`);
    }
  });

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

  if (flagInGuard) test(`${file}: the guard reads an explicit flag from argv`, () => {
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
// Modules where initialising on load IS the contract, as distinct from a gap:
//   - functions/src/index.ts is the Cloud Functions entry point. The runtime
//     loads it and supplies credentials; there is no "run" to guard.
//   - scripts/ops/_firestore.js exists to hand an initialised db to the op
//     helpers. It connects via ADC, reads no key file and performs no
//     operation, so requiring it creates a client and nothing else.
// Neither self-invokes any work. They are listed so the ratchet does not
// report them as defects, and so adding to this list is a deliberate act.
const INIT_ON_LOAD_BY_DESIGN = ['functions/src/index.ts', 'scripts/ops/_firestore.js'];

// Empty, and that is the point of the ratchet: every file the scan reaches
// now guards its own run. A new one here means something regressed or a new
// script arrived unguarded — not that the list needs extending.
const KNOWN_UNGUARDED = [];

test('no new script reaches the production key on import', () => {
  // The previous scan was flat `scripts/*.ts` and only looked at require().
  // scripts/ops, scripts/release and functions/src were all outside it, which
  // is how functions/src/updateData.ts — module-scope key, initializeApp,
  // firestore() and an unguarded main().catch() — went unlisted. Walk the
  // trees, and count any mention of the key path however it is reached.
  const roots = ['scripts', 'functions/src', 'functions/scripts'];
  const files = [];
  const walkDir = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      // Skip only the compiled output, not every directory called lib:
      // functions/scripts/lib holds hand-written source, and excluding it by
      // name left a probe there writing production on import while this
      // suite stayed green. The functions/lib arm is defensive rather than
      // load-bearing — no scan root reaches it today — but it keeps the rule
      // correct if one is ever added.
      if (e.isDirectory()) { if (e.name !== 'node_modules' && rel !== 'functions/lib') walkDir(rel); continue; }
      if (/\.(ts|js)$/.test(e.name) && !/\.test\.[tj]s$/.test(e.name)) files.push(rel);
    }
  };
  roots.forEach(walkDir);

  // Keyed on `admin.initializeApp(` at module scope, not on a key path.
  // Matching the string `serviceAccount` missed every script that takes its
  // key from SA_KEY — which is all nine under functions/scripts — and misses
  // ADC, which needs no key at all. Connecting to a project on import is the
  // thing worth forbidding, however the credential is obtained.
  const unguarded = files
    .filter((rel) => !INIT_ON_LOAD_BY_DESIGN.includes(rel))
    .filter((rel) => moduleScopeNodes(parse(rel)).some((n) => {
      if (ts.isCallExpression(n) && isMemberCall(n, 'admin', 'initializeApp')) return true;
      return (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && /serviceAccount/.test(n.text);
    }))
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
