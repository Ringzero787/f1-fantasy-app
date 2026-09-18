import React from 'react';
import { View, Text, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useSimpleTheme } from '../../../src/simple/hooks/useSimpleTheme';
import { ScreenHeader } from '../../../src/simple/grid/GridBits';
import { GridMemberTeam } from '../../../src/simple/grid/GridMemberTeam';
import { useLeagueStore } from '../../../src/store/league.store';

// Another player's team, read-only. The member must be in the loaded
// standings (a UI filter; tightening the fantasyTeams list rule is a
// tracked follow-up).
export default function MemberTeamScreen() {
  const { colors, isDark, mono } = useSimpleTheme();
  const { userId, leagueId } = useLocalSearchParams<{ userId: string; leagueId?: string }>();
  const members = useLeagueStore((s) => s.members);
  const member = members.find((m) => m.userId === userId && (!leagueId || m.leagueId === leagueId));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {member ? (
        <GridMemberTeam member={member} leagueId={member.leagueId} />
      ) : (
        <View style={{ paddingTop: 12 }}>
          <ScreenHeader statusLeft="← BACK" onStatusLeftPress={() => router.back()} title="Team" />
          <Text style={[mono(11, 'medium'), { color: colors.text.muted, padding: 24 }]}>THIS PLAYER ISN'T IN YOUR STANDINGS YET.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
