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
// KNOWN GAPS, so nobody mistakes green for safe.
//
// What the import check follows, each verified by mutation and each having
// been green at some point before it was closed: a direct call, a wrapper, an
// object method, a getter, a class constructor via `new`, an alias and a
// chain of aliases, an IIFE, a renamed initialiser, element access, a
// three-deep call chain, a shadowed name, the modular Admin API in require
// and import spelling, a bare `fs.readFileSync` of a key, a concatenated key
// path, a hop into a sibling through `exports.x` / `module.exports = {}` /
// a destructured require / an inline `require('./x').init()` / a relative
// ESM import, and a bare `require('./x')` of a sibling that connects at its
// own module scope (transitively).
//
// What the behavioural tests at the foot of this file assert, by running the
// scripts against a stub that intercepts firebase-admin BY RESOLVED PATH:
// every op script refuses a missing SA_KEY and another project's key;
// cleanAll refuses --apply without a matching --project; runSeed seeds
// nothing without --apply; setAdminClaim acts on the address given wherever
// it sits in argv and refuses two.
//
// What is still NOT covered:
//   - The --apply gate is only PROVEN on the scripts the stub can drive into
//     a write: setConstructorColors, setPitWallConfig and runSeed. A script
//     whose work is a loop over query results does nothing under the stub,
//     because it returns no documents, so its "writes nothing" assertion is
//     true without being evidence. That is six of the op scripts. A floor
//     test fails if the demonstrated set shrinks below two, so the group
//     cannot go hollow unnoticed, but do not read those six as verified.
//   - functions/src/seedData.ts resolves its key through `../`, outside the
//     scratch directory, so the harness cannot drive it. Structural checks
//     only.
//   - Anything not reachable by reading names and relative paths. There is no
//     type checker: resolution is by identifier and by require/import
//     specifier. A name produced at runtime, a handler a library calls later,
//     or a module reached through node_modules is not followed.
//   - Scope. A name declared twice is treated as all of its declarations at
//     once, which over-reports rather than under-reports — chosen after a
//     benign `function boot(){}` was found masking a real initialiser.
//   - Three tracked scripts at the repo root — cleanup-dup-teams.js,
//     repair-dedouble.js, diagnose-scoring.js — call initializeApp with a
//     bare projectId and self-invoke. They are outside the scan roots, so
//     nothing here looks at them at all.
//   - scripts/simulation/exportCsv.ts writes three CSV files when imported.
//     It touches no credential and no production data, so the sweep below
//     deliberately does not flag it, but it is not import-safe either.
//   - The sweep over every file in the scan roots looks for a CONNECTION
//     (initializeApp/cert/applicationDefault, however spelled) or a
//     credential-shaped file read. It does NOT flag taking a Firestore
//     handle at module scope, because functions/src/** is Cloud Functions
//     code loaded by index.ts, where that is exactly what it should do.
//     A CLI script doing the same IS caught, by the per-file walk.
//   - The suite needs functions/lib compiled: backfillZandvoortTsunoda
//     requires ../lib/ingestion/openf1Client.js. On a fresh checkout its
//     test fails with a message about argument validation rather than
//     "build functions first". The gate command builds first, so this is
//     latent rather than live.
//   - `flagInGuard: false` waives the check that the guard calls its entry
//     point, since it lives in the same test. An empty guard body fails safe
//     — the script becomes a no-op — but it would not be caught here.
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
        // .bind() returns a function without running it, so it is not an
        // immediate invocation; listing it here over-reported.
        ['call', 'apply'].includes(outer.name.text) &&
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

/**
 * The functions the guard actually runs, so the entry point does not have to
 * be guessed. Returns every locally-declared function called inside the
 * guard's then-branch; each of those is a thing that must not be reachable
 * at module scope, whatever it is called.
 */
function guardEntries(guard, sf) {
  const declared = new Set();
  const collect = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name) declared.add(n.name.text);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer &&
        (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
      declared.add(n.name.text);
    }
    n.forEachChild(collect);
  };
  sf.forEachChild(collect);

  const names = new Set();
  const scan = (n) => {
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      const nm = ts.isIdentifier(e) ? e.text
        : ts.isPropertyAccessExpression(e) ? e.name.text : null;
      if (nm && declared.has(nm)) names.add(nm);
    }
    n.forEachChild(scan);
  };
  scan(guard.thenStatement);
  return [...names];
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
// runUnderStub used to live here: a second, weaker stub that intercepted the
// bare 'firebase-admin' specifier only and copied the subject into a temp
// directory of its own. Its one caller now uses runRecorded, which
// intercepts by resolved path. Two stubs with different isolation guarantees
// was a trap — the weaker one was guarding the most destructive script.

// The operational scripts under functions/scripts, read off disk. They are run by
// `aidlc op` via scripts/ops/run-script.js, which spawns them directly, so
// require.main holds.
//
// Checked for IMPORT-SAFETY ONLY, and that limit is worth stating precisely:
//   - Most of them write (backfillLeagueRaceResults,
//     backfillZandvoortTsunoda, clearStaleAceWindow, pitwallPass,
//     repairStuckLocks, setConstructorColors, setPitWallConfig,
//     stampAceWindowForLiveRace); the read-only ones are checkRaceCalendar,
//     exportPitwallHistory and verifyRaceScoring. pitwallPass writes through
//     store.grantPass() rather than a db call of its own, so grepping for
//     `.set(`/`.update(` reports it read-only — it is not. This list is
//     hand-kept and has gone stale every time a script was added; trust the
//     scan, and re-derive this by reading the scripts, not by grep.
//   - Every writer gates on --apply today, and the `uc-script` op kind
//     passes it only on apply. But NOTHING HERE ENFORCES THAT. Deleting the
//     `if (!APPLY)` line from any of them leaves this suite green, and
//     `aidlc op dryrun` would then write production. Asserting it properly
//     needs a behavioural check per writer, which this file does not have.
//   - They all now require SA_KEY explicitly and refuse a key for the wrong
//     project. Three of them used to fall back to a hardcoded admin-SDK key
//     on the share when SA_KEY was unset, so running them without the env
//     var still reached production, with nothing checking which project the
//     key was for. Found by running them rather than reading them, and
//     removed. NOTHING HERE ENFORCES THAT EITHER: delete a project check and
//     this suite stays green while the comment above it lies. Same gap as
//     the --apply note, and worth the same scepticism.
// Read off disk, not typed out. The hand-written list went stale within
// minutes of being corrected to ten: clearStaleAceWindow.js landed on master
// and the suite stayed green at 64/64, because a script nobody adds to the
// list is a script this file never looks at. That is the wrong failure
// direction for a check whose whole job is to notice an unguarded script.
// Scanning means a new one is covered the moment it exists, and an author who
// needs an exemption has to say so here.
// What counts as a script is the op engine's own rule, not one invented
// here. `aidlc op` will run anything validScriptName() accepts, so a
// narrower predicate in this file is a set of scripts the engine runs and
// this suite never looks at. Review proved it: an unguarded script that
// deletes from `races` was invisible as `_probe.js`, `probe.cjs`,
// `probe.mjs` and `probe.test.js`, all of which the engine accepts.
const { validScriptName } = require('./ops/_paths.js');

// Waivers must name a file. A pattern-shaped exemption is how `_`-prefixed
// scripts became invisible without anyone deciding they should be.
const OP_SCRIPT_EXEMPT = new Set([]);

const OP_SCRIPT_DIR = path.join(ROOT, 'functions', 'scripts');
const listOpScripts = () => fs.readdirSync(OP_SCRIPT_DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && validScriptName(e.name))
  .map((e) => e.name)
  .sort();

const OP_SCRIPTS = listOpScripts()
  .filter((f) => !OP_SCRIPT_EXEMPT.has(f))
  .map((f) => ({ file: `functions/scripts/${f}`, flagInGuard: false }));

test('the op-script scan actually covers something', () => {
  // The floor is on what is CHECKED, not on what is on disk. Filling
  // OP_SCRIPT_EXEMPT from the directory listing used to drop the suite to 35
  // tests, zero failures, with an unguarded script sitting in the directory —
  // because the old assertion measured the directory instead.
  assert.ok(
    OP_SCRIPTS.length >= 10,
    `only ${OP_SCRIPTS.length} op script(s) are being checked; the scan or the ` +
      `exempt list has gone wrong (${listOpScripts().length} on disk)`
  );
});

test('every exemption names a file that exists', () => {
  // Otherwise a waiver for a deleted script lingers and quietly widens.
  for (const f of OP_SCRIPT_EXEMPT) {
    assert.ok(
      fs.existsSync(path.join(OP_SCRIPT_DIR, f)),
      `OP_SCRIPT_EXEMPT names ${f}, which is not in functions/scripts — drop the waiver`
    );
  }
});

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
  // Found by review, not by this list: both self-invoked at module scope.
  // firestore-backup took a backup on import; play-publish read the Play
  // publishing key and, with argv present, could reach the store.
  // firestore-backup's `db` still arrives from ./_firestore, which connects on
  // require by design — the guard is what stops an import from acting.
  // play-publish touches no Firestore at all; its credential is the Play
  // publishing key, now read through a lazy accessor.
  { file: 'scripts/ops/firestore-backup.js', entry: 'main', flagInGuard: false },
  { file: 'scripts/ops/play-publish.js', entry: 'main', flagInGuard: false },
  ...OP_SCRIPTS,
];

/**
 * Index one file: every name it can call, and where names that live in other
 * files actually come from.
 *
 * `bodies` maps a name to EVERY declaration of it, not the first. First-wins
 * meant an earlier benign `function boot(){}` masked a later real initialiser
 * of the same name — this file does no scope analysis, so the safe reading of
 * an ambiguous name is "all of them".
 */
/** Resolve a relative specifier to a file, the one way. */
function resolveRelative(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [base, `${base}.ts`, `${base}.js`, `${base}.cjs`, `${base}.mjs`,
                   path.join(base, 'index.ts'), path.join(base, 'index.js')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function indexFile(abs) {
  if (indexFile.cache.has(abs)) return indexFile.cache.get(abs);
  const sf = ts.createSourceFile(abs, fs.readFileSync(abs, 'utf8'), ts.ScriptTarget.Latest, true);
  const bodies = new Map();
  const aliases = new Map();   // const f = initAdmin
  const modAlias = new Map();  // const lib = require('./lib')
  const named = new Map();     // const { init } = require('./lib')
  const getters = new Set();
  // Local names bound to an admin API that connects, however spelled:
  //   const { initializeApp } = require('firebase-admin/app')
  //   const { initializeApp: ia } = require('firebase-admin/app')
  // A call to `ia` has no member access to match, so without this the
  // current modular Admin API walked straight past.
  const adminBindings = new Set();

  const note = (name, node) => {
    if (!name) return;
    if (!bodies.has(name)) bodies.set(name, []);
    bodies.get(name).push(node);
  };
  const requireTarget = (init) => {
    if (!init || !ts.isCallExpression(init)) return null;
    if (!ts.isIdentifier(init.expression) || init.expression.text !== 'require') return null;
    const a = init.arguments[0];
    if (!a || !ts.isStringLiteral(a)) return null;
    return resolveRelative(abs, a.text);
  };

  const walk = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name) note(n.name.text, n);
    if (ts.isClassDeclaration(n) && n.name) {
      const ctor = n.members.find((m) => ts.isConstructorDeclaration(m));
      if (ctor) note(n.name.text, ctor);
    }
    if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) note(n.name.text, n);
    // A getter runs a body on a bare property read — `const x = lazy.ready`
    // has no call node at all, which is how it walked past the old check.
    if (ts.isGetAccessor(n) && ts.isIdentifier(n.name)) { note(n.name.text, n); getters.add(n.name.text); }
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.initializer &&
        (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
      note(n.name.text, n.initializer);
    }
    // CommonJS exports, which is how the sibling modules actually publish:
    //   exports.init = function () {}       module.exports.init = () => {}
    //   module.exports = { init() {} }      module.exports = { init: fn }
    // A named function EXPRESSION is not a FunctionDeclaration, so none of
    // these were collected and a cross-module hop landed on nothing.
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(n.left)) {
      const lhs = n.left;
      const root = lhs.expression;
      const isExports =
        (ts.isIdentifier(root) && root.text === 'exports') ||
        (ts.isPropertyAccessExpression(root) && ts.isIdentifier(root.expression) &&
         root.expression.text === 'module' && root.name.text === 'exports');
      if (isExports && (ts.isFunctionExpression(n.right) || ts.isArrowFunction(n.right))) {
        note(lhs.name.text, n.right);
      }
      if (isExports && ts.isIdentifier(n.right)) aliases.set(lhs.name.text, n.right.text);
      // module.exports = { ... } — the object's members are the exports.
      const isWholeExports =
        ts.isIdentifier(root) && root.text === 'module' && lhs.name.text === 'exports';
      if (isWholeExports && ts.isObjectLiteralExpression(n.right)) {
        for (const m of n.right.properties) {
          if (ts.isShorthandPropertyAssignment(m) && ts.isIdentifier(m.name)) {
            aliases.set(m.name.text, m.name.text);
          }
        }
      }
    }
    // Relative ESM imports. Every scripts/*.ts is ESM, so without this the
    // cross-module walk saw nothing in exactly the files most likely to use
    // it: `import { boot } from './_warm'` was never followed.
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) &&
        n.moduleSpecifier.text.startsWith('.') && n.importClause) {
      const target = resolveRelative(abs, n.moduleSpecifier.text);
      if (target) {
        const nb = n.importClause.namedBindings;
        if (nb && ts.isNamedImports(nb)) {
          for (const el of nb.elements) {
            named.set(el.name.text, { file: target, name: el.propertyName ? el.propertyName.text : el.name.text });
          }
        } else if (nb && ts.isNamespaceImport(nb)) {
          modAlias.set(nb.name.text, target);
        }
        if (n.importClause.name) modAlias.set(n.importClause.name.text, target);
      }
    }
    // The same thing in ESM, which is what the .ts scripts are written in:
    //   import { initializeApp } from 'firebase-admin/app'
    //   import { initializeApp as ia } from 'firebase-admin/app'
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) &&
        /^firebase-admin/.test(n.moduleSpecifier.text) &&
        n.importClause && n.importClause.namedBindings &&
        ts.isNamedImports(n.importClause.namedBindings)) {
      for (const el of n.importClause.namedBindings.elements) {
        const api = el.propertyName ? el.propertyName.text : el.name.text;
        if (ADMIN_CALLS.includes(api)) adminBindings.add(el.name.text);
      }
    }
    // firebase-admin destructuring, independent of the relative-require
    // handling below (these specifiers are package names, not paths).
    if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.initializer &&
        ts.isCallExpression(n.initializer) && ts.isIdentifier(n.initializer.expression) &&
        n.initializer.expression.text === 'require' &&
        n.initializer.arguments[0] && ts.isStringLiteral(n.initializer.arguments[0]) &&
        /^firebase-admin/.test(n.initializer.arguments[0].text)) {
      for (const el of n.name.elements) {
        const api = el.propertyName && ts.isIdentifier(el.propertyName)
          ? el.propertyName.text
          : (ts.isIdentifier(el.name) ? el.name.text : null);
        if (api && ADMIN_CALLS.includes(api) && ts.isIdentifier(el.name)) {
          adminBindings.add(el.name.text);
        }
      }
    }
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const target = requireTarget(n.initializer);
      if (ts.isIdentifier(n.name)) {
        if (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) {
          note(n.name.text, n.initializer);
        } else if (ts.isIdentifier(n.initializer)) {
          aliases.set(n.name.text, n.initializer.text);
        } else if (target) {
          modAlias.set(n.name.text, target);
        }
      } else if (ts.isObjectBindingPattern(n.name) && target) {
        // const { init } = require('./lib')
        for (const el of n.name.elements) {
          if (ts.isIdentifier(el.name)) {
            named.set(el.name.text, { file: target, name: (el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : el.name.text) });
          }
        }
      }
    }
    n.forEachChild(walk);
  };
  sf.forEachChild(walk);

  const out = { sf, bodies, aliases, modAlias, named, getters, adminBindings };
  indexFile.cache.set(abs, out);
  return out;
}
indexFile.cache = new Map();

const ADMIN_CALLS = ['initializeApp', 'cert', 'applicationDefault', 'getFirestore', 'firestore'];
// Starting an app, as opposed to getting a handle from one already started.
const CONNECT_CALLS = ['initializeApp', 'cert', 'applicationDefault'];

/** Does this body itself initialise admin or read a credential? */
/**
 * `calls` narrows what counts. The per-file walk uses the full set, where
 * obtaining a Firestore handle at module scope is already a connection. This
 * sweep uses CONNECT_CALLS, because functions/src/** is Cloud Functions code
 * loaded by index.ts — taking a db handle at module load is what those are
 * supposed to do, and flagging it would bury the thing being looked for.
 */
function initialisesAdminBody(body, adminBindings = new Set(), calls = ADMIN_CALLS, keyReadsOnly = false) {
  let hit = null;
  const scan = (n) => {
    if (hit) return;
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      const member =
        ts.isPropertyAccessExpression(e) ? e.name.text
        : (ts.isElementAccessExpression(e) && e.argumentExpression &&
           ts.isStringLiteral(e.argumentExpression)) ? e.argumentExpression.text
        : null;
      if (member && calls.includes(member)) hit = `${member}()`;
      // A bare call to a destructured admin API: `ia({})` where
      // `const { initializeApp: ia } = require('firebase-admin/app')`.
      if (ts.isIdentifier(e) && adminBindings.has(e.text)) hit = `${e.text}() [admin]`;
      if (member === 'readFileSync') {
        // In sweep mode only a credential-shaped read counts. Otherwise the
        // sweep flags scripts/simulation/exportCsv.ts, which reads a local
        // results.json — and which, separately, writes three CSV files on
        // import. That is a genuine import-safety smell, but it touches no
        // credential and no production data, so it is not what this check is
        // about and burying it here would not help.
        const argText = n.arguments.map((a) => a.getText()).join(' ');
        if (!keyReadsOnly || /key|credential|service-?account|SA_KEY/i.test(argText)) {
          hit = 'readFileSync()';
        }
      }
      if (ts.isIdentifier(e) && e.text === 'require' && n.arguments.length &&
          ts.isStringLiteral(n.arguments[0]) &&
          /credential|service-?account|\.json$/i.test(n.arguments[0].text)) {
        hit = `require('${n.arguments[0].text}')`;
      }
    }
    n.forEachChild(scan);
  };
  scan(body);
  return hit;
}

/**
 * Walk everything that runs when `abs` is imported, across module boundaries.
 *
 * The single-file version missed a sibling: `require('./_warm').init()` moved
 * the credential read one file away and the walk stopped at the boundary,
 * suite green. Resolution here is by name and by relative require path — not
 * a real type checker — so it is still a ratchet, but it no longer stops at
 * the file it started in.
 */
function reachesAdminOnImport(abs) {
  const seen = new Set();
  const queue = [];
  const push = (file, name, chain) => {
    const k = `${file}::${name}`;
    if (!seen.has(k)) { seen.add(k); queue.push({ file, name, chain }); }
  };

  // Requiring a module runs its top level. A sibling that connects at its
  // own module scope was never entered, because the walk only followed
  // calls — `const w = require('./lib/x')` looked inert. Each relative
  // require reached on import is followed into that file's module scope,
  // transitively.
  const requiredScopes = (file, visited, chain) => {
    if (visited.has(file) || !fs.existsSync(file)) return null;
    visited.add(file);
    // A module that connects on require ON PURPOSE is not a finding here —
    // that is what INIT_ON_LOAD_BY_DESIGN records. scripts/ops/_firestore.js
    // is the live case: firestore-backup gets its db from it, and the run
    // guard is what stops an import from acting.
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    // The exemption covers THIS file's own module-scope connect, not
    // everything it pulls in. Returning early waived the whole subtree: a
    // module required by _firestore.js that read a production key and called
    // the modular initializeApp() was invisible, suite green.
    const byDesign = INIT_ON_LOAD_BY_DESIGN.includes(rel);
    const ix = indexFile(file);
    if (!byDesign) {
      for (const n of moduleScopeNodes(ix.sf)) {
        if (ts.isCallExpression(n)) {
          const d = initialisesAdminBody(n, ix.adminBindings);
          if (d) return { what: d, chain };
        }
      }
    }
    // Followed either way: what an exempt module requires is not exempt.
    for (const n of moduleScopeNodes(ix.sf)) {
      const t = ts.isCallExpression(n) ? inlineRequireTarget(ix, n) : null;
      if (t) {
        const r = requiredScopes(t, visited, [...chain, path.basename(t)]);
        if (r) return r;
      }
    }
    return null;
  };

  const idx0 = indexFile(abs);

  // Module scope itself, first. The walk below follows calls INTO function
  // bodies, so a credential read written straight at module scope — not
  // inside anything — was never examined by it. That left the current Admin
  // API spelling `require('firebase-admin/app').initializeApp()`, an alias
  // `const fb = require('firebase-admin'); fb.initializeApp()`, and a bare
  // `fs.readFileSync(KEY)` all passing, each of which connects on import.
  // They were only ever half-covered by the substring scan further down,
  // which matches `admin.initializeApp(` literally and so misses every one.
  for (const n of moduleScopeNodes(idx0.sf)) {
    if (!ts.isCallExpression(n)) continue;
    const direct = initialisesAdminBody(n, idx0.adminBindings);
    if (direct) return { what: direct, chain: ['(module scope)'] };
  }

  for (const n of moduleScopeNodes(idx0.sf)) {
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const t = targetOf(idx0, n.expression);
      if (t) push(t.file ?? abs, t.name, [t.name]);
    } else if (ts.isPropertyAccessExpression(n) && idx0.getters.has(n.name.text)) {
      push(abs, n.name.text, [`${n.name.text} (getter)`]);
    }
  }

  // Siblings pulled in on import, before following any call.
  {
    const visited = new Set([abs]);
    for (const n of moduleScopeNodes(idx0.sf)) {
      const t = ts.isCallExpression(n) ? inlineRequireTarget(idx0, n) : null;
      if (t) {
        const r = requiredScopes(t, visited, [`require('${path.basename(t)}')`]);
        if (r) return r;
      }
    }
  }

  while (queue.length) {
    const { file, name, chain } = queue.shift();
    if (!fs.existsSync(file)) continue;
    const idx = indexFile(file);

    let resolved = name;
    for (let i = 0; i < 10 && !idx.bodies.has(resolved) && idx.aliases.has(resolved); i++) {
      resolved = idx.aliases.get(resolved);
    }
    // A name imported from elsewhere continues the walk in that file.
    if (!idx.bodies.has(resolved) && idx.named.has(resolved)) {
      const n2 = idx.named.get(resolved);
      push(n2.file, n2.name, [...chain, `${path.basename(n2.file)}:${n2.name}`]);
      continue;
    }
    const list = idx.bodies.get(resolved);
    if (!list) continue;

    for (const body of list) {
      const what = initialisesAdminBody(body, idx.adminBindings);
      if (what) return { what, chain };
      const follow = (n) => {
        if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
          const t = targetOf(idx, n.expression);
          if (t) push(t.file ?? file, t.name, [...chain, t.name]);
        }
        if (ts.isPropertyAccessExpression(n) && idx.getters.has(n.name.text)) {
          push(file, n.name.text, [...chain, `${n.name.text} (getter)`]);
        }
        n.forEachChild(follow);
      };
      follow(body);
    }
  }
  return null;
}

/** `require('./x')` written inline, resolved to a file. */
function inlineRequireTarget(idx, expr) {
  if (!ts.isCallExpression(expr)) return null;
  if (!ts.isIdentifier(expr.expression) || expr.expression.text !== 'require') return null;
  const a = expr.arguments[0];
  if (!a || !ts.isStringLiteral(a)) return null;
  return resolveRelative(idx.sf.fileName, a.text);
}

/** Where a callee expression points: a name, and the file it lives in. */
function targetOf(idx, e) {
  if (ts.isIdentifier(e)) {
    if (idx.named.has(e.text)) return { file: idx.named.get(e.text).file, name: idx.named.get(e.text).name };
    return { file: null, name: e.text };
  }
  if (ts.isPropertyAccessExpression(e)) {
    // lib.init() where `lib` is require('./lib')
    if (ts.isIdentifier(e.expression) && idx.modAlias.has(e.expression.text)) {
      return { file: idx.modAlias.get(e.expression.text), name: e.name.text };
    }
    // require('./lib').init() with no intermediate variable — the inline
    // spelling, and the one issue #161 was actually filed about. Only the
    // two-step form was followed, which is what I had tested.
    const inline = inlineRequireTarget(idx, e.expression);
    if (inline) return { file: inline, name: e.name.text };
    return { file: null, name: e.name.text };
  }
  if (ts.isElementAccessExpression(e) && e.argumentExpression && ts.isStringLiteral(e.argumentExpression)) {
    if (ts.isIdentifier(e.expression) && idx.modAlias.has(e.expression.text)) {
      return { file: idx.modAlias.get(e.expression.text), name: e.argumentExpression.text };
    }
    return { file: null, name: e.argumentExpression.text };
  }
  return null;
}

for (const { file, entry: entryName, flagInGuard } of GUARDED) {
  // Naming the initialiser was the wrong shape of fix. The first version keyed
  // on the identifiers `initAdmin` and `setup`; a wrapper function, an
  // object-literal method, a second initialiser under another name, and
  // `(exports as any).initAdmin()` all walked past it. Matching call names
  // one level deep was only slightly better: `o.go()` is not a function
  // declaration, so nothing connected the call to the body that initialises.
  //
  // So this walks the call graph instead. Seeds are the calls and `new`
  // expressions that run on import; from each, every function body this file
  // defines is followed transitively, and the closure is checked for admin
  // initialisation or a credential read. That makes a wrapper, a method, a
  // rename, or a chain of three one finding rather than four.
  //
  // It is still a NAME LIST matched on a node shape, not a proof about
  // behaviour, and review got past it three ways after the rewrite. What
  // escapes, all demonstrated against a green suite:
  //   - a sibling module: `require('./_warm').init()` relocates the read out
  //     of this file, and the walk never crosses a module boundary;
  //   - a getter: `const x = lazy.ready` runs a body with no call node;
  //   - shadowing: the name->body map is first-wins, so an earlier benign
  //     `function boot(){}` masks a later real initialiser of that name.
  // Closing those needs real symbol resolution across modules, which this
  // file does not do. Treat it as the tripwire the header says it is.
  test(`${file}: nothing reachable on import initialises admin`, () => {
    findMainGuard(parse(file), file);
    const hit = reachesAdminOnImport(path.join(ROOT, file));
    assert.ok(
      !hit,
      hit && `${file}: importing it reaches ${hit.what} via ${hit.chain.join(' -> ')} — ` +
        `admin initialisation must happen inside the require.main guard`
    );
  });

  test(`${file}: the entry point is never reached on import`, () => {
    const sf = parse(file);
    const guard = findMainGuard(sf, file);
    // Derived from what the guard actually runs, not hardcoded to `main`. A
    // script whose entry is run() passed while the byte-identical script
    // naming it main() failed, because the assumed name simply matched
    // nothing and the check passed vacuously.
    const entries = entryName ? [entryName] : guardEntries(guard, sf);
    assert.ok(entries.length > 0, `${file}: could not work out what the guard runs`);
    // Any mention of the entry point at module scope, not just a call. The
    // previous version checked for calls, so `setTimeout(main, 0)`,
    // `Promise.resolve().then(main)` and `const go = main; go()` all walked
    // past it — each of which the review executed into real deletions on a
    // bare require(). A bare reference is enough to run it, so a bare
    // reference is the thing to forbid.
    for (const n of moduleScopeNodes(sf)) {
      if (!ts.isIdentifier(n) || !entries.includes(n.text)) continue;
      // The declaration's own name is not a use of it.
      const p = n.parent;
      if ((ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p)) && p.name === n) continue;
      if (ts.isPropertyAccessExpression(p) && p.name === n) continue;
      assert.fail(
        `${file} mentions ${n.text} at module scope (line ${
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
    // is decoration. Derived when not named, same as the test above.
    const entries = entryName ? [entryName] : guardEntries(guard, sf);
    assert.ok(
      entries.some((e) => callsNamed(guard, e).length > 0),
      `${file} never calls its entry point inside its guard`
    );
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
      // .cjs/.mjs included: the op engine runs them, so they need the same
      // backstop as .js. They had none.
      if (/\.(ts|[cm]?js)$/.test(e.name) && !/\.test\.[tj]s$/.test(e.name)) files.push(rel);
    }
  };
  roots.forEach(walkDir);

  // Keyed on `admin.initializeApp(` at module scope, not on a key path.
  // Matching the string `serviceAccount` missed every script that takes its
  // key from SA_KEY — which is all of functions/scripts — and misses
  // ADC, which needs no key at all. Connecting to a project on import is the
  // thing worth forbidding, however the credential is obtained.
  const unguarded = files
    .filter((rel) => !INIT_ON_LOAD_BY_DESIGN.includes(rel))
    .filter((rel) => {
      // Uses the same detector as the per-file walk rather than its own
      // substring match. Keying on `admin.initializeApp(` plus a literal
      // containing "serviceAccount" missed the modular spelling entirely:
      // a new module-scope connector using
      // require('firebase-admin/app').initializeApp() and a readFileSync of
      // a key path was invisible to this sweep, which is the one check that
      // looks at files NOT in GUARDED/OP_SCRIPTS.
      const sf = parse(rel);
      const idx = indexFile(path.join(ROOT, rel));
      return moduleScopeNodes(sf).some((n) => {
        if (ts.isCallExpression(n) && initialisesAdminBody(n, idx.adminBindings, CONNECT_CALLS, true)) return true;
        return (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && /serviceAccount/.test(n.text);
      });
    })
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
    const r = runRecorded(file, refusesWithout, {}, { inTemp: true });
    assert.equal(r.status, 2, `${file} must refuse ${refusesWithout.join(' ')} alone with exit 2, got ${r.status}`);
    assert.deepEqual(r.writes, [], `${file} wrote ${r.writes.join(', ')} while refusing`);
    // Exit 2 alone was not enough. Deleting the --project gate let it fall
    // through to initAdmin() and refuse at the NEXT check with the same exit
    // code, suite green — while the comment above claimed to catch exactly
    // that. Refusing BEFORE connecting is the actual contract.
    assert.equal(r.connected, false,
      `${file} connected before refusing ${refusesWithout.join(' ')} — its first gate is gone ` +
      `and a later check is covering for it`);
  });
}

// ---------------------------------------------------------------------------
// Behavioural checks (issue #161).
//
// Everything above is structural: it reads source and asserts shapes. That
// left the two guarantees these scripts actually rest on unasserted, with
// only comments holding them up:
//
//   - they refuse to run without SA_KEY, and refuse a key for another
//     project;
//   - they write nothing without --apply.
//
// Deleting any of those checks left the whole suite green, which is how three
// scripts kept a silent fallback to a hardcoded production key for as long as
// they did. These run the scripts for real against a recording stub.
//
// ISOLATION. This is the part to be careful about, because CI runs this file
// and it spawns production scripts, some with --apply. The first version
// hooked the literal string 'firebase-admin' only, and review showed two
// spellings that loaded the REAL SDK straight through it:
// `require('firebase-admin/app')`, and
// `require(require.resolve('firebase-admin', { paths }))` — the second being
// this repo's own idiom in scripts/ops/_firestore.js. With ADC present on the
// box, a script using either could have reached production from a test run.
//
// So interception is by RESOLVED PATH, not by specifier: anything resolving
// inside firebase-admin, @google-cloud/firestore or google-auth-library is
// replaced. Every credential-bearing environment variable is blanked in the
// child, not just SA_KEY. And the stub records a marker on load which the
// tests assert whenever a script connected, so a future bypass shows up as a
// missing marker rather than as a silent real connection.

const STUB = (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seedguard-stub-'));
  fs.writeFileSync(path.join(dir, 'preload.js'), `
    const Module = require('module');
    const fs = require('fs');
    const path = require('path');
    const LOG = process.env.SEEDGUARD_CALLS;
    const rec = (n) => { try { fs.appendFileSync(LOG, n + '\\n'); } catch {} };
    rec('__preload_ran');

    // Reads answer plausibly so a script gets past its first query; every
    // other member records its own name and returns itself.
    // Records a member only when it is CALLED, not when it is read. The
    // first version recorded every property access, so reading a document
    // field — status, round, uids — looked identical to calling a method,
    // and the field names of the whole schema had to be allowlisted.
    const mk = (name) => new Proxy(function () {}, {
      get(_t, k) {
        if (k === 'then') return undefined;
        if (k === 'empty') return false;
        if (k === 'size') return 1;
        if (k === 'docs') return [];
        if (k === 'exists') return true;
        if (k === 'uid') return 'stub-uid';
        if (typeof k !== 'string') return undefined;
        return mk(String(k));
      },
      apply(_t, _this, args) {
        if (name) rec(name);
        const a = args.find((x) => typeof x === 'string');
        if (a) rec('arg:' + a);
        return mk(null);
      },
    });
    const handle = mk(null);
    const statics = {
      Timestamp: { fromDate: (d) => d, now: () => ({}) },
      FieldValue: { serverTimestamp: () => ({}), delete: () => ({}), increment: () => ({}), arrayUnion: () => ({}), arrayRemove: () => ({}) },
      FieldPath: { documentId: () => ({}) },
    };
    const connect = (n) => (...args) => {
      rec(n);
      const a = args.find((x) => typeof x === 'string');
      if (a) rec('arg:' + a);
      return handle;
    };
    // One object serving every firebase-admin entry point: the classic
    // namespace, firebase-admin/app, and firebase-admin/firestore.
    const admin = {
      apps: [], getApps: () => [], getApp: connect('getApp'),
      initializeApp: (...a) => { rec('initializeApp'); return {}; },
      cert: () => { rec('cert'); return {}; },
      applicationDefault: () => { rec('applicationDefault'); return {}; },
      credential: {
        cert: () => { rec('cert'); return {}; },
        applicationDefault: () => { rec('applicationDefault'); return {}; },
      },
      auth: connect('auth'), getAuth: connect('getAuth'),
      getFirestore: connect('getFirestore'),
      firestore: Object.assign(connect('firestore'), statics),
      Firestore: Object.assign(connect('Firestore'), statics),
      ...statics,
    };

    // By resolved path, so every specifier spelling lands here — including
    // require('firebase-admin/app') and an absolute path from require.resolve.
    const STUBBED = /[\\\\/](firebase-admin|@google-cloud[\\\\/]firestore|google-auth-library)([\\\\/]|$)/;
    const orig = Module._load;
    // The marker is recorded HERE, where interception actually happens, not
    // at preload time. Review neutered these two returns, left a
    // preload-time marker in place, and the subject loaded the real SDK
    // while the test still saw a healthy marker and an empty call list: the
    // refusal assertions then passed vacuously with a live SDK. A marker
    // proving only that the preload ran proves nothing about isolation.
    const intercept = () => { rec('__stub_served'); return admin; };
    Module._load = function (req, parent, isMain) {
      if (/^(firebase-admin|@google-cloud\\/firestore|google-auth-library)(\\/|$)/.test(req)) return intercept();
      try {
        const resolved = Module._resolveFilename(req, parent, isMain);
        if (STUBBED.test(resolved)) return intercept();
      } catch {}
      return orig.apply(this, arguments);
    };
  `);
  const key = (project) => {
    const p = path.join(dir, `${project}.json`);
    fs.writeFileSync(p, JSON.stringify({
      project_id: project, client_email: 'stub@example.invalid', private_key: '-',
    }));
    return p;
  };
  const stub = {
    dir,
    preload: path.join(dir, 'preload.js'),
    rightKey: key('f1-app-18077'),
    wrongKey: key('some-other-project'),
    out: path.join(dir, 'out.json'),
  };
  // The first version leaked one of these per run; 176 had accumulated on the
  // build box, each holding two files shaped like service-account keys.
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  return stub;
})();

// Every credential the child could otherwise pick up on its own. SA_KEY alone
// was not enough: GOOGLE_APPLICATION_CREDENTIALS and the gcloud ADC default
// are both present on the build box.
const BLANK_CREDS = {
  SA_KEY: '', PLAY_SA_KEY: '', GOOGLE_APPLICATION_CREDENTIALS: '',
  GCLOUD_PROJECT: '', GOOGLE_CLOUD_PROJECT: '', FIREBASE_CONFIG: '',
  FIRESTORE_EMULATOR_HOST: '', GCLOUD_CREDENTIALS: '',
  // HOME and the gcloud config roots too. The ADC file under ~/.config/gcloud
  // on this box is a service_account carrying a private_key, not a user
  // refresh token, and it stayed readable by every spawned script. Nothing in
  // the tree reaches it without hand-rolling OAuth — but a script being
  // unable to is the point of this harness.
  HOME: STUB.dir, USERPROFILE: STUB.dir,
  CLOUDSDK_CONFIG: path.join(STUB.dir, 'gcloud'),
  XDG_CONFIG_HOME: path.join(STUB.dir, 'config'),
};

// Reads, and the plumbing around them. Anything a script calls that is NOT
// here counts as a write.
//
// An allowlist rather than a list of write verbs, because the list of write
// verbs was wrong: it named seven, and a script doing recursiveDelete(),
// auth().deleteUser() and bulkWriter() with no --apply gate at all passed
// green. A new Firestore method is now a test failure asking for a decision,
// which is the safe direction for this to be wrong in.
const READ_ONLY_CALLS = new Set([
  'initializeApp', 'cert', 'applicationDefault', 'firestore',
  'getFirestore', 'Firestore', 'getApp', 'auth', 'getAuth', 'settings',
  'collection', 'collectionGroup', 'doc', 'get', 'where', 'orderBy', 'limit',
  'limitToLast', 'select', 'offset', 'startAt', 'startAfter', 'endAt',
  'endBefore', 'count', 'listDocuments', 'listCollections', 'batch',
  'bulkWriter', 'getUserByEmail', 'getUser', 'getUsers', 'listUsers',
  'verifyIdToken', 'forEach', 'map', 'filter', 'then', 'catch', 'finally',
  'toDate', 'toMillis', 'data',
  // Invoked by the JS runtime itself — string interpolation, JSON.stringify —
  // not by the script reaching for Firestore.
  'toString', 'valueOf', 'toJSON', 'inspect', 'constructor',
]);

// `arg:` rows are recorded arguments and `__` rows are this harness's own
// bookkeeping; neither is something the script called.
const isWrite = (c) => !c.startsWith('arg:') && !c.startsWith('__') && !READ_ONLY_CALLS.has(c);

/**
 * Run a script for real with firebase-admin stubbed, and report what it did.
 *
 * `inTemp` copies the transpiled subject to a scratch directory with a fake
 * serviceAccountKey.json beside it, for scripts whose only relative
 * dependency is that key. It lets the --apply path actually be exercised, and
 * it stops the suite depending on whether the real key happens to be on the
 * machine — which made one test fail on the build box and pass everywhere else.
 */
function runRecorded(file, argv = [], env = {}, { inTemp = false, fixtures = {} } = {}) {
  const log = path.join(STUB.dir, `calls-${process.pid}-${Math.random().toString(36).slice(2)}.log`);
  fs.writeFileSync(log, '');
  const abs = path.join(ROOT, file);
  let runFile = abs;
  let scratch = null;
  const cleanup = [];

  if (abs.endsWith('.ts') || inTemp) {
    const js = abs.endsWith('.ts')
      ? ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
        }).outputText
      : fs.readFileSync(abs, 'utf8');
    if (inTemp) {
      scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'seedguard-run-'));
      runFile = path.join(scratch, 'subject.js');
      fs.writeFileSync(runFile, js);
      const fakeKey = JSON.stringify({ project_id: 'f1-app-18077', client_email: 'stub@example.invalid', private_key: '-' });
      fs.writeFileSync(path.join(scratch, 'serviceAccountKey.json'), fakeKey);
      // Some seeders resolve the key by a built path rather than a sibling.
      fs.mkdirSync(path.join(scratch, 'functions'), { recursive: true });
      fs.writeFileSync(path.join(scratch, 'serviceAccount.json'), fakeKey);
      // Data modules the subject imports. Without these it dies before
      // reaching a write, and "wrote nothing" would be true but meaningless.
      for (const [name, body] of Object.entries(fixtures)) {
        fs.writeFileSync(path.join(scratch, name), body);
      }
      cleanup.push(() => fs.rmSync(scratch, { recursive: true, force: true }));
    } else {
      // Next to the original so relative requires resolve identically. The
      // leading dot keeps it out of the op-script scan, and .gitignore has it
      // so an interrupted run cannot leave it stageable.
      runFile = path.join(path.dirname(abs),
        `.seedguard-subject-${process.pid}-${Math.random().toString(36).slice(2)}.js`);
      fs.writeFileSync(runFile, js);
      cleanup.push(() => fs.rmSync(runFile, { force: true }));
    }
  }

  try {
    const r = require('node:child_process').spawnSync(
      process.execPath, ['-r', STUB.preload, runFile, ...argv],
      {
        cwd: scratch ?? ROOT, encoding: 'utf8', timeout: 25000, killSignal: 'SIGKILL',
        env: { ...process.env, ...BLANK_CREDS, SEEDGUARD_CALLS: log, ...env },
      }
    );
    const calls = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
    return {
      status: r.status,
      out: (r.stdout || '') + (r.stderr || ''),
      calls,
      args: calls.filter((c) => c.startsWith('arg:')).map((c) => c.slice(4)),
      // Served, not merely loaded: proof the hook actually substituted.
      stubServed: calls.includes('__stub_served'),
      connected: calls.includes('initializeApp'),
      writes: calls.filter(isWrite),
    };
  } finally {
    fs.rmSync(log, { force: true });
    for (const c of cleanup) { try { c(); } catch {} }
  }
}

// Two scripts validate their arguments before looking at the key. Without
// these they print usage and exit, and the refusal assertions would pass
// without ever reaching the credential code. The assertions below match the
// scripts' exact refusal sentences, so if any other script starts doing the
// same it fails and says so rather than going quietly hollow.
const ARGS_TO_REACH_CREDENTIALS = {
  'exportPitwallHistory.js': [STUB.out],
  'verifyRaceScoring.js': ['bahrain_2026'],
};

const NO_KEY = /SA_KEY must point at/;
const WRONG_PROJECT = /[Rr]efusing to run|key is for project/;

for (const { file } of OP_SCRIPTS) {
  const base = path.basename(file);
  const args = ARGS_TO_REACH_CREDENTIALS[base] ?? [];

  test(`${file}: refuses to run without SA_KEY, and refuses another project's key`, () => {
    // Exact sentences, not loose words. A probe script with no project check
    // at all passed the first version of this, because its help text
    // contained "SA_KEY" and its output contained the word "expected".
    const none = runRecorded(file, args);
    assert.match(none.out, NO_KEY,
      `${file} without SA_KEY should refuse with "SA_KEY must point at ...", got: ` +
      `${none.out.slice(0, 200)} — if it printed usage, it validates arguments first ` +
      `and needs an entry in ARGS_TO_REACH_CREDENTIALS, or this proves nothing`);
    assert.equal(none.connected, false, `${file} initialised admin with no SA_KEY`);
    assert.deepEqual(none.writes, [], `${file} wrote ${none.writes.join(', ')} with no SA_KEY`);

    const wrong = runRecorded(file, args, { SA_KEY: STUB.wrongKey });
    assert.match(wrong.out, WRONG_PROJECT,
      `${file} accepted a key for some-other-project; got: ${wrong.out.slice(0, 200)}`);
    assert.equal(wrong.connected, false, `${file} initialised admin with another project's key`);
    assert.deepEqual(wrong.writes, [], `${file} wrote ${wrong.writes.join(', ')} on a wrong-project key`);

    // The control: without it the two assertions above also pass on a script
    // that refuses everything, or that this harness cannot start at all.
    const right = runRecorded(file, args, { SA_KEY: STUB.rightKey });
    assert.doesNotMatch(right.out, NO_KEY,
      `${file} refused the correct key as if it were missing, so the refusals above prove nothing`);
    assert.doesNotMatch(right.out, /[Rr]efusing to run: key is for project|Cannot run[^\n]*expected/,
      `${file} refused the correct project too, so the project check above is not evidence`);
    assert.ok(right.stubServed,
      `${file} never received the stub for firebase-admin — it may have loaded the real SDK`);
  });
}

// The --apply gate. Only meaningful for the scripts this harness can drive
// into a write: one whose work is a loop over query results does nothing
// here, because the stub returns no documents, and its dry-run assertion
// passes without proving anything. The floor test below is what stops that
// set shrinking unnoticed.
const applyGateCoverage = [];

for (const { file } of OP_SCRIPTS) {
  const base = path.basename(file);
  const args = ARGS_TO_REACH_CREDENTIALS[base] ?? [];

  test(`${file}: writes nothing without --apply`, () => {
    const dry = runRecorded(file, args, { SA_KEY: STUB.rightKey });
    const apply = runRecorded(file, [...args, '--apply'], { SA_KEY: STUB.rightKey });
    if (apply.writes.length > 0) applyGateCoverage.push(base);
    assert.deepEqual(dry.writes, [],
      `${file} called ${dry.writes.join(', ')} without --apply. If one of those is a ` +
      `read, add it to READ_ONLY_CALLS; otherwise it is an ungated write`);
  });
}

test('the --apply gate is actually exercised on some scripts', () => {
  // Every check above passes trivially if the stub can no longer drive any
  // script into a write. This is the floor that makes the set mean something.
  // It certifies only the scripts named; the rest are covered structurally.
  assert.ok(applyGateCoverage.length >= 2,
    `the --apply gate is only demonstrated on ${applyGateCoverage.length} script(s) ` +
    `(${applyGateCoverage.join(', ') || 'none'}); the per-script checks are passing vacuously`);
});

// runSeed writes drivers, constructors, races and seasons. `races` is the
// collection Track Limits settles money against, so an ungated run is the
// worst case in this tree — and it had no behavioural test at all: forcing
// always-apply stayed green.
// One row of each kind, so the seeding loops actually execute. With the
// empty arrays the old harness supplied, every loop body was skipped and
// "wrote nothing" was true of a script that never tried.
const SEED_FIXTURE = `const RACE = {
  id: 'r1', round: 1, name: 'Stub GP', date: '2026-01-01T00:00:00Z',
  circuit: 'Stub Circuit', country: 'Stubland', status: 'upcoming',
  // seedRaces reads race.schedule.fp1 directly. Without it the fixture threw
  // and only the drivers and constructors writes were ever recorded — the
  // races and seasons paths, the ones worth guarding, never ran at all.
  schedule: {
    fp1: '2026-01-01T09:00:00Z', fp2: '2026-01-01T13:00:00Z',
    fp3: '2026-01-02T09:00:00Z', qualifying: '2026-01-02T13:00:00Z',
    sprintQualifying: null, sprint: null, race: '2026-01-03T13:00:00Z',
  },
};
module.exports = {
  drivers2026: [{ id: 'd1', name: 'Stub Driver', price: 1, team: 't1' }],
  constructors2026: [{ id: 't1', name: 'Stub Team', price: 1 }],
  races2025: [RACE], races2026: [RACE],
  season2025: { id: 's2025', year: 2025 },
  season2026: { id: 's2026', year: 2026 },
};`;

for (const file of ['scripts/runSeed.ts']) {
  test(`${file}: seeds nothing without --apply`, () => {
    const dry = runRecorded(file, [], {}, {
      inTemp: true, fixtures: { 'seedData.js': SEED_FIXTURE },
    });
    // Non-vacuity: the run has to have got far enough to try. runSeed writes
    // drivers, constructors, races and seasons; `races` is what Track Limits
    // settles money against, so an ungated run here is the worst case in the
    // tree — and it had no behavioural test at all.
    const apply = runRecorded(file, ['--apply'], {}, {
      inTemp: true, fixtures: { 'seedData.js': SEED_FIXTURE },
    });
    assert.ok(apply.writes.length > 0,
      `${file} wrote nothing even WITH --apply, so the dry-run check below proves ` +
      `nothing. The harness can no longer drive it: ${apply.out.slice(0, 200)}`);
    // Specifically the races path. The first fixture omitted race.schedule,
    // so seedRaces threw and only drivers/constructors were ever exercised —
    // the control passed while the collection this is actually about was
    // never reached.
    assert.ok(apply.args.includes('races'),
      `${file} never reached the races write under --apply (collections touched: ` +
      `${apply.args.join(', ')}), so the dry-run check does not cover it`);
    assert.deepEqual(dry.writes, [],
      `${file} called ${dry.writes.join(', ')} without --apply`);
  });
}

// The argv contract, which has broken twice. The run guard once consumed
// --apply while main() still read argv[2], so the documented
// `setAdminClaim.ts <email>` form granted nothing; and a second email used to
// be dropped in silence.
test('scripts/setAdminClaim.ts: the email is found wherever it sits in argv', () => {
  // Asserting WHICH address is acted on, not merely that something happened.
  // The previous version checked only that the run reached the credential, so
  // reverting targetEmail() to process.argv[2] — the exact regression its own
  // message named — left it green, because '--apply' was then accepted as the
  // email and still reached the credential.
  for (const argv of [
    ['a@example.invalid'],
    ['a@example.invalid', '--apply'],
    ['--apply', 'a@example.invalid'],
  ]) {
    const r = runRecorded('scripts/setAdminClaim.ts', argv, {}, { inTemp: true });
    const acted = [...r.args, r.out].join(' ');
    assert.match(acted, /a@example\.invalid/,
      `setAdminClaim ${argv.join(' ')} did not act on the address given; saw ${JSON.stringify(r.args)}`);
    assert.ok(!r.args.includes('--apply'),
      `setAdminClaim ${argv.join(' ')} passed --apply to firebase as the account`);
  }
});

test('scripts/setAdminClaim.ts: refuses two emails rather than silently using one', () => {
  const r = runRecorded('scripts/setAdminClaim.ts', ['a@example.invalid', 'b@example.invalid'], {}, { inTemp: true });
  assert.equal(r.status, 2, 'setAdminClaim must refuse more than one email with exit 2');
  assert.equal(r.connected, false, 'setAdminClaim connected before rejecting the second email');
});

test('the destructive TS scripts connect to nothing on a dry run', () => {
  for (const file of ['scripts/deleteTsunoda.ts', 'scripts/setAdminClaim.ts']) {
    const r = runRecorded(file, [], {}, { inTemp: true });
    assert.equal(r.connected, false, `${file} initialised admin on a dry run`);
    assert.deepEqual(r.writes, [], `${file} wrote ${r.writes.join(', ')} on a dry run`);
    assert.match(r.out, /dry run/i, `${file} should say it is a dry run; got: ${r.out.slice(0, 160)}`);
  }
});
