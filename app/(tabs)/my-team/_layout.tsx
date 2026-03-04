import React from 'react';
import { Stack } from 'expo-router';
import { COLORS } from '../../../src/config/constants';
import { useTheme } from '../../../src/hooks/useTheme';

export default function MyTeamLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.surface,
        },
        headerTintColor: COLORS.text.primary,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'My Team',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          title: 'Create Team',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="build"
        options={{
          title: 'Build Team',
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
