import React from 'react';
import { Stack } from 'expo-router';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';

// Grid navigation: two tabs live in `index`; Picker, Profile, League Manager
// and member team views are real pushed screens with native transitions.
export default function SimpleLayout() {
  const { colors } = useSimpleTheme();
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
