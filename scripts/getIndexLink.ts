/**
 * Run this to get the Firestore composite index creation link
 *
 * Usage: npx ts-node scripts/getIndexLink.ts
 */

import * as admin from 'firebase-admin';

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

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

testQueries();
