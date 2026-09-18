import React from 'react';
import { View, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { ScreenHeader } from '../../src/simple/grid/GridBits';
import { SimpleLeaguePanel } from '../../src/simple/components/SimpleLeaguePanel';

// Interim League Manager route: Grid header over the existing league panel
// (create / join / invite) until F-051 builds the stepped manager.
export default function LeagueManagerScreen() {
  const { colors, isDark } = useSimpleTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={{ paddingTop: 12 }}>
        <ScreenHeader statusLeft="← BACK" onStatusLeftPress={() => router.back()} title="Your league" />
      </View>
      <View style={{ flex: 1, marginTop: 8 }}>
        <SimpleLeaguePanel />
      </View>
    </SafeAreaView>
  );
}
