// Push registration for Track Limits. The app is FCM-configured (no EAS), so we
// register the raw device push token (FCM on Android, APNs on iOS) and store it
// on tl_users/{uid}.pushToken. The server (tlNotifyMissingPicks) sends to it via
// firebase-admin messaging. Permission is requested lazily, after sign-in.

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

// Foreground presentation: show a banner + list entry, no sound spam.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export const notificationsService = {
  // Ask for permission (if not already decided) and persist the device token.
  // Returns the token, or null if unavailable / denied / on a simulator. Safe to
  // call repeatedly — it just refreshes the stored token.
  async registerForPush(userId: string): Promise<string | null> {
    if (!Device.isDevice) return null; // no push on simulators/emulators

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted || existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted && existing.canAskAgain !== false) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Race reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    let token: string | null = null;
    try {
      const resp = await Notifications.getDevicePushTokenAsync();
      token = typeof resp.data === 'string' ? resp.data : null;
    } catch {
      return null; // FCM/APNs not available in this build context
    }
    if (!token) return null;

    await setDoc(
      doc(db, 'tl_users', userId),
      { pushToken: token, pushTokenUpdatedAt: serverTimestamp() },
      { merge: true },
    );
    return token;
  },

  // Clear the stored token (e.g. on sign-out) so the user stops receiving push
  // on a device they've left.
  async unregister(userId: string): Promise<void> {
    await setDoc(doc(db, 'tl_users', userId), { pushToken: null }, { merge: true });
  },
};
