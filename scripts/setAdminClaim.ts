/**
 * Bootstrap admin custom claim for a user by email.
 * Run once to set up the first admin, then use the Cloud Function for future admins.
 *
 * Usage:
 *   npx ts-node scripts/setAdminClaim.ts <email>            # dry run, grants nothing
 *   npx ts-node scripts/setAdminClaim.ts <email> --apply    # grants the claim
 */

import * as admin from 'firebase-admin';

// Nothing happens on import. This read the key, initialised firebase-admin
// and called its entry point at module scope, so requiring the file
// connected to production and ran it.
// It grants an admin custom claim on a real account, so it also needs
// --apply: a privilege grant is not something to do by typing a filename.
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
}

async function main() {
  // The first non-flag argument, so --apply may appear on either side of it.
  // Reading argv[2] broke the moment the guard added a flag: the documented
  // `setAdminClaim.ts <email>` printed the dry-run notice and never granted,
  // and `--apply <email>` looked up a user called "--apply".
  const email = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!email) {
    console.error('Usage: npx ts-node scripts/setAdminClaim.ts <email> --apply');
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

if (require.main === module) {
  if (process.argv.includes('--apply')) {
    initAdmin();
    main();
  } else {
    const target = process.argv.slice(2).find((a) => !a.startsWith('--'));
    console.log('setAdminClaim: dry run. This GRANTS the admin custom claim on a real');
    console.log('account in production. Nothing was changed.');
    console.log(target
      ? `To grant it: npx ts-node scripts/setAdminClaim.ts ${target} --apply`
      : 'Usage: npx ts-node scripts/setAdminClaim.ts <email> --apply');
  }
}
