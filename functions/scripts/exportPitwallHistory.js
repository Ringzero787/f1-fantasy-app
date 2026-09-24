/**
 * READ-ONLY export of the collections the Pit Wall projection model may use
 * (workers/pitwall/src/model/inputs.ts: results, prices and our own game data;
 * never timing data, ADR-001) into one JSON file for the backtest.
 *
 *   SA_KEY=... node scripts/exportPitwallHistory.js /data/pitwall-scratch/cache/history.json
 *
 * It writes nothing to Firestore. The output path must be outside this public repository.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';
const COLLECTIONS = ['races', 'raceScores', 'priceHistory', 'drivers', 'constructors'];
const out = process.argv[2];
if (!out) { console.error('usage: exportPitwallHistory.js <output.json outside the repo>'); process.exit(2); }
const repo = path.resolve(__dirname, '..', '..');
if (path.resolve(out).startsWith(repo + path.sep)) { console.error('Refusing to write inside the repository.'); process.exit(2); }
const KEY = process.env.SA_KEY;
if (!KEY) { console.error('SA_KEY must point at the service-account key.'); process.exit(2); }
const cred = require(KEY);
if (cred.project_id !== EXPECTED_PROJECT) { console.error(`Refusing to run: key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}.`); process.exit(2); }
admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });

const plain = (o) => JSON.parse(JSON.stringify(o, (_k, v) => (v && typeof v === 'object' && typeof v.toDate === 'function' ? v.toDate().toISOString() : v)));
(async () => {
  const db = admin.firestore();
  const data = {};
  for (const c of COLLECTIONS) {
    const snap = await db.collection(c).get();
    data[c] = snap.docs.map((d) => ({ id: d.id, ...plain(d.data()) }));
    console.log(`${c}: ${snap.size}`);
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data));
  console.log(`wrote ${out}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
