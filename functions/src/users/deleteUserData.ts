import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const bucket = admin.storage().bucket();

/**
 * Triggered when a Firebase Auth user is deleted.
 * Cascade-deletes all associated data across Firestore collections and Storage.
 *
 * Collections cleaned:
 * - users/{userId}
 * - fantasyTeams where userId == uid
 * - transactions where userId == uid
 * - notifications where userId == uid
 * - purchases where userId == uid
 * - leagues/{leagueId}/members/{userId} (all leagues)
 * - leagues/{leagueId}/chatReadReceipts/{userId}
 * - avatarRateLimits/{userId}
 * - Storage: avatars/{userId}/**
 */
export const onUserDeleted = functions.auth.user().onDelete(async (user) => {
  const userId = user.uid;
  console.log(`Cleaning up data for deleted user: ${userId}`);

  const deletions: Promise<any>[] = [];

  // 1. Delete user profile
  deletions.push(
    db.collection('users').doc(userId).delete().catch(logAndIgnore('users'))
  );

  // 2. Delete avatar rate limit doc
  deletions.push(
    db.collection('avatarRateLimits').doc(userId).delete().catch(logAndIgnore('avatarRateLimits'))
  );

  // 3. Delete fantasyTeams owned by user
  deletions.push(
    batchDeleteByField('fantasyTeams', 'userId', userId)
  );

  // 4. Delete transactions
  deletions.push(
    batchDeleteByField('transactions', 'userId', userId)
  );

  // 5. Delete notifications
  deletions.push(
    batchDeleteByField('notifications', 'userId', userId)
  );

  // 6. Delete purchases
  deletions.push(
    batchDeleteByField('purchases', 'userId', userId)
  );

  // 7. Remove from all league memberships + chat read receipts
  deletions.push(removeFromAllLeagues(userId));

  // 8. Delete Storage avatars
  deletions.push(deleteStorageFolder(`avatars/${userId}/`));

  await Promise.all(deletions);

  console.log(`Cleanup complete for user: ${userId}`);
});

/**
 * Batch-delete all documents in a collection where a field matches a value.
 */
async function batchDeleteByField(
  collectionName: string,
  fieldName: string,
  value: string
): Promise<void> {
  const BATCH_SIZE = 450; // Stay under Firestore's 500-write batch limit

  let query = db.collection(collectionName)
    .where(fieldName, '==', value)
    .limit(BATCH_SIZE);

  let deleted = 0;
  let snapshot = await query.get();

  while (!snapshot.empty) {
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;

    if (snapshot.size < BATCH_SIZE) break;
    snapshot = await query.get();
  }

  if (deleted > 0) {
    console.log(`Deleted ${deleted} docs from ${collectionName}`);
  }
}

/**
 * Remove user from all league memberships and chat read receipts.
 * Uses a collection group query on 'members' subcollection.
 */
async function removeFromAllLeagues(userId: string): Promise<void> {
  // Find all league membership docs for this user
  const memberDocs = await db.collectionGroup('members')
    .where('userId', '==', userId)
    .get();

  if (memberDocs.empty) return;

  const batch = db.batch();
  let count = 0;

  for (const memberDoc of memberDocs.docs) {
    // Delete the membership doc
    batch.delete(memberDoc.ref);
    count++;

    // Also delete chat read receipt in the same league
    // Path: leagues/{leagueId}/members/{memberId} -> leagues/{leagueId}/chatReadReceipts/{userId}
    const leagueRef = memberDoc.ref.parent.parent;
    if (leagueRef) {
      const receiptRef = leagueRef.collection('chatReadReceipts').doc(userId);
      batch.delete(receiptRef);
      count++;
    }

    // Firestore batch limit
    if (count >= 450) {
      await batch.commit();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  console.log(`Removed user from ${memberDocs.size} league(s)`);
}

/**
 * Delete all files under a Storage folder prefix.
 */
async function deleteStorageFolder(prefix: string): Promise<void> {
  try {
    const [files] = await bucket.getFiles({ prefix });
    if (files.length === 0) return;

    await Promise.all(files.map((file) => file.delete().catch(() => {})));
    console.log(`Deleted ${files.length} files from Storage: ${prefix}`);
  } catch (err) {
    // Storage folder may not exist — that's fine
    console.log(`No Storage files found at ${prefix}`);
  }
}

function logAndIgnore(label: string) {
  return (err: any) => {
    console.log(`Failed to delete ${label} (may not exist):`, err.message);
  };
}
