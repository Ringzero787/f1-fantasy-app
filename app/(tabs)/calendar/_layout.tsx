import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../src/config/constants';

export default function CalendarLayout() {
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
          title: 'Race Calendar',
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: 'Race Details',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.navigate('/calendar')}
              style={{ marginRight: 16 }}
            >
              <Ionicons name="arrow-back" size={24} color={COLORS.text.primary} />
            </TouchableOpacity>
          ),
        }}
      />
    </Stack>
  );
}
