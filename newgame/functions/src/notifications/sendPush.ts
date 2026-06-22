// Track Limits push delivery. Sends via Firebase Cloud Messaging (firebase-admin
// messaging) to the FCM device token stored on tl_users/{uid}.pushToken — the
// app is FCM-configured (google-services.json) and built locally (no EAS), so we
// use raw FCM rather than the Expo push service Undercut uses.
//
// Every send also writes a tl_notifications history doc (for a future in-app
// inbox / badge). An unregistered/invalid token is cleared so we stop retrying.

import * as admin from 'firebase-admin';

const db = admin.firestore();

export type PushData = Record<string, string>;

// Send a push to one TL user. Returns true only if FCM accepted the message
// (i.e. the user had a valid token). A missing token is a normal no-op (the
// caller falls back to email).
export async function sendPushToTLUser(
  userId: string,
  title: string,
  body: string,
  data?: PushData,
): Promise<boolean> {
  // In-app history record (server-only collection).
  await db.collection('tl_notifications').add({
    userId,
    type: data?.type ?? 'general',
    title,
    body,
    data: data ?? {},
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const snap = await db.doc(`tl_users/${userId}`).get();
  const token = snap.data()?.pushToken as string | undefined;
  if (!token) return false;

  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data: data ?? {},
      android: { priority: 'high', notification: { channelId: 'default' } },
    });
    return true;
  } catch (err: unknown) {
    const code =
      (err as { errorInfo?: { code?: string } })?.errorInfo?.code ??
      (err as { code?: string })?.code ??
      'unknown';
    // Drop tokens FCM says are dead so we don't keep paying to retry them.
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/invalid-argument'
    ) {
      await db.doc(`tl_users/${userId}`).set(
        { pushToken: admin.firestore.FieldValue.delete() },
        { merge: true },
      );
    }
    console.warn(`[tl push] send failed for ${userId}: ${code}`);
    return false;
  }
}
