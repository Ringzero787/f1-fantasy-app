/**
 * Delete all fantasy teams, leagues, and transactions from Firestore.
 *
 * This is the most destructive script in the repo. It removes every player's
 * team, every league and its membership, and the whole transaction history —
 * data that is not recoverable from source, unlike the seeders, which only
 * overwrite with known values.
 *
 * Run (no flags explains and touches nothing; --dry-run counts; --apply plus
 * a matching --project deletes):
 *   ts-node scripts/cleanAll.ts
 *   ts-node scripts/cleanAll.ts --dry-run
 *   ts-node scripts/cleanAll.ts --apply --project=<id>
 *
 * Note that `ts-node` is not a dependency of this repo and is not installed,
 * and Node 22 reparses a .ts file containing `import` as ESM, where `require`
 * is undefined — so the command above does not run as written today. That is
 * pre-existing and it fails safe, but it means the reachable path is a
 * CommonJS require of the transpiled file, which is what the guard below is
 * actually defending and what scripts/seedGuards.test.js exercises.
 *
 * Prefer an `aidlc op` over --apply either way. An op takes a backup first and
 * leaves a record; this script does neither.
 */

import * as admin from 'firebase-admin';

// Nothing happens on import, and nothing is deleted without two flags. This
// file used to read the service-account key, initialise firebase-admin and
// call main().catch() all at module scope, so `npx ts-node scripts/cleanAll.ts`
// — or merely importing it — deleted every team, league and transaction with
// no prompt. Its two seeder siblings had the same shape and were guarded the
// same way; this one gets a second flag because its damage cannot be undone by
// re-running it.
const TARGETS = [
  'leagues/*/members',
  'leagues/*/invites',
  'fantasyTeams',
  'leagues',
  'transactions',
];

let db: admin.firestore.Firestore;
let projectId = '';

function initAdmin(): void {
  let serviceAccount;
  try {
    serviceAccount = require('./serviceAccountKey.json');
  } catch {
    console.error('Error: could not read scripts/serviceAccountKey.json');
    console.log('\nTo get a service account key:');
    console.log('1. Firebase Console > Project Settings > Service Accounts');
    console.log('2. "Generate new private key"');
    console.log('3. Save it as scripts/serviceAccountKey.json (it is gitignored)');
    process.exit(1);
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  db = admin.firestore();
  projectId = serviceAccount.project_id;
  console.log('Project:', projectId);
}

async function countCollection(collectionPath: string): Promise<number> {
  const snapshot = await db.collection(collectionPath).get();
  return snapshot.size;
}

async function countSubcollections(parentCollection: string, subcollection: string): Promise<number> {
  const parents = await db.collection(parentCollection).get();
  let total = 0;
  for (const parent of parents.docs) {
    total += (await parent.ref.collection(subcollection).get()).size;
  }
  return total;
}

async function deleteCollection(collectionPath: string) {
  const snapshot = await db.collection(collectionPath).get();
  if (snapshot.empty) {
    console.log(`  ${collectionPath}: already empty`);
    return 0;
  }

  // One batch per 500 documents. The original reused a single batch object:
  // it committed at 500 and then kept calling delete() on the same, already
  // committed batch, which throws "Cannot modify a WriteBatch that has been
  // committed". So this never worked on a collection larger than 500 — it
  // deleted the first 500 and then died partway through. Latent until a
  // collection grew past that, and found while guarding the file.
  let batch = db.batch();
  let pending = 0;
  let count = 0;
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    pending++;
    count++;
    if (pending === 500) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  console.log(`  ${collectionPath}: deleted ${count} documents`);
  return count;
}

async function deleteSubcollections(parentCollection: string, subcollection: string) {
  const parents = await db.collection(parentCollection).get();
  let total = 0;
  for (const parent of parents.docs) {
    const subSnap = await parent.ref.collection(subcollection).get();
    if (subSnap.empty) continue;
    // Chunked for the same reason as deleteCollection. Fixing that one and
    // leaving this one would have been worse than fixing neither: the comment
    // above would have claimed the bug was dealt with while a league holding
    // more than 500 members still aborted the run partway through.
    let batch = db.batch();
    let pending = 0;
    for (const doc of subSnap.docs) {
      batch.delete(doc.ref);
      pending++;
      if (pending === 500) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
    if (pending > 0) await batch.commit();
    total += subSnap.size;
  }
  if (total > 0) {
    console.log(`  ${parentCollection}/*/${subcollection}: deleted ${total} documents`);
  }
  return total;
}

async function dryRun() {
  initAdmin();
  console.log('\nF1 Fantasy - Clean All Data (DRY RUN, nothing is deleted)\n');
  const members = await countSubcollections('leagues', 'members');
  const invites = await countSubcollections('leagues', 'invites');
  const teams = await countCollection('fantasyTeams');
  const leagues = await countCollection('leagues');
  const transactions = await countCollection('transactions');
  console.log(`  leagues/*/members : ${members}`);
  console.log(`  leagues/*/invites : ${invites}`);
  console.log(`  fantasyTeams      : ${teams}`);
  console.log(`  leagues           : ${leagues}`);
  console.log(`  transactions      : ${transactions}`);
  console.log(`\n  total             : ${members + invites + teams + leagues + transactions} documents would be deleted`);
  console.log(`\nTo delete them: --apply --project=${projectId}\n`);
  process.exit(0);
}

async function main() {
  initAdmin();
  console.log('\nF1 Fantasy - Clean All Data\n');
  console.log('-----------------------------------\n');

  await deleteSubcollections('leagues', 'members');
  await deleteSubcollections('leagues', 'invites');
  await deleteCollection('fantasyTeams');
  await deleteCollection('leagues');
  await deleteCollection('transactions');

  console.log('\nDone! All teams, leagues, and transactions deleted.\n');
  process.exit(0);
}

if (require.main === module) {
  const argv = process.argv;
  const named = (argv.find((a) => a.startsWith('--project=')) || '').split('=')[1] || '';

  if (argv.includes('--dry-run')) {
    dryRun().catch((err) => { console.error('Error:', err); process.exit(1); });
  } else if (argv.includes('--apply')) {
    // Two flags, not one. --apply alone is the right bar for a script that
    // overwrites known data; naming the project is the right bar for one that
    // destroys data nobody can regenerate. It also stops the obvious accident
    // of running this against the wrong project with the wrong key in place.
    if (!named) {
      console.error('Refusing to delete: --apply also needs --project=<id>, naming the project you mean to empty.');
      console.error('Run with --dry-run first to see the counts and the exact flag to use.');
      process.exit(2);
    }
    initAdmin();
    if (named !== projectId) {
      console.error(`Refusing to delete: --project=${named} does not match the key's project ${projectId}.`);
      process.exit(2);
    }
    main().catch((err) => { console.error('Error:', err); process.exit(1); });
  } else {
    console.log('cleanAll: no action taken. This script DELETES production data:');
    for (const t of TARGETS) console.log(`  ${t}`);
    console.log('\nIt removes every team, league, membership and transaction. That data is');
    console.log('not recoverable from source — unlike the seeders, which overwrite with');
    console.log('known values. There is no backup step here; an `aidlc op` would take one.');
    console.log('\n  --dry-run                  count what would be deleted');
    console.log('  --apply --project=<id>     delete it');
  }
}
