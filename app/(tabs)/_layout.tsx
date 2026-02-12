import React from 'react';
import { Image } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/config/constants';
import { useAuthStore } from '../../src/store/auth.store';

export default function TabLayout() {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const isAdmin = useAuthStore((state) => state.isAdmin);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.text.muted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border.default,
          borderTopWidth: 1,
        },
        headerStyle: {
          backgroundColor: COLORS.surface,
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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart" size={size} color={color} />
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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          headerShown: false,
          // Only show admin tab for admins or demo mode
          href: (isAdmin || isDemoMode) ? ('/(tabs)/admin' as unknown as '/') : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: '',
          headerStyle: {
            backgroundColor: COLORS.surface,
            height: 50,
          },
          headerShadowVisible: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
