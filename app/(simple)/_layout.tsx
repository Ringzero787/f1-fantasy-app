import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { useAuth } from '../../src/hooks/useAuth';
import { Loading } from '../../src/components/Loading';

// Grid navigation: two tabs live in `index`; Picker, Profile, League Manager
// and member team views are real pushed screens with native transitions.
// Every route here is deep-linkable (theundercut://…), so the group guards
// auth itself rather than relying on app/index.tsx alone.
export default function SimpleLayout() {
  const { colors } = useSimpleTheme();
  const { isAuthenticated, authReady, isDemoMode } = useAuth();

  if (!authReady && !isDemoMode) return <Loading fullScreen message="Loading..." />;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 220,
        gestureEnabled: true,
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="picker" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="league-manager" />
      <Stack.Screen name="member/[userId]" />
    </Stack>
  );
}
