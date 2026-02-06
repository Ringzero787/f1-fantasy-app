/**
 * Delete Tsunoda from Firestore
 *
 * Run:
 *   npx ts-node scripts/deleteTsunoda.ts
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function deleteTsunoda() {
  console.log('\n🏎️  F1 Fantasy - Delete Tsunoda Script\n');
  console.log('Target Project:', serviceAccount.project_id);
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

deleteTsunoda();
