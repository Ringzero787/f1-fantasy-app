import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '../utils/secureStorage';
import type { Notification } from '../types';
import * as notificationService from '../services/notification.service';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  pushToken: string | null;
  isLoading: boolean;

  // Actions
  loadNotifications: (userId: string) => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
  registerToken: (userId: string) => Promise<void>;
  removeToken: (userId: string) => Promise<void>;
  addLocalNotification: (notification: Notification) => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,
      pushToken: null,
      isLoading: false,

      loadNotifications: async (userId: string) => {
        set({ isLoading: true });
        try {
          const notifications = await notificationService.getNotifications(userId);
          const unreadCount = notifications.filter((n) => !n.read).length;
          set({ notifications, unreadCount, isLoading: false });
        } catch (error) {
          console.warn('Failed to load notifications:', error);
          set({ isLoading: false });
        }
      },

      markRead: async (notificationId: string) => {
        // Optimistic update
        const { notifications } = get();
        const updated = notifications.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n,
        );
        const unreadCount = updated.filter((n) => !n.read).length;
        set({ notifications: updated, unreadCount });

        try {
          await notificationService.markAsRead(notificationId);
        } catch (error) {
          console.warn('Failed to mark notification as read:', error);
        }
      },

      markAllRead: async (userId: string) => {
        // Optimistic update
        const { notifications } = get();
        const updated = notifications.map((n) => ({ ...n, read: true }));
        set({ notifications: updated, unreadCount: 0 });

        try {
          await notificationService.markAllAsRead(userId);
        } catch (error) {
          console.warn('Failed to mark all as read:', error);
        }
      },

      registerToken: async (userId: string) => {
        try {
          const token = await notificationService.registerPushToken(userId);
          if (token) {
            set({ pushToken: token });
          }
        } catch (error) {
          console.warn('Failed to register push token:', error);
        }
      },

      removeToken: async (userId: string) => {
        try {
          await notificationService.removePushToken(userId);
          await notificationService.cancelAllScheduledNotifications();
          set({ pushToken: null });
        } catch (error) {
          console.warn('Failed to remove push token:', error);
        }
      },

      addLocalNotification: (notification: Notification) => {
        const { notifications } = get();
        const updated = [notification, ...notifications];
        const unreadCount = updated.filter((n) => !n.read).length;
        set({ notifications: updated, unreadCount });
      },

      reset: () => {
        set({ notifications: [], unreadCount: 0, pushToken: null, isLoading: false });
      },
    }),
    {
      name: 'notification-storage',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        pushToken: state.pushToken,
        unreadCount: state.unreadCount,
      }),
    },
  ),
);
