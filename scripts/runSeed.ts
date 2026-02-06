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
 *   npx ts-node scripts/runSeed.ts
 */

import * as admin from 'firebase-admin';
import { drivers2026, constructors2026, races2025, season2025 } from './seedData';

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

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
  console.log('\n🏎️  F1 Fantasy - Firestore Seed Script\n');
  console.log('Target Project:', serviceAccount.project_id);
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

main();
