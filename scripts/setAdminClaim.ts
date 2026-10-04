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

/**
 * The single non-flag argument, so --apply may appear on either side of it.
 * Reading argv[2] broke the moment the guard added a flag. Two emails used to
 * mean the second was dropped in silence, and the dry run echoed only the
 * first, so the preview did not reveal the discard.
 */
function targetEmail(): string | undefined {
  const nonFlags = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (nonFlags.length > 1) {
    console.error(`setAdminClaim takes one email; got ${nonFlags.length}: ${nonFlags.join(' ')}`);
    process.exit(2);
  }
  return nonFlags[0];
}

async function main() {
  const email = targetEmail();
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
    // Validated before anything connects: a missing or doubled email used to
    // initialise firebase-admin against production and only then exit.
    const target = targetEmail();
    if (!target) {
      console.error('Usage: npx ts-node scripts/setAdminClaim.ts <email> --apply');
      process.exit(1);
    }
    initAdmin();
    main();
  } else {
    const target = targetEmail();
    console.log('setAdminClaim: dry run. This GRANTS the admin custom claim on a real');
    console.log('account in production. Nothing was changed.');
    console.log(target
      ? `To grant it: npx ts-node scripts/setAdminClaim.ts ${target} --apply`
      : 'Usage: npx ts-node scripts/setAdminClaim.ts <email> --apply');
  }
}
