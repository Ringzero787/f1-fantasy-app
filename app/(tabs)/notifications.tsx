import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/hooks/useAuth';
import { useNotificationStore } from '../../src/store/notification.store';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../src/config/constants';
import type { Notification, NotificationType } from '../../src/types';

const ICON_MAP: Record<NotificationType, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  announcement: { name: 'megaphone', color: COLORS.primary },
  new_story: { name: 'newspaper', color: COLORS.info },
  results_available: { name: 'flag', color: COLORS.success },
  race_reminder: { name: 'calendar', color: COLORS.warning },
  incomplete_team: { name: 'alert-circle', color: COLORS.warning },
  lock_warning: { name: 'lock-closed', color: COLORS.error },
  price_change: { name: 'trending-up', color: COLORS.priceUp },
  league_invite: { name: 'mail', color: COLORS.accent },
  league_update: { name: 'trophy', color: COLORS.gold },
};

function timeAgo(date: Date): string {
  const now = new Date();
  const d = date instanceof Date ? date : new Date(date);
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function NotificationRow({ item, onPress }: { item: Notification; onPress: () => void }) {
  const icon = ICON_MAP[item.type] ?? { name: 'notifications' as const, color: COLORS.text.muted };

  return (
    <TouchableOpacity
      style={[styles.row, !item.read && styles.rowUnread]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: icon.color + '20' }]}>
        <Ionicons name={icon.name} size={20} color={icon.color} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowTitle, !item.read && styles.rowTitleUnread]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.rowBody} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.rowTime}>{timeAgo(item.createdAt)}</Text>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { user } = useAuth();
  const notifications = useNotificationStore((s) => s.notifications);
  const isLoading = useNotificationStore((s) => s.isLoading);
  const loadNotifications = useNotificationStore((s) => s.loadNotifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);

  useEffect(() => {
    if (user) {
      loadNotifications(user.id);
    }
  }, [user]);

  const onRefresh = useCallback(() => {
    if (user) loadNotifications(user.id);
  }, [user]);

  const handleMarkAllRead = useCallback(() => {
    if (user) markAllRead(user.id);
  }, [user]);

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => (
      <NotificationRow
        item={item}
        onPress={() => {
          if (!item.read) markRead(item.id);
        }}
      />
    ),
    [markRead],
  );

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <View style={styles.container}>
      {hasUnread && (
        <TouchableOpacity style={styles.markAllButton} onPress={handleMarkAllRead}>
          <Ionicons name="checkmark-done" size={18} color={COLORS.primary} />
          <Text style={styles.markAllText}>Mark all as read</Text>
        </TouchableOpacity>
      )}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={48} color={COLORS.text.muted} />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyText}>
              You'll be notified about race results, league announcements, and more.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },
  markAllText: {
    color: COLORS.primary,
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
    gap: SPACING.md,
  },
  rowUnread: {
    backgroundColor: COLORS.glass.cyan,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    marginBottom: 2,
  },
  rowTitleUnread: {
    color: COLORS.text.primary,
    fontWeight: '600',
  },
  rowBody: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    lineHeight: 18,
  },
  rowTime: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: SPACING.xl,
    gap: SPACING.sm,
  },
  emptyTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
