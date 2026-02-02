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
 *   reset-points                          - Reset all points to 0 (start of season)
 */

import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin
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

const db = admin.firestore();

// ============================================
// Update Functions
// ============================================

async function updateDriverPrice(driverId: string, newPrice: number) {
  const driverRef = db.collection('drivers').doc(driverId);
  const doc = await driverRef.get();

  if (!doc.exists) {
    console.error(`Driver "${driverId}" not found`);
    console.log('\nValid driver IDs:');
    const drivers = await db.collection('drivers').get();
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
  const driverRef = db.collection('drivers').doc(driverId);
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
  const ref = db.collection('constructors').doc(constructorId);
  const doc = await ref.get();

  if (!doc.exists) {
    console.error(`Constructor "${constructorId}" not found`);
    console.log('\nValid constructor IDs:');
    const constructors = await db.collection('constructors').get();
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
  const ref = db.collection('constructors').doc(constructorId);
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

  const ref = db.collection('races').doc(raceId);
  const doc = await ref.get();

  if (!doc.exists) {
    console.error(`Race "${raceId}" not found`);
    console.log('\nValid race IDs:');
    const races = await db.collection('races').orderBy('round').get();
    races.docs.forEach(r => console.log(`  - ${r.id} (Round ${r.data().round})`));
    return;
  }

  await ref.update({ status });
  console.log(`✓ Updated ${doc.data()?.name} status to "${status}"`);
}

async function listDrivers() {
  const drivers = await db.collection('drivers').orderBy('price', 'desc').get();

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
  const constructors = await db.collection('constructors').orderBy('price', 'desc').get();

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

async function resetAllPoints() {
  console.log('Resetting all points to 0...\n');

  // Reset drivers
  const drivers = await db.collection('drivers').get();
  for (const doc of drivers.docs) {
    await doc.ref.update({ seasonPoints: 0, fantasyPoints: 0 });
    console.log(`  ✓ Reset ${doc.data().name}`);
  }

  // Reset constructors
  const constructors = await db.collection('constructors').get();
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
  reset-points                          Reset all points to 0

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
      await resetAllPoints();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run without arguments to see usage.');
  }

  process.exit(0);
}

main().catch(console.error);

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
