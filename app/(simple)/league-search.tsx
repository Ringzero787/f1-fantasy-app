import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { GridLeagueSearch } from '../../src/simple/grid/GridLeagueSearch';

// Public league search (F-175): reached from the LEAGUE tab's empty state and the League Manager.
export default function LeagueSearchScreen() {
  const { colors, isDark } = useSimpleTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <GridLeagueSearch />
    </SafeAreaView>
  );
}
