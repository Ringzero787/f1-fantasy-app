/**
 * Bootstrap admin custom claim for a user by email.
 * Run once to set up the first admin, then use the Cloud Function for future admins.
 *
 * Usage:
 *   npx ts-node scripts/setAdminClaim.ts nathan.shanks@gmail.com
 */

import * as admin from 'firebase-admin';

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx ts-node scripts/setAdminClaim.ts <email>');
    process.exit(1);
  }

  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`Admin claim set for ${email} (uid: ${user.uid})`);
    console.log('User must sign out and back in for the claim to take effect.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
