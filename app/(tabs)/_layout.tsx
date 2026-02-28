import React, { useEffect, useCallback } from 'react';
import { Image, AppState, View, TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../src/config/constants';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth.store';
import { useOnboardingStore } from '../../src/store/onboarding.store';
import { useChatStore } from '../../src/store/chat.store';
import { useLeagueStore } from '../../src/store/league.store';
import { OnboardingTutorial } from '../../src/components/OnboardingTutorial';
import { NotificationBell } from '../../src/components/NotificationBell';

export default function TabLayout() {
  const theme = useTheme();
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);
  const completeOnboarding = useOnboardingStore((state) => state.completeOnboarding);
  const totalUnread = useChatStore((state) => state.totalUnread);
  const leagues = useLeagueStore((state) => state.leagues);
  const hasLeagues = leagues.length > 0;
  const loadUnreadCounts = useChatStore((state) => state.loadUnreadCounts);

  const refreshUnread = useCallback(() => {
    if (leagues.length > 0 && !isDemoMode) {
      loadUnreadCounts(leagues.map((l) => l.id));
    }
  }, [leagues, isDemoMode, loadUnreadCounts]);

  // Load unread counts on mount and when app returns to foreground
  useEffect(() => {
    refreshUnread();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUnread();
    });

    return () => sub.remove();
  }, [refreshUnread]);

  return (
    <>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: COLORS.text.muted,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: COLORS.border.default,
          borderTopWidth: 1,
        },
        headerStyle: {
          backgroundColor: theme.surface,
        },
        headerTintColor: COLORS.text.primary,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerLeft: () => (
            <Image
              source={require('../../pics/app graphics/banner-undercut-white.png')}
              style={{ width: 140, height: 36, resizeMode: 'contain', marginLeft: 12 }}
            />
          ),
          headerTitle: () => (
            <Image
              source={require('../../pics/app graphics/banner04.png')}
              style={{ width: 120, height: 36, resizeMode: 'contain' }}
            />
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {hasCompletedOnboarding && (
                <TouchableOpacity
                  onPress={() => useOnboardingStore.getState().resetOnboarding()}
                  style={{ padding: 8, marginRight: -4 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="help-circle-outline" size={22} color={COLORS.text.muted} />
                </TouchableOpacity>
              )}
              <NotificationBell />
            </View>
          ),
          tabBarTestID: 'tab-home',
          tabBarAccessibilityLabel: 'Home tab',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-team"
        options={{
          title: 'My Team',
          headerTitle: () => (
            <Image
              source={require('../../pics/app graphics/myteam.png')}
              style={{ width: 150, height: 36, resizeMode: 'contain' }}
            />
          ),
          headerRight: () => (
            <Image
              source={require('../../pics/app graphics/banner06.png')}
              style={{ width: 40, height: 32, resizeMode: 'contain', marginRight: 12 }}
            />
          ),
          // @ts-ignore tabBarTestID for E2E testing
          tabBarTestID: 'tab-my-team',
          tabBarAccessibilityLabel: 'My Team tab',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          headerTitle: () => (
            <Image
              source={require('../../pics/app graphics/market.png')}
              style={{ width: 150, height: 36, resizeMode: 'contain' }}
            />
          ),
          headerRight: () => (
            <Image
              source={require('../../pics/app graphics/banner06.png')}
              style={{ width: 40, height: 32, resizeMode: 'contain', marginRight: 12 }}
            />
          ),
          // @ts-ignore tabBarTestID for E2E testing
          tabBarTestID: 'tab-market',
          tabBarAccessibilityLabel: 'Market tab',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leagues"
        options={{
          title: 'Leagues',
          headerTitle: () => (
            <Image
              source={require('../../pics/app graphics/leagues.png')}
              style={{ width: 150, height: 36, resizeMode: 'contain' }}
            />
          ),
          headerRight: () => (
            <Image
              source={require('../../pics/app graphics/banner06.png')}
              style={{ width: 40, height: 32, resizeMode: 'contain', marginRight: 12 }}
            />
          ),
          // @ts-ignore tabBarTestID for E2E testing
          tabBarTestID: 'tab-leagues',
          tabBarAccessibilityLabel: 'Leagues tab',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          headerShown: false,
          // @ts-ignore tabBarTestID for E2E testing
          tabBarTestID: 'tab-calendar',
          tabBarAccessibilityLabel: 'Calendar tab',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          headerShown: false,
          // Show when user has leagues (non-admins, or demo mode where both admin + chat show)
          href: ((!isAdmin || isDemoMode) && hasLeagues) ? ('/(tabs)/chat' as unknown as '/') : null,
          // @ts-ignore tabBarTestID for E2E testing
          tabBarTestID: 'tab-chat',
          tabBarAccessibilityLabel: 'Chat tab',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={28} color={color} />
          ),
          tabBarBadge: totalUnread > 0 ? totalUnread : undefined,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          headerShown: false,
          // Only show admin tab for admins or demo mode
          href: (isAdmin || isDemoMode) ? ('/(tabs)/admin' as unknown as '/') : null,
          // @ts-ignore tabBarTestID for E2E testing
          tabBarTestID: 'tab-admin',
          tabBarAccessibilityLabel: 'Admin tab',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: '',
          headerStyle: {
            backgroundColor: theme.surface,
            height: 50,
          },
          headerShadowVisible: false,
          // @ts-ignore tabBarTestID for E2E testing
          tabBarTestID: 'tab-profile',
          tabBarAccessibilityLabel: 'Profile tab',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          href: null,
          headerStyle: {
            backgroundColor: theme.surface,
          },
          headerTintColor: COLORS.text.primary,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications" size={28} color={color} />
          ),
        }}
      />
    </Tabs>
    <OnboardingTutorial visible={!hasCompletedOnboarding} onComplete={completeOnboarding} />
    </>
  );
}
