import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, StatusBar, PanResponder, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SimpleToggleBar, type SimplePanel } from '../../src/simple/components/SimpleToggleBar';
import { SimpleCountdownBanner } from '../../src/simple/components/SimpleCountdownBanner';
import { SimpleMyTeamPanel } from '../../src/simple/components/SimpleMyTeamPanel';
import { SimpleLeaguePanel } from '../../src/simple/components/SimpleLeaguePanel';
import { SimpleMarketPanel } from '../../src/simple/components/SimpleMarketPanel';
import { SimpleProfilePill } from '../../src/simple/components/SimpleProfilePill';
import { SimpleProfileSheet } from '../../src/simple/components/SimpleProfileSheet';
import { useSimpleTeam } from '../../src/simple/hooks/useSimpleTeam';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { useAdminStore } from '../../src/store/admin.store';

export default function SimpleMainScreen() {
  const { colors, isDark } = useSimpleTheme();
  const [activePanel, setActivePanel] = useState<SimplePanel>('team');
  const [refreshing, setRefreshing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { team, loadUserTeams } = useSimpleTeam();
  const syncCompletedRaces = useAdminStore((s) => s.syncCompletedRaces);
  const loadMarketCache = useAdminStore((s) => s.loadMarketCache);

  // Initial data load
  useEffect(() => {
    loadUserTeams();
    syncCompletedRaces();
    loadMarketCache();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadUserTeams(),
      syncCompletedRaces(),
      loadMarketCache(),
    ]);
    setRefreshing(false);
  }, []);

  const hasLeague = !!team?.leagueId;
  const { width } = useWindowDimensions();
  const isTablet = width >= 600;
  const contentMaxWidth = isTablet ? 540 : undefined;

  // Swipe gesture for panel switching
  const PANELS: SimplePanel[] = ['standings', 'team', 'market'];
  const panelRef = useRef(activePanel);
  panelRef.current = activePanel;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 30 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) < 50) return;
        const idx = PANELS.indexOf(panelRef.current);
        if (gesture.dx < 0 && idx < PANELS.length - 1) {
          setActivePanel(PANELS[idx + 1]);
        } else if (gesture.dx > 0 && idx > 0) {
          setActivePanel(PANELS[idx - 1]);
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <SimpleToggleBar active={activePanel} onChange={setActivePanel} hasLeague={hasLeague} />

      <View style={[styles.panelContainer, isTablet && { alignItems: 'center' }]} {...panResponder.panHandlers}>
        <View style={[{ flex: 1, width: '100%' }, contentMaxWidth ? { maxWidth: contentMaxWidth } : null]}>
        {activePanel === 'team' && (
          <SimpleMyTeamPanel
            onNavigateToMarket={() => setActivePanel('market')}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        )}
        {activePanel === 'standings' && (
          <SimpleLeaguePanel />
        )}
        {activePanel === 'market' && (
          <SimpleMarketPanel refreshing={refreshing} onRefresh={onRefresh} />
        )}
        </View>
      </View>

      <SimpleProfilePill onPress={() => setProfileOpen(true)} />
      <SimpleProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  panelContainer: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
  },
});
