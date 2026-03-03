import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, router } from 'expo-router';
import { COLORS, SPACING } from '../config/constants';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/auth.store';
import { useLeagueStore } from '../store/league.store';
import { useChatStore } from '../store/chat.store';
import { SIDE_RAIL_WIDTH } from '../hooks/useLayout';

interface NavItem {
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  matchPrefix: string;
  badge?: number;
}

export function SideRail() {
  const theme = useTheme();
  const pathname = usePathname();
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const leagues = useLeagueStore((s) => s.leagues);
  const hasLeagues = leagues.length > 0;
  const totalUnread = useChatStore((s) => s.totalUnread);

  const items: NavItem[] = [
    { route: '/(tabs)', icon: 'home', matchPrefix: '/(tabs)' },
    { route: '/(tabs)/my-team', icon: 'people', matchPrefix: '/my-team' },
    { route: '/(tabs)/market', icon: 'cart', matchPrefix: '/market' },
    { route: '/(tabs)/leagues', icon: 'trophy', matchPrefix: '/leagues' },
    { route: '/(tabs)/calendar', icon: 'calendar', matchPrefix: '/calendar' },
  ];

  // Chat: show when user has leagues (non-admins, or demo mode where both admin + chat show)
  if ((!isAdmin || isDemoMode) && hasLeagues) {
    items.push({
      route: '/(tabs)/chat',
      icon: 'chatbubbles',
      matchPrefix: '/chat',
      badge: totalUnread > 0 ? totalUnread : undefined,
    });
  }

  // Admin: only for admins or demo mode
  if (isAdmin || isDemoMode) {
    items.push({ route: '/(tabs)/admin', icon: 'settings', matchPrefix: '/admin' });
  }

  items.push({ route: '/(tabs)/profile', icon: 'person', matchPrefix: '/profile' });

  const isActive = (item: NavItem) => {
    // Home is special — only match exact root or index
    if (item.matchPrefix === '/(tabs)') {
      return pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index';
    }
    return pathname.includes(item.matchPrefix);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderRightColor: COLORS.border.default }]}>
      {items.map((item) => {
        const active = isActive(item);
        return (
          <TouchableOpacity
            key={item.route}
            style={styles.iconButton}
            onPress={() => router.navigate(item.route as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrapper, active && { backgroundColor: theme.primary + '20' }]}>
              <Ionicons
                name={item.icon}
                size={24}
                color={active ? theme.primary : COLORS.text.muted}
              />
            </View>
            {item.badge != null && (
              <View style={styles.badge}>
                <Ionicons name="ellipse" size={8} color={COLORS.error} />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIDE_RAIL_WIDTH,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl,
    borderRightWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
});
