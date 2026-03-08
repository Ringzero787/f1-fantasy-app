import React from 'react';
import { Stack, router } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../src/config/constants';
import { useTheme } from '../../../src/hooks/useTheme';

export default function MarketLayout() {
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
          title: 'Market',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="driver/[id]"
        options={{
          title: 'Driver Details',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.navigate('/market')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginRight: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color={COLORS.text.primary} />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name="constructor/[id]"
        options={{
          title: 'Constructor Details',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.navigate('/market')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginRight: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color={COLORS.text.primary} />
            </TouchableOpacity>
          ),
        }}
      />
    </Stack>
  );
}
