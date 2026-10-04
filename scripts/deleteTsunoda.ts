/**
 * Delete Tsunoda from Firestore
 *
 * Run:
 *   npx ts-node scripts/deleteTsunoda.ts
 */

import * as admin from 'firebase-admin';

// Nothing happens on import. This read the key, initialised firebase-admin
// and called deleteTsunoda() all at module scope, so requiring the file
// deleted a production document. It also needs --apply now: it is a delete,
// and deletes are not recoverable by re-running the script.
let db: admin.firestore.Firestore;
const EXPECTED_PROJECT = 'f1-app-18077';
let projectId = '';

function initAdmin(): void {
  let serviceAccount;
  try {
    serviceAccount = require('./serviceAccountKey.json');
  } catch {
    console.error('Error: could not read scripts/serviceAccountKey.json');
    console.log('\nFirebase Console > Project Settings > Service Accounts > "Generate new private key",');
    console.log('saved as scripts/serviceAccountKey.json (it is gitignored).');
    process.exit(1);
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  db = admin.firestore();
  projectId = serviceAccount.project_id;
  // It printed the target project but ran against any of them. An
  // unrecoverable production delete had a weaker bar than cleanAll, which
  // refuses on a project mismatch.
  if (projectId !== EXPECTED_PROJECT) {
    console.error(`Refusing to run: key is for project ${projectId}, expected ${EXPECTED_PROJECT}.`);
    process.exit(2);
  }
}

async function deleteTsunoda() {
  console.log('\n🏎️  F1 Fantasy - Delete Tsunoda Script\n');
  console.log('Target Project:', projectId);
  console.log('-----------------------------------\n');

  try {
    // Check if tsunoda exists
    const tsunodaRef = db.collection('drivers').doc('tsunoda');
    const tsunodaDoc = await tsunodaRef.get();

    if (tsunodaDoc.exists) {
      console.log('Found Tsunoda document:', tsunodaDoc.data()?.name);
      await tsunodaRef.delete();
      console.log('✓ Deleted Tsunoda from drivers collection');
    } else {
      console.log('Tsunoda document not found in drivers collection');
    }

    // Also check for any other variations
    const driversSnapshot = await db.collection('drivers').get();
    console.log(`\nCurrent drivers in Firestore (${driversSnapshot.size}):`);
    driversSnapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${doc.id}: ${data.name}`);
    });

    console.log('\n✅ Done!\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

if (require.main === module) {
  if (process.argv.includes('--apply')) {
    initAdmin();
    deleteTsunoda();
  } else {
    console.log('deleteTsunoda: dry run. This DELETES the Tsunoda driver document from');
    console.log('production Firestore. Re-run with --apply if you mean it.');
    console.log('A delete belongs in an `aidlc op`, which takes a backup first.');
  }
}
