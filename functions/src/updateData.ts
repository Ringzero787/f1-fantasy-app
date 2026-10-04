/**
 * Firebase Update Utility
 * Run with: npx ts-node src/updateData.ts <command> [args]
 *
 * Commands:
 *   driver-price <driverId> <newPrice>    - Update a driver's price
 *   driver-points <driverId> <points>     - Update a driver's season points
 *   constructor-price <id> <newPrice>     - Update a constructor's price
 *   constructor-points <id> <points>      - Update constructor points
 *   race-status <raceId> <status>         - Update race status (upcoming/in_progress/completed)
 *   list-drivers                          - List all drivers with prices
 *   list-constructors                     - List all constructors with prices
 *   reset-points --apply                  - Reset all points to 0 (start of season)
 */

import * as admin from 'firebase-admin';
import * as path from 'path';

// Nothing happens on import, and that matters more here than in the sibling
// scripts: this file both calls main() at module scope AND exports its
// update functions for programmatic use. So importing it to call
// updateDriverPrice() also ran the CLI — and one of its commands is
// reset-points, which zeroes every score.
//
// initAdmin() is called from the CLI guard at the bottom. A programmatic
// caller must call it too; exported functions throw a clear error otherwise
// rather than failing obscurely on an undefined db.
let dbOrUndefined: admin.firestore.Firestore | undefined;

export function initAdmin(): void {
  const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
  try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error('Error: Could not find serviceAccountKey.json');
    console.log('Place your service account key in the functions/ folder');
    process.exit(1);
  }
  dbOrUndefined = admin.firestore();
}

function database(): admin.firestore.Firestore {
  // Self-initialising, so the credential is read at the moment a collection
  // is actually touched. The guard below used to pre-init on `argv.length >
  // 2`, which meant --help, an unknown command and the reset-points dry run
  // all demanded a service-account key and exited 1 before printing — the
  // opposite of what the comment claimed.
  if (!dbOrUndefined) initAdmin();
  if (!dbOrUndefined) throw new Error('updateData: initAdmin() did not produce a Firestore handle.');
  return dbOrUndefined;
}

// ============================================
// Update Functions
// ============================================

async function updateDriverPrice(driverId: string, newPrice: number) {
  const driverRef = database().collection('drivers').doc(driverId);
  const doc = await driverRef.get();

  if (!doc.exists) {
    console.error(`Driver "${driverId}" not found`);
    console.log('\nValid driver IDs:');
    const drivers = await database().collection('drivers').get();
    drivers.docs.forEach(d => console.log(`  - ${d.id}`));
    return;
  }

  const currentPrice = doc.data()?.price || 0;
  await driverRef.update({
    previousPrice: currentPrice,
    price: newPrice,
  });

  console.log(`✓ Updated ${doc.data()?.name}:`);
  console.log(`  Previous: ${currentPrice} → New: ${newPrice}`);
}

async function updateDriverPoints(driverId: string, points: number) {
  const driverRef = database().collection('drivers').doc(driverId);
  const doc = await driverRef.get();

  if (!doc.exists) {
    console.error(`Driver "${driverId}" not found`);
    return;
  }

  await driverRef.update({
    seasonPoints: points,
    fantasyPoints: points,
  });

  console.log(`✓ Updated ${doc.data()?.name} points to ${points}`);
}

async function updateConstructorPrice(constructorId: string, newPrice: number) {
  const ref = database().collection('constructors').doc(constructorId);
  const doc = await ref.get();

  if (!doc.exists) {
    console.error(`Constructor "${constructorId}" not found`);
    console.log('\nValid constructor IDs:');
    const constructors = await database().collection('constructors').get();
    constructors.docs.forEach(c => console.log(`  - ${c.id}`));
    return;
  }

  const currentPrice = doc.data()?.price || 0;
  await ref.update({
    previousPrice: currentPrice,
    price: newPrice,
  });

  console.log(`✓ Updated ${doc.data()?.name}:`);
  console.log(`  Previous: ${currentPrice} → New: ${newPrice}`);
}

async function updateConstructorPoints(constructorId: string, points: number) {
  const ref = database().collection('constructors').doc(constructorId);
  const doc = await ref.get();

  if (!doc.exists) {
    console.error(`Constructor "${constructorId}" not found`);
    return;
  }

  await ref.update({
    seasonPoints: points,
    fantasyPoints: points,
  });

  console.log(`✓ Updated ${doc.data()?.name} points to ${points}`);
}

async function updateRaceStatus(raceId: string, status: string) {
  const validStatuses = ['upcoming', 'in_progress', 'completed'];
  if (!validStatuses.includes(status)) {
    console.error(`Invalid status. Use: ${validStatuses.join(', ')}`);
    return;
  }

  const ref = database().collection('races').doc(raceId);
  const doc = await ref.get();

  if (!doc.exists) {
    console.error(`Race "${raceId}" not found`);
    console.log('\nValid race IDs:');
    const races = await database().collection('races').orderBy('round').get();
    races.docs.forEach(r => console.log(`  - ${r.id} (Round ${r.data().round})`));
    return;
  }

  await ref.update({ status });
  console.log(`✓ Updated ${doc.data()?.name} status to "${status}"`);
}

async function listDrivers() {
  const drivers = await database().collection('drivers').orderBy('price', 'desc').get();

  console.log('\n📋 Drivers (sorted by price)\n');
  console.log('ID                  | Name                    | Price | Points');
  console.log('-'.repeat(65));

  drivers.docs.forEach(doc => {
    const d = doc.data();
    const id = doc.id.padEnd(18);
    const name = d.name.padEnd(23);
    const price = String(d.price).padStart(5);
    const points = String(d.seasonPoints).padStart(6);
    console.log(`${id} | ${name} | ${price} | ${points}`);
  });
}

async function listConstructors() {
  const constructors = await database().collection('constructors').orderBy('price', 'desc').get();

  console.log('\n🏭 Constructors (sorted by price)\n');
  console.log('ID              | Name                              | Price | Points');
  console.log('-'.repeat(70));

  constructors.docs.forEach(doc => {
    const c = doc.data();
    const id = doc.id.padEnd(14);
    const name = c.name.padEnd(33);
    const price = String(c.price).padStart(5);
    const points = String(c.seasonPoints).padStart(6);
    console.log(`${id} | ${name} | ${price} | ${points}`);
  });
}

async function resetAllPoints(apply = false) {
  // The --apply gate used to live only in main()'s switch, so an importer
  // calling this directly zeroed every score with no flag.
  if (!apply) {
    throw new Error('resetAllPoints zeroes every score; pass apply=true (the CLI requires --apply)');
  }
  console.log('Resetting all points to 0...\n');

  // Reset drivers
  const drivers = await database().collection('drivers').get();
  for (const doc of drivers.docs) {
    await doc.ref.update({ seasonPoints: 0, fantasyPoints: 0 });
    console.log(`  ✓ Reset ${doc.data().name}`);
  }

  // Reset constructors
  const constructors = await database().collection('constructors').get();
  for (const doc of constructors.docs) {
    await doc.ref.update({ seasonPoints: 0, fantasyPoints: 0 });
    console.log(`  ✓ Reset ${doc.data().name}`);
  }

  console.log('\n✓ All points reset to 0');
}

// ============================================
// Bulk Update Functions
// ============================================

async function bulkUpdateDriverPrices(updates: Record<string, number>) {
  console.log('Bulk updating driver prices...\n');

  for (const [driverId, newPrice] of Object.entries(updates)) {
    await updateDriverPrice(driverId, newPrice);
  }
}

async function bulkUpdateDriverPoints(updates: Record<string, number>) {
  console.log('Bulk updating driver points...\n');

  for (const [driverId, points] of Object.entries(updates)) {
    await updateDriverPoints(driverId, points);
  }
}

// ============================================
// CLI Handler
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
F1 Fantasy Data Update Utility

Usage: npx ts-node src/updateData.ts <command> [args]

Commands:
  driver-price <driverId> <newPrice>    Update a driver's price
  driver-points <driverId> <points>     Update a driver's season points
  constructor-price <id> <newPrice>     Update a constructor's price
  constructor-points <id> <points>      Update constructor points
  race-status <raceId> <status>         Update race status
  list-drivers                          List all drivers
  list-constructors                     List all constructors
  reset-points --apply                  Reset all points to 0 on EVERY driver

Examples:
  npx ts-node src/updateData.ts driver-price verstappen 330
  npx ts-node src/updateData.ts driver-points norris 50
  npx ts-node src/updateData.ts race-status australia_2026 completed
  npx ts-node src/updateData.ts list-drivers
`);
    process.exit(0);
  }

  switch (command) {
    case 'driver-price':
      await updateDriverPrice(args[1], parseInt(args[2]));
      break;
    case 'driver-points':
      await updateDriverPoints(args[1], parseInt(args[2]));
      break;
    case 'constructor-price':
      await updateConstructorPrice(args[1], parseInt(args[2]));
      break;
    case 'constructor-points':
      await updateConstructorPoints(args[1], parseInt(args[2]));
      break;
    case 'race-status':
      await updateRaceStatus(args[1], args[2]);
      break;
    case 'list-drivers':
      await listDrivers();
      break;
    case 'list-constructors':
      await listConstructors();
      break;
    case 'reset-points':
      // The one command here that destroys data rather than changing a
      // value: it zeroes seasonPoints and fantasyPoints on every driver and
      // constructor. The others take explicit arguments and are reversible by
      // running them again; this is not, so it asks.
      if (!process.argv.includes('--apply')) {
        console.log('reset-points zeroes seasonPoints and fantasyPoints on EVERY driver');
        console.log('and constructor. Nothing was changed.');
        console.log('To do it: reset-points --apply');
        break;
      }
      await resetAllPoints(true);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run without arguments to see usage.');
  }

  process.exit(0);
}

if (require.main === module) {
  // Usage before credentials, for real this time: database() reads the key on
  // first use, so every path that only prints — no command, --help, an
  // unknown command, the reset-points dry-run notice — runs without one.
  main().catch(console.error);
}

// ============================================
// Export for programmatic use
// ============================================
export {
  updateDriverPrice,
  updateDriverPoints,
  updateConstructorPrice,
  updateConstructorPoints,
  updateRaceStatus,
  bulkUpdateDriverPrices,
  bulkUpdateDriverPoints,
  resetAllPoints,
};
