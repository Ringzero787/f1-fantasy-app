/**
 * Run this to get the Firestore composite index creation link
 *
 * Usage: npx ts-node scripts/getIndexLink.ts
 */

import * as admin from 'firebase-admin';

// Nothing happens on import. This read the key, initialised firebase-admin
// and called its entry point at module scope, so requiring the file
// connected to production and ran it.
// It only runs queries to surface Firestore index-creation links, so there is
// no --apply: reading is the whole job.
let db: admin.firestore.Firestore;

function initAdmin(): void {
  let serviceAccount;
  try {
    serviceAccount = require('./serviceAccountKey.json');
  } catch {
    console.error('Error: could not read scripts/serviceAccountKey.json (it is gitignored).');
    process.exit(1);
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  db = admin.firestore();
}

async function testQueries() {
  console.log('\n🔍 Testing Firestore queries to get index creation links...\n');

  // Test 1: Drivers query (isActive + orderBy price)
  console.log('Query 1: drivers where isActive==true orderBy price desc');
  try {
    const driversQuery = db.collection('drivers')
      .where('isActive', '==', true)
      .orderBy('price', 'desc');
    await driversQuery.get();
    console.log('✓ Query succeeded - index exists\n');
  } catch (error: any) {
    console.log('❌ Index needed. Create it here:');
    console.log(error.message);
    console.log('\n');
  }

  // Test 2: Drivers query (isActive + orderBy fantasyPoints)
  console.log('Query 2: drivers where isActive==true orderBy fantasyPoints desc');
  try {
    const topDriversQuery = db.collection('drivers')
      .where('isActive', '==', true)
      .orderBy('fantasyPoints', 'desc');
    await topDriversQuery.get();
    console.log('✓ Query succeeded - index exists\n');
  } catch (error: any) {
    console.log('❌ Index needed. Create it here:');
    console.log(error.message);
    console.log('\n');
  }

  // Test 3: Constructors query
  console.log('Query 3: constructors where isActive==true orderBy price desc');
  try {
    const constructorsQuery = db.collection('constructors')
      .where('isActive', '==', true)
      .orderBy('price', 'desc');
    await constructorsQuery.get();
    console.log('✓ Query succeeded - index exists\n');
  } catch (error: any) {
    console.log('❌ Index needed. Create it here:');
    console.log(error.message);
    console.log('\n');
  }

  // Test 4: Races query
  console.log('Query 4: races where seasonId==2025 orderBy round asc');
  try {
    const racesQuery = db.collection('races')
      .where('seasonId', '==', '2025')
      .orderBy('round', 'asc');
    await racesQuery.get();
    console.log('✓ Query succeeded - index exists\n');
  } catch (error: any) {
    console.log('❌ Index needed. Create it here:');
    console.log(error.message);
    console.log('\n');
  }

  // Test 5: Leagues public query
  console.log('Query 5: leagues where isPublic==true orderBy memberCount desc');
  try {
    const leaguesQuery = db.collection('leagues')
      .where('isPublic', '==', true)
      .orderBy('memberCount', 'desc');
    await leaguesQuery.get();
    console.log('✓ Query succeeded - index exists\n');
  } catch (error: any) {
    console.log('❌ Index needed. Create it here:');
    console.log(error.message);
    console.log('\n');
  }

  console.log('Done! Click any links above to create the required indexes.');
  process.exit(0);
}

if (require.main === module) {
  initAdmin();
  testQueries();
}
