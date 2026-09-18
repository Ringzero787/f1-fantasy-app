import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { GridLeagueManager } from '../../src/simple/grid/GridLeagueManager';

// League Manager: reached from Profile → LEAGUE, the LEAGUE tab's empty-state
// cards (`?step=create|join`) and join deep links (`?step=join&code=…`).
export default function LeagueManagerScreen() {
  const { colors, isDark } = useSimpleTheme();
  const { step, code } = useLocalSearchParams<{ step?: string; code?: string }>();
  const initialStep = step === 'join' || step === 'create' ? step : 'none';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <GridLeagueManager initialStep={initialStep} joinCode={typeof code === 'string' && code ? code : undefined} />
    </SafeAreaView>
  );
}
