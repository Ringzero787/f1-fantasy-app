import React from 'react';
import { Stack } from 'expo-router';
import { COLORS } from '../../../src/config/constants';

export default function MarketLayout() {
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
          title: 'Market',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="driver/[id]"
        options={{
          title: 'Driver Details',
        }}
      />
      <Stack.Screen
        name="constructor/[id]"
        options={{
          title: 'Constructor Details',
        }}
      />
    </Stack>
  );
}
