/**
 * Public league search (F-175 slice 4, BUILD.md "Search"). Loads public leagues and sorts them on
 * the device with `orderChartered`: chartered leagues first by points, lifted at most three places
 * by this week's Rank Ups, then every other public league by size. A full league is still listed;
 * asking to join it returns the full error.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, Alert, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { useSimpleTeam } from '../hooks/useSimpleTeam';
import { useAuthStore } from '../../store/auth.store';
import { leagueService } from '../../services/league.service';
import { MonoLabel, ScreenHeader } from './GridBits';
import { CharterSquare } from './GridCharter';
import { joinByCodeAndAttach } from './joinLeague';
import { CHARTER_RED, climbedThisWeek, isChartered, orderChartered, rankUpsCaption, rankUpsThisWeek } from './charter';
import type { League } from '../../types';

/** Enough to sort before slicing at launch size; past ~200 this moves to a server-side rank (BUILD.md). */
const SEARCH_READ_LIMIT = 200;

export function GridLeagueSearch() {
  const { colors, family, spacing, scaled, mono } = useSimpleTheme();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const userId = user?.id ?? '';
  const { team, assignTeamToLeague, syncToFirebase } = useSimpleTeam();
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isDemoMode) { setLeagues([]); return; }
    try { setLeagues(await leagueService.getPublicLeagues(SEARCH_READ_LIMIT)); } catch { setLeagues([]); }
  }, [isDemoMode]);
  useEffect(() => { void load(); }, [load]);

  const now = Date.now();
  const ordered = useMemo(() => (leagues ? orderChartered(leagues, now) : []), [leagues]); // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/(simple)' as never)), []);

  const ask = useCallback((l: League) => {
    if (team?.leagueId) { Alert.alert('Already in a league', 'Leave your current league first.'); return; }
    Alert.alert(`Ask to join ${l.name}?`, l.settings?.requireApproval || isChartered(l, Date.now()) ? `${l.ownerName || 'The owner'} approves each player.` : 'You join straight away.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Ask to join', onPress: async () => {
        setBusyId(l.id);
        try {
          await joinByCodeAndAttach(l.inviteCode, userId, user?.displayName ?? 'Player', async (id) => {
            if (team) { await assignTeamToLeague(team.id, id); await syncToFirebase(); }
          });
          router.replace('/(simple)' as never);
        } catch (e) {
          Alert.alert('Could not join', e instanceof Error ? e.message : 'Try again.');
        } finally { setBusyId(null); }
      } },
    ]);
  }, [team, userId, user?.displayName, assignTeamToLeague, syncToFirebase]);

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader statusLeft="← BACK" onStatusLeftPress={goBack} statusRight="PUBLIC" statusRightAccent={false} title="Find a league" />
      <FlatList
        data={ordered}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: 18, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
        ListEmptyComponent={<Text style={[mono(11, 'medium'), { color: colors.text.muted, paddingVertical: 24 }]}>{leagues === null ? 'LOADING…' : 'NO PUBLIC LEAGUES YET.'}</Text>}
        renderItem={({ item, index }) => {
          const chartered = isChartered(item, now);
          const up = climbedThisWeek(item, now);
          const rankUps = rankUpsThisWeek(item, now);
          return (
            <Pressable onPress={() => ask(item)} disabled={busyId !== null} accessibilityRole="button"
              accessibilityLabel={`${index + 1}, ${item.name}${chartered ? ', chartered' : ''}, ${item.memberCount} players`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: scaled(16), borderBottomWidth: 1, borderBottomColor: colors.borderLight, opacity: pressed || busyId === item.id ? 0.6 : 1 })}>
              <Text style={{ width: scaled(34), fontFamily: family.ui.black, fontSize: scaled(22), color: colors.text.primary }}>{index + 1}</Text>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: family.ui.black, fontSize: scaled(16), textTransform: 'uppercase', color: colors.text.primary }}>{item.name}</Text>
                  {chartered ? <CharterSquare /> : null}
                </View>
                <Text numberOfLines={1} style={[mono(10, 'medium'), { color: colors.text.muted }]}>
                  {`${item.memberCount} PLAYERS${chartered ? ` · ${rankUpsCaption(rankUps)}` : ''}`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {chartered ? <Text style={mono(14)}>{`${Math.round(item.searchPoints ?? 0)} PTS`}</Text> : null}
                {up > 0 ? <MonoLabel color={CHARTER_RED}>{`UP ${up} THIS WEEK`}</MonoLabel> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
