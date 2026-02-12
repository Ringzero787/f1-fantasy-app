/**
 * Delete all fantasy teams, leagues, and transactions from Firestore
 *
 * Run:
 *   npx ts-node scripts/cleanAll.ts
 */

import * as admin from 'firebase-admin';

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function deleteCollection(collectionPath: string) {
  const snapshot = await db.collection(collectionPath).get();
  if (snapshot.empty) {
    console.log(`  ${collectionPath}: already empty`);
    return 0;
  }

  const batch = db.batch();
  let count = 0;
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    count++;
    // Firestore batches limited to 500
    if (count % 500 === 0) {
      await batch.commit();
    }
  }
  await batch.commit();
  console.log(`  ${collectionPath}: deleted ${count} documents`);
  return count;
}

async function deleteSubcollections(parentCollection: string, subcollection: string) {
  const parents = await db.collection(parentCollection).get();
  let total = 0;
  for (const parent of parents.docs) {
    const subSnap = await parent.ref.collection(subcollection).get();
    if (!subSnap.empty) {
      const batch = db.batch();
      subSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      total += subSnap.size;
    }
  }
  if (total > 0) {
    console.log(`  ${parentCollection}/*/  ${subcollection}: deleted ${total} documents`);
  }
  return total;
}

async function main() {
  console.log('\nF1 Fantasy - Clean All Data\n');
  console.log('Project:', serviceAccount.project_id);
  console.log('-----------------------------------\n');

  // Delete league subcollections first
  await deleteSubcollections('leagues', 'members');
  await deleteSubcollections('leagues', 'invites');

  // Delete main collections
  await deleteCollection('fantasyTeams');
  await deleteCollection('leagues');
  await deleteCollection('transactions');

  console.log('\nDone! All teams, leagues, and transactions deleted.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
