import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StatusBar, Animated, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { GridTeamPanel } from '../../src/simple/grid/GridTeamPanel';
import { SegmentPill } from '../../src/simple/grid/GridBits';
import { GridWeekendRecap } from '../../src/simple/grid/GridWeekendRecap';
import { GridLeaguePanel } from '../../src/simple/grid/GridLeaguePanel';
import { useSimpleTeam } from '../../src/simple/hooks/useSimpleTeam';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { useAdminStore } from '../../src/store/admin.store';
import { useRaceScoresStore } from '../../src/store/raceScores.store';

type Tab = 'team' | 'league';
const FADE_MS = 150;

export default function SimpleMainScreen() {
  const { colors, isDark, spacing } = useSimpleTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ join?: string; code?: string }>();
  const [tab, setTab] = useState<Tab>(params.join ? 'league' : 'team');
  const [refreshing, setRefreshing] = useState(false);
  const { team, loadUserTeams } = useSimpleTeam();
  const syncCompletedRaces = useAdminStore((s) => s.syncCompletedRaces);
  const loadMarketCache = useAdminStore((s) => s.loadMarketCache);
  const fetchLastRaceScores = useRaceScoresStore((s) => s.fetchLastRaceScores);

  useEffect(() => {
    loadUserTeams();
    syncCompletedRaces();
    loadMarketCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  // A join deep link lands on the LEAGUE tab and opens the join form with the code.
  useEffect(() => {
    if (!params.join) return;
    setTab('league');
    if (params.code) router.push({ pathname: '/(simple)/league-manager', params: { step: 'join', code: params.code } } as never);
  }, [params.join, params.code]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadUserTeams(), syncCompletedRaces(), loadMarketCache(), fetchLastRaceScores(true)]);
    setRefreshing(false);
  }, [loadUserTeams, syncCompletedRaces, loadMarketCache, fetchLastRaceScores]);

  // Both panels stay mounted; switching is a 150 ms cross-fade.
  const teamOpacity = useRef(new Animated.Value(tab === 'team' ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(teamOpacity, { toValue: tab === 'team' ? 1 : 0, duration: FADE_MS, useNativeDriver: true }).start();
  }, [tab, teamOpacity]);
  const leagueOpacity = teamOpacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  const { width } = useWindowDimensions();
  const isTablet = width >= 600;
  const contentMaxWidth = isTablet ? 640 : undefined;
  const hasLeague = !!team?.leagueId;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[{ flex: 1 }, isTablet && { alignItems: 'center' }]}>
        <View style={[{ flex: 1, width: '100%' }, contentMaxWidth ? { maxWidth: contentMaxWidth } : null]}>
          <Animated.View
            style={{ ...absoluteFill, opacity: teamOpacity, paddingTop: 12, zIndex: tab === 'team' ? 2 : 1, pointerEvents: tab === 'team' ? 'auto' : 'none' }}
          >
            <GridTeamPanel refreshing={refreshing} onRefresh={onRefresh} />
          </Animated.View>
          <Animated.View
            style={{ ...absoluteFill, opacity: leagueOpacity, paddingTop: 12, zIndex: tab === 'league' ? 2 : 1, pointerEvents: tab === 'league' ? 'auto' : 'none' }}
          >
            <GridLeaguePanel />
          </Animated.View>
        </View>
      </View>

      {/* TEAM / LEAGUE tab pill */}
      <View style={[{ paddingHorizontal: spacing.xl, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12) + 22, backgroundColor: colors.surface, width: '100%' }, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' }]}>
        <SegmentPill<Tab>
          value={tab}
          onChange={setTab}
          segments={[
            { key: 'team', label: 'TEAM' },
            { key: 'league', label: 'LEAGUE', badge: !hasLeague },
          ]}
        />
      </View>

      {/* Self-gating: shows once per completed race the team was scored for */}
      <GridWeekendRecap />
    </SafeAreaView>
  );
}

const absoluteFill = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };
