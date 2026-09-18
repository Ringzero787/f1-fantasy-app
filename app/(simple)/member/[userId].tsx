import React from 'react';
import { View, Text, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useSimpleTheme } from '../../../src/simple/hooks/useSimpleTheme';
import { ScreenHeader } from '../../../src/simple/grid/GridBits';
import { SimpleMemberTeamView } from '../../../src/simple/components/SimpleMemberTeamView';
import { useLeagueStore } from '../../../src/store/league.store';

// Interim member team route: existing read-only view until F-051 reuses the
// Grid tile layout. Expects the member to be in the loaded standings.
export default function MemberTeamScreen() {
  const { colors, isDark, mono } = useSimpleTheme();
  const { userId, leagueId } = useLocalSearchParams<{ userId: string; leagueId?: string }>();
  const members = useLeagueStore((s) => s.members);
  const member = members.find((m) => m.userId === userId && (!leagueId || m.leagueId === leagueId));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {member ? (
        <SimpleMemberTeamView member={member} leagueId={member.leagueId} onBack={() => router.back()} />
      ) : (
        <View style={{ paddingTop: 12 }}>
          <ScreenHeader statusLeft="← BACK" onStatusLeftPress={() => router.back()} title="Team" />
          <Text style={[mono(11, 'medium'), { color: colors.text.muted, padding: 24 }]}>THIS PLAYER ISN'T IN YOUR STANDINGS YET.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
