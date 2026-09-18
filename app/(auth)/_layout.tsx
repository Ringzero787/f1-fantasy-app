import React from 'react';
import { Stack } from 'expo-router';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';

// Auth screens draw their own Grid header, so the native header stays off.
export default function AuthLayout() {
  const { colors } = useSimpleTheme();
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
