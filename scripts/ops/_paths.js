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

module.exports = { validFirestorePath, withinRoots, validScriptName };
