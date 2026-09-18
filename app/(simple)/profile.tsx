import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { SimpleProfileSheet } from '../../src/simple/components/SimpleProfileSheet';

// Interim Profile route: hosts the existing profile sheet full-screen until
// F-052 replaces it with the Grid Profile screen.
export default function ProfileScreen() {
  const { colors } = useSimpleTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SimpleProfileSheet visible onClose={() => router.back()} />
    </View>
  );
}
