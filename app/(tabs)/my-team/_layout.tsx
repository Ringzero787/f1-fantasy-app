import React from 'react';
import { Stack } from 'expo-router';
import { COLORS } from '../../../src/config/constants';

export default function MyTeamLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.surface,
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
        name="select-driver"
        options={{
          title: 'Select Driver',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="select-constructor"
        options={{
          title: 'Select Constructor',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="edit"
        options={{
          title: 'Edit Team',
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
