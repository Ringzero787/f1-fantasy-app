// Shared Firestore access for the aidlc op helper scripts in scripts/ops/.
// Uses the firebase-admin already installed for either functions codebase, so
// this directory needs no package.json of its own.
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadAdmin() {
  for (const dir of ['functions', 'newgame/functions']) {
    try {
      return require(require.resolve('firebase-admin', { paths: [path.join(ROOT, dir)] }));
    } catch {
      // try the next codebase
    }
  }
  throw new Error('firebase-admin is not installed in functions/ or newgame/functions/ — run npm ci there');
}

const admin = loadAdmin();
const project = process.env.FIRESTORE_PROJECT || 'f1-app-18077';
admin.initializeApp({ projectId: project });
const db = admin.firestore();

// JSON-safe values that round-trip Timestamps, document references and geopoints.
function encode(v) {
  if (v instanceof admin.firestore.Timestamp) return { __type: 'timestamp', seconds: v.seconds, nanoseconds: v.nanoseconds };
  if (v instanceof admin.firestore.DocumentReference) return { __type: 'ref', path: v.path };
  if (v instanceof admin.firestore.GeoPoint) return { __type: 'geopoint', latitude: v.latitude, longitude: v.longitude };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}

function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    if (v.__type === 'timestamp') return new admin.firestore.Timestamp(v.seconds, v.nanoseconds);
    if (v.__type === 'ref') return db.doc(v.path);
    if (v.__type === 'geopoint') return new admin.firestore.GeoPoint(v.latitude, v.longitude);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
  return v;
}

// --key=value flags plus positional arguments.
function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) flags[m[1]] = m[2] ?? true;
    else rest.push(a);
  }
  return { flags, rest };
}

module.exports = { admin, db, project, encode, decode, parseArgs };
