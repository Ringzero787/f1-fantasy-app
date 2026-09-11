// Snapshot Firestore documents or collections to a JSON file — the `backup`
// step of aidlc op data kinds. Read-only against Firestore.
//
// Usage: node scripts/ops/firestore-backup.js --out=<file.json> <path>[,<path>…] …
//   A path with an even number of segments is a document (ben_lines/madrid_2026_race);
//   odd is a whole collection (fantasyTeams). A document that does not exist is
//   recorded as absent, so a restore deletes what the operation created.
// An existing --out file is never overwritten (it is the older, pre-operation
// state); the new snapshot is written next to it with a timestamp suffix.
// Credentials: GOOGLE_APPLICATION_CREDENTIALS or ADC. Project: FIRESTORE_PROJECT
// or f1-app-18077.
const fs = require('fs');
const path = require('path');
const { db, project, encode, parseArgs } = require('./_firestore');

async function main() {
  const { flags, rest } = parseArgs(process.argv.slice(2));
  const paths = rest.flatMap((p) => p.split(',')).map((p) => p.trim()).filter(Boolean);
  if (typeof flags.out !== 'string' || !paths.length) throw new Error('usage: firestore-backup.js --out=<file.json> <document-or-collection path>…');

  const docs = {};
  for (const p of paths) {
    if (p.split('/').filter(Boolean).length % 2 === 0) {
      const snap = await db.doc(p).get();
      docs[p] = snap.exists ? encode(snap.data()) : null;
    } else {
      const snap = await db.collection(p).get();
      for (const d of snap.docs) docs[d.ref.path] = encode(d.data());
    }
  }

  let out = flags.out;
  if (fs.existsSync(out)) out = out.replace(/(\.json)?$/, `.${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ project, taken_at: new Date().toISOString(), paths, docs }, null, 1));
  const present = Object.values(docs).filter(Boolean).length;
  console.log(`backed up ${present} document(s), ${Object.keys(docs).length - present} absent, from ${paths.join(' ')} → ${out}`);
}

main().catch((e) => { console.error(`firestore-backup: ${e.message}`); process.exit(1); });
