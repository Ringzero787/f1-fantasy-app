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
import { router } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useNotificationStore } from '../../src/store/notification.store';
import { useScale } from '../../src/hooks/useScale';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../src/config/constants';
import { useTheme } from '../../src/hooks/useTheme';
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
  chat_message: { name: 'chatbubble', color: COLORS.info },
};

function navigateToNotification(item: Notification) {
  const data = item.data as Record<string, string> | undefined;
  switch (item.type) {
    case 'chat_message':
      if (data?.leagueId) {
        router.push(`/(tabs)/chat` as any);
      }
      break;
    case 'announcement':
    case 'league_invite':
    case 'league_update':
      if (data?.leagueId) {
        router.push(`/(tabs)/leagues/${data.leagueId}` as any);
      }
      break;
    case 'results_available':
      router.push('/(tabs)/calendar' as any);
      break;
    case 'new_story':
      router.push('/(tabs)' as any);
      break;
    case 'price_change':
      router.push('/(tabs)/market' as any);
      break;
    case 'incomplete_team':
    case 'lock_warning':
      router.push('/(tabs)/my-team' as any);
      break;
    case 'race_reminder':
      router.push('/(tabs)/calendar' as any);
      break;
  }
}

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
  const theme = useTheme();
  const icon = ICON_MAP[item.type] ?? { name: 'notifications' as const, color: COLORS.text.muted };
  // Override COLORS.primary with theme.primary for announcement type
  const iconColor = item.type === 'announcement' ? theme.primary : icon.color;
  const { scaledFonts, scaledIcon } = useScale();

  return (
    <TouchableOpacity
      style={[styles.row, !item.read && styles.rowUnread]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
        <Ionicons name={icon.name} size={scaledIcon(20)} color={iconColor} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowTitle, !item.read && styles.rowTitleUnread, { fontSize: scaledFonts.md }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.rowBody, { fontSize: scaledFonts.sm }]} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={[styles.rowTime, { fontSize: scaledFonts.xs }]}>{timeAgo(item.createdAt)}</Text>
      </View>
      {!item.read && <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const notifications = useNotificationStore((s) => s.notifications);
  const isLoading = useNotificationStore((s) => s.isLoading);
  const loadNotifications = useNotificationStore((s) => s.loadNotifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const { scaledFonts, scaledIcon } = useScale();

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
          navigateToNotification(item);
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
          <Ionicons name="checkmark-done" size={scaledIcon(18)} color={theme.primary} />
          <Text style={[styles.markAllText, { fontSize: scaledFonts.md, color: theme.primary }]}>Mark all as read</Text>
        </TouchableOpacity>
      )}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={scaledIcon(48)} color={COLORS.text.muted} />
            <Text style={[styles.emptyTitle, { fontSize: scaledFonts.lg }]}>No notifications yet</Text>
            <Text style={[styles.emptyText, { fontSize: scaledFonts.md }]}>
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
