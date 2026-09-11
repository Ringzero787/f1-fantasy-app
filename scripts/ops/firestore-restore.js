// Restore documents from a firestore-backup.js snapshot — the `rollback` step
// of aidlc op data kinds.
//
// Usage: node scripts/ops/firestore-restore.js --from=<backup.json> [--write]
// Without --write it lists what it would do. Documents that existed are
// overwritten with their backed-up contents (no merge); documents recorded as
// absent are deleted. Documents that appeared later in a backed-up collection
// are left alone — other users may have created them.
const fs = require('fs');
const { db, project, decode, parseArgs } = require('./_firestore');

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (typeof flags.from !== 'string') throw new Error('usage: firestore-restore.js --from=<backup.json> [--write]');
  const backup = JSON.parse(fs.readFileSync(flags.from, 'utf8'));
  if (backup.project !== project) throw new Error(`backup is from ${backup.project}, target is ${project}`);

  const entries = Object.entries(backup.docs);
  for (const [p, data] of entries) console.log(`${data === null ? 'delete   ' : 'overwrite'} ${p}`);
  if (!flags.write) {
    console.log(`\nDRY RUN — ${entries.length} document(s) from the backup taken ${backup.taken_at}; pass --write to restore`);
    return;
  }
  let batch = db.batch();
  let n = 0;
  for (const [p, data] of entries) {
    if (data === null) batch.delete(db.doc(p));
    else batch.set(db.doc(p), decode(data));
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`restored ${n} document(s) from ${flags.from}`);
}

main().catch((e) => { console.error(`firestore-restore: ${e.message}`); process.exit(1); });
