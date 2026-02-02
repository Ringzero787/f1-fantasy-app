import React from 'react';
import { Stack } from 'expo-router';
import { COLORS } from '../../../src/config/constants';

export default function CalendarLayout() {
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
          title: 'Race Calendar',
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: 'Race Details',
        }}
      />
    </Stack>
  );
}
