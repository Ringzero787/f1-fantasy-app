/**
 * Firestore Seed Script
 *
 * This script uploads all seed data to your production Firestore database.
 *
 * Setup:
 * 1. Go to Firebase Console > Project Settings > Service Accounts
 * 2. Click "Generate New Private Key" and download the JSON file
 * 3. Save it as `scripts/serviceAccountKey.json`
 *
 * Run:
 *   npx ts-node scripts/runSeed.ts            # dry run, writes nothing
 *   npx ts-node scripts/runSeed.ts --apply    # writes to production
 *
 * Prefer an `aidlc op` over either. This writes collections that ingestion
 * maintains and that Track Limits settles real currency against.
 */

import * as admin from 'firebase-admin';
import { drivers2026, constructors2026, races2025, season2025 } from './seedData';

// Nothing happens on import, and nothing is written without --apply. This file
// used to read a service-account key, initialise firebase-admin and call
// main() all at module scope, so running it — or merely importing it — wrote
// production immediately. Its sibling functions/src/seedData.ts had the same
// shape and was guarded the same way.
//
// Note what it writes: races2025 and season2025, the 2025 season. The `races`
// collection it writes into is maintained by Undercut's ingestion, and Track
// Limits settles against it, so a stray run is not a local inconvenience.
let db: admin.firestore.Firestore;

function initAdmin(): void {
  let serviceAccount;
  try {
    serviceAccount = require('./serviceAccountKey.json');
  } catch {
    // Match the sibling's behaviour: say what is missing and how to get it,
    // rather than letting a raw MODULE_NOT_FOUND stack out.
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
  // Echoed here rather than in main(), so the project being written to is
  // named by the same code that picked it.
  console.log('Target Project:', serviceAccount.project_id);
}

async function seedDrivers() {
  console.log('Seeding drivers...');
  const batch = db.batch();

  for (const driver of drivers2026) {
    const ref = db.collection('drivers').doc(driver.id);
    batch.set(ref, driver);
  }

  await batch.commit();
  console.log(`✓ Seeded ${drivers2026.length} drivers`);
}

async function seedConstructors() {
  console.log('Seeding constructors...');
  const batch = db.batch();

  for (const constructor of constructors2026) {
    const ref = db.collection('constructors').doc(constructor.id);
    batch.set(ref, constructor);
  }

  await batch.commit();
  console.log(`✓ Seeded ${constructors2026.length} constructors`);
}

async function seedRaces() {
  console.log('Seeding races...');

  // Firestore batches have a limit of 500 operations
  // We'll do them individually for races since they have nested data
  for (const race of races2025) {
    const raceData = {
      ...race,
      schedule: {
        fp1: race.schedule.fp1,
        fp2: race.schedule.fp2 || null,
        fp3: race.schedule.fp3 || null,
        sprintQualifying: race.schedule.sprintQualifying || null,
        sprint: race.schedule.sprint || null,
        qualifying: race.schedule.qualifying,
        race: race.schedule.race,
      },
    };

    await db.collection('races').doc(race.id).set(raceData);
  }

  console.log(`✓ Seeded ${races2025.length} races`);
}

async function seedSeason() {
  console.log('Seeding season...');

  await db.collection('seasons').doc(season2025.id).set(season2025);

  console.log(`✓ Seeded season ${season2025.id}`);
}

async function main() {
  initAdmin();
  console.log('\n🏎️  F1 Fantasy - Firestore Seed Script\n');
  console.log('-----------------------------------\n');

  try {
    await seedDrivers();
    await seedConstructors();
    await seedRaces();
    await seedSeason();

    console.log('\n✅ All data seeded successfully!\n');
  } catch (error) {
    console.error('\n❌ Error seeding data:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run only when executed directly, and only when told to. A bare
// `npx ts-node scripts/runSeed.ts` now reports what it would overwrite and
// writes nothing.
if (require.main === module) {
  if (process.argv.includes('--apply')) {
    main();
  } else {
    console.log('runSeed: dry run. This script WRITES to production Firestore (f1-app-18077).');
    console.log('  drivers      <- drivers2026');
    console.log('  constructors <- constructors2026');
    console.log('  races        <- races2025   ← the 2025 season, not the current one');
    console.log('  seasons      <- season2025');
    console.log('The races collection is maintained by ingestion and Track Limits settles');
    console.log('garage cash against it. Seeding or repairing it belongs in an `aidlc op`.');
    console.log('Re-run with --apply if you really mean to write.');
  }
}
