import React from 'react';
import { Image, TouchableOpacity } from 'react-native';
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
          headerTitle: () => (
            <Image
              source={require('../../../pics/app graphics/racecalendar.png')}
              style={{ width: 150, height: 36, resizeMode: 'contain' }}
            />
          ),
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
