import React from 'react';
import { Stack } from 'expo-router';
import { COLORS } from '../../../src/config/constants';

export default function LeaguesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.primary,
        },
        headerTintColor: COLORS.white,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'My Leagues',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          title: 'Create League',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="[id]/index"
        options={{
          title: 'League Details',
        }}
      />
      <Stack.Screen
        name="[id]/admin"
        options={{
          title: 'League Admin',
        }}
      />
      <Stack.Screen
        name="[id]/team/[memberId]"
        options={{
          title: 'View Team',
        }}
      />
    </Stack>
  );
}
