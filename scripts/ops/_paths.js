// Validation shared by the aidlc op helper scripts: a value an operator passes as
// a --param must not reach Firestore paths or script files outside the ones the
// operation is meant for. Pure — no Firestore access.

// One path segment: letters, digits and a few punctuation marks; never . or ..
const SEGMENT = /^[A-Za-z0-9_.:@+-]+$/;

function validFirestorePath(p) {
  const segs = String(p).split('/');
  return segs.every((s) => SEGMENT.test(s) && s !== '.' && s !== '..');
}

// True when document path `p` is one of `roots` or lies inside one (a collection root).
function withinRoots(p, roots) {
  return roots.some((r) => p === r || p.startsWith(`${r}/`));
}

// A plain script file name: no directories, no leading dot, no shell metacharacters.
function validScriptName(name) {
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(c|m)?js$/.test(String(name));
}

// F-154: a path list kept in a file (one path per line, blank lines and # comments ignored), so an
// op's backup and rollback read the exact list its dry run wrote instead of a pasted parameter.
function readPathsFile(file) {
  const fs = require('fs');
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

// F-154: which database an op helper talks to, decided from its command line and environment, never
// from the environment alone. The Admin SDK silently switches to the emulator whenever
// FIRESTORE_EMULATOR_HOST is set, so a variable left over from a rehearsal would make a production
// backup read the emulator, and a rehearsal rollback without it would write production.
//   no flag, no variable          → production
//   --emulator=HOST:PORT (loopback) → the emulator; the variable, if set, must say the same
//   the variable without the flag → refused
function firestoreTarget(argv, env) {
  const flag = argv.find((a) => a === '--emulator' || a.startsWith('--emulator='));
  const host = env.FIRESTORE_EMULATOR_HOST || '';
  if (!flag) {
    return host
      ? { error: `FIRESTORE_EMULATOR_HOST is set (${host}) but --emulator was not given. Unset it to reach production, or pass --emulator=${host} to use the emulator.` }
      : { target: 'production' };
  }
  const want = flag.slice('--emulator='.length);
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/.test(want)) return { error: `--emulator must be a loopback HOST:PORT, not ${JSON.stringify(want)}` };
  if (host && host !== want) return { error: `--emulator=${want} but FIRESTORE_EMULATOR_HOST is ${host}` };
  return { target: 'emulator', host: want };
}

module.exports = { validFirestorePath, withinRoots, validScriptName, readPathsFile, firestoreTarget };
