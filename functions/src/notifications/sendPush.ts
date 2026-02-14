import * as admin from 'firebase-admin';

const db = admin.firestore();

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Send a push notification to a single user by their user ID.
 * Also writes a Notification document to Firestore for in-app history.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  // Write in-app notification record
  await db.collection('notifications').add({
    userId,
    type: data?.type || 'league_update',
    title,
    body,
    data: data || {},
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Send push
  const userDoc = await db.doc(`users/${userId}`).get();
  const pushToken = userDoc.data()?.pushToken;
  if (!pushToken) return;

  try {
    await sendExpoPush(pushToken, { title, body, data });
  } catch (error: any) {
    // If token is invalid, remove it
    if (error?.code === 'messaging/registration-token-not-registered' ||
        error?.code === 'messaging/invalid-registration-token') {
      await db.doc(`users/${userId}`).update({ pushToken: null });
    }
    console.error(`Failed to send push to user ${userId}:`, error);
  }
}

/**
 * Send push to multiple users. Writes Notification docs and sends pushes in batches.
 */
export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (userIds.length === 0) return;

  // Write notification docs in batches (500 max per Firestore batch)
  const batchSize = 500;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const chunk = userIds.slice(i, i + batchSize);
    const batch = db.batch();
    for (const userId of chunk) {
      const ref = db.collection('notifications').doc();
      batch.set(ref, {
        userId,
        type: data?.type || 'league_update',
        title,
        body,
        data: data || {},
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  // Fetch push tokens for all users
  const tokens: string[] = [];
  for (let i = 0; i < userIds.length; i += 30) {
    const chunk = userIds.slice(i, i + 30);
    const snapshot = await db.collection('users')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    snapshot.docs.forEach((doc) => {
      const token = doc.data().pushToken;
      if (token) tokens.push(token);
    });
  }

  // Send pushes in batches
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const promises = chunk.map((token) =>
      sendExpoPush(token, { title, body, data }).catch((err) =>
        console.error('Push send error:', err),
      ),
    );
    await Promise.all(promises);
  }
}

/**
 * Send push to all members of a league
 */
export async function sendPushToLeague(
  leagueId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  excludeUserId?: string,
): Promise<void> {
  const membersSnap = await db
    .collection('leagues')
    .doc(leagueId)
    .collection('members')
    .get();

  const userIds = membersSnap.docs
    .map((doc) => doc.data().userId as string)
    .filter((id) => id !== excludeUserId);

  await sendPushToUsers(userIds, title, body, data);
}

/**
 * Send an Expo push notification via the Expo Push API.
 * We use Expo push tokens (not raw FCM), so we call the Expo push service.
 */
async function sendExpoPush(
  token: string,
  payload: PushPayload,
): Promise<void> {
  // Expo push tokens start with "ExponentPushToken[" or "ExpoPushToken["
  if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
    console.warn('Not an Expo push token, skipping:', token);
    return;
  }

  const message = {
    to: token,
    sound: 'default' as const,
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
  };

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Expo push failed: ${response.status} ${text}`);
  }
}
