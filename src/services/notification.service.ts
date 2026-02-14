import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { db, collections, doc } from '../config/firebase';
import {
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  writeBatch,
  limit,
} from 'firebase/firestore';
import type { Notification, Race, FantasyTeam } from '../types';
import { TEAM_SIZE } from '../config/constants';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions from the user
 */
export async function requestPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Get the Expo push token and store it in Firestore for the user.
 * On Android, also sets up the default notification channel.
 */
export async function registerPushToken(userId: string): Promise<string | null> {
  const granted = await requestPermissions();
  if (!granted) return null;

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'e79dd8e5-5f63-40f9-a153-87c5225a2516',
    });
    const token = tokenData.data;

    // Store token in Firestore
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { pushToken: token });

    return token;
  } catch (error) {
    console.warn('Failed to get push token:', error);
    return null;
  }
}

/**
 * Remove push token on sign-out
 */
export async function removePushToken(userId: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { pushToken: null });
  } catch (error) {
    console.warn('Failed to remove push token:', error);
  }
}

/**
 * Schedule a local notification reminding the user their team is incomplete
 * before the next race qualifying session. Cancels any existing reminder first.
 */
export async function scheduleIncompleteTeamReminder(
  race: Race,
  team: FantasyTeam,
): Promise<void> {
  // Cancel existing reminders first
  await cancelIncompleteTeamReminders();

  const isIncomplete = team.drivers.length < TEAM_SIZE || !team.constructor;
  if (!isIncomplete) return;

  const qualifyingTime = race.schedule.qualifying instanceof Date
    ? race.schedule.qualifying
    : new Date(race.schedule.qualifying);

  // 3 days before qualifying
  const reminderTime = new Date(qualifyingTime.getTime() - 3 * 24 * 60 * 60 * 1000);
  const now = new Date();

  if (reminderTime <= now) return; // Already past reminder window

  const daysUntil = Math.ceil((qualifyingTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const missingParts: string[] = [];
  if (team.drivers.length < TEAM_SIZE) {
    missingParts.push(`${TEAM_SIZE - team.drivers.length} driver${TEAM_SIZE - team.drivers.length > 1 ? 's' : ''}`);
  }
  if (!team.constructor) {
    missingParts.push('a constructor');
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Your team is incomplete!',
      body: `${race.name} starts in ${daysUntil} days. Add ${missingParts.join(' and ')} to earn points.`,
      data: { type: 'incomplete_team', raceId: race.id, teamId: team.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderTime,
    },
    identifier: 'incomplete-team-reminder',
  });
}

/**
 * Cancel incomplete team reminder notifications
 */
async function cancelIncompleteTeamReminders(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('incomplete-team-reminder');
}

/**
 * Cancel all scheduled notifications (on sign-out)
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Fetch notifications for a user from Firestore
 */
export async function getNotifications(userId: string): Promise<Notification[]> {
  const q = query(
    collections.notifications,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      data: data.data,
      read: data.read ?? false,
      createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
    } as Notification;
  });
}

/**
 * Mark a single notification as read
 */
export async function markAsRead(notificationId: string): Promise<void> {
  const ref = doc(db, 'notifications', notificationId);
  await updateDoc(ref, { read: true });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string): Promise<void> {
  const q = query(
    collections.notifications,
    where('userId', '==', userId),
    where('read', '==', false),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;

  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => {
    batch.update(d.ref, { read: true });
  });
  await batch.commit();
}
