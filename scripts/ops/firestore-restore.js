// Restore documents from a firestore-backup.js snapshot — the `rollback` step
// of aidlc op data kinds.
//
// Usage: node scripts/ops/firestore-restore.js --from=<backup.json> --only=<path>[,<path>…] [--write]
// Without --write it lists what it would do. Documents that existed are
// overwritten with their backed-up contents (no merge); documents recorded as
// absent are deleted. --only names the documents/collections the operation
// touched (the rollback template passes the same paths the backup step took);
// any document in the backup outside them is refused, so a tampered or wrong
// backup file cannot reach other collections. Documents that appeared later in
// a backed-up collection are left alone — other users may have created them.
const fs = require('fs');
const { validFirestorePath, withinRoots } = require('./_paths');

// Pure: what a restore of `backup` would do, or why it is refused.
function planRestore(backup, only, project) {
  const badRoots = only.filter((r) => !validFirestorePath(r));
  if (badRoots.length) throw new Error(`not a plain Firestore path in --only: ${badRoots.join(', ')}`);
  if (backup.project !== project) throw new Error(`backup is from ${backup.project}, target is ${project}`);
  const entries = Object.entries(backup.docs || {});
  const outside = entries.map(([p]) => p).filter((p) => !validFirestorePath(p) || (only.length && !withinRoots(p, only)));
  if (outside.length) throw new Error(`backup names ${outside.length} document(s) outside --only, refusing: ${outside.slice(0, 5).join(', ')}`);
  return entries.map(([path, data]) => ({ path, action: data === null ? 'delete' : 'overwrite', data }));
}

async function main() {
  const { db, project, decode, parseArgs } = require('./_firestore');
  const { flags } = parseArgs(process.argv.slice(2));
  if (typeof flags.from !== 'string') throw new Error('usage: firestore-restore.js --from=<backup.json> --only=<paths> [--write]');
  const only = typeof flags.only === 'string' ? flags.only.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (flags.write && !only.length) throw new Error('--write needs --only=<the paths the operation touched>');

  const backup = JSON.parse(fs.readFileSync(flags.from, 'utf8'));
  const plan = planRestore(backup, only, project);
  const deletes = plan.filter((s) => s.action === 'delete').length;
  for (const s of plan) console.log(`${s.action.padEnd(9)} ${s.path}`);
  console.log(`${plan.length - deletes} overwrite(s), ${deletes} delete(s) from the backup taken ${backup.taken_at}`);
  if (!flags.write) { console.log('DRY RUN — pass --write to restore'); return; }
  let batch = db.batch();
  let n = 0;
  for (const s of plan) {
    if (s.action === 'delete') batch.delete(db.doc(s.path));
    else batch.set(db.doc(s.path), decode(s.data));
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`restored ${n} document(s) from ${flags.from}`);
}

module.exports = { planRestore };

if (require.main === module) {
  main().catch((e) => { console.error(`firestore-restore: ${e.message}`); process.exit(1); });
}
