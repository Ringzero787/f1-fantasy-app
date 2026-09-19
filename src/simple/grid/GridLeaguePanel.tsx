import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { useSimpleTeam } from '../hooks/useSimpleTeam';
import { useAuthStore } from '../../store/auth.store';
import { useLeagueStore } from '../../store/league.store';
import { GridAvatar, MonoLabel, ScreenHeader } from './GridBits';
import { rankStandings, playersCaption, type StandingsRow, type StandingsSort } from './standings';
import { raceOptions, raceResultRows, teamLineWithWins, type LeagueRaceResultDoc } from './raceLeaderboard';
import { GridRaceSelectSheet } from './GridRaceSelectSheet';
import { showcaseRaceResult } from './showcaseData';
import { getLeagueRaceResult } from '../../services/leagueRaceResults.service';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';

// LEAGUE tab: standings (TRANSITION.md §4) or the "Racing solo." empty state.
export const GridLeaguePanel = React.memo(function GridLeaguePanel() {
  const { colors, family, spacing, scaled, mono } = useSimpleTheme();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const userId = user?.id ?? null;
  const { team } = useSimpleTeam();
  const leagueId = team?.leagueId ?? null;
  const leagues = useLeagueStore((s) => s.leagues);
  const members = useLeagueStore((s) => s.members);
  const clearError = useLeagueStore((s) => s.clearError);
  const loadUserLeagues = useLeagueStore((s) => s.loadUserLeagues);
  const loadLeague = useLeagueStore((s) => s.loadLeague);
  const loadLeagueMembers = useLeagueStore((s) => s.loadLeagueMembers);
  const subscribeToLeagueMembers = useLeagueStore((s) => s.subscribeToLeagueMembers);
  const [sort, setSort] = useState<StandingsSort>('season');
  const [refreshing, setRefreshing] = useState(false);
  // F-062: one race's leaderboard instead of the season table. null = season / last race.
  const [raceId, setRaceId] = useState<string | null>(null);
  const [raceResult, setRaceResult] = useState<LeagueRaceResultDoc | null>(null);
  const [raceLoading, setRaceLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const raceCache = useRef(new Map<string, LeagueRaceResultDoc | null>());
  const races = useRemoteConfigStore((s) => s.races);

  // The user's league: the active team's, else their first.
  const league = leagueId ? leagues.find((l) => l.id === leagueId) ?? null : leagues[0] ?? null;

  useEffect(() => { if (userId) loadUserLeagues(userId); }, [userId, leagueId, loadUserLeagues]);

  // Follow standings live (persisted table first, then every server change).
  // Demo mode has no server — it builds the table from local teams.
  useEffect(() => {
    if (!league) return;
    clearError();
    loadLeague(league.id).catch(() => {});
    if (isDemoMode) { loadLeagueMembers(league.id).catch(() => {}); return; }
    return subscribeToLeagueMembers(league.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- league identity + mode only
  }, [league?.id, isDemoMode]);

  // Only races the server recorded a leaderboard for (the showcase league has its latest round).
  const resultIds = league?.raceResultIds ?? (isDemoMode && league ? races.filter((r) => r.round === 16).map((r) => r.id) : []);
  const options = useMemo(() => raceOptions(races as never, resultIds), [races, resultIds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // One document read per race picked; cached for the session (pull to refresh clears it).
  useEffect(() => {
    if (!league || !raceId) { setRaceResult(null); setRaceLoading(false); return; }
    const key = `${league.id}:${raceId}`;
    if (raceCache.current.has(key)) { setRaceResult(raceCache.current.get(key) ?? null); setRaceLoading(false); return; }
    let cancelled = false;
    setRaceLoading(true);
    (isDemoMode ? Promise.resolve(showcaseRaceResult(league.id, userId ?? '', options.find((o) => o.raceId === raceId)?.round ?? 0)) : getLeagueRaceResult(league.id, raceId))
      .catch(() => null)
      .then((r) => { if (cancelled) return; raceCache.current.set(key, r); setRaceResult(r); setRaceLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- league identity, race and mode only
  }, [league?.id, raceId, isDemoMode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    raceCache.current.clear();
    if (userId) await loadUserLeagues(userId);
    if (league) await loadLeagueMembers(league.id, true);
    setRefreshing(false);
  }, [userId, league, loadUserLeagues, loadLeagueMembers]);

  const rows = useMemo<StandingsRow[]>(() => {
    if (!league) return [];
    if (raceId) return raceResultRows(raceResult, userId);
    const mine = members.filter((m) => m.leagueId === league.id);
    const winsByUser = new Map(mine.map((m) => [m.userId, m.raceWins]));
    // Race wins ride on the team line of the season table.
    return rankStandings(mine, sort, userId).map((r) => (sort === 'season' ? { ...r, team: teamLineWithWins(r.team, winsByUser.get(r.userId)) } : r));
  }, [members, league, sort, userId, raceId, raceResult]);

  const selectorValue = raceId ?? sort;
  const selectorLabel = raceId ? options.find((o) => o.raceId === raceId)?.label ?? 'RACE' : sort === 'season' ? 'SEASON' : 'LAST RACE';
  const selectorOptions = useMemo(() => [
    { key: 'season', label: 'SEASON' },
    { key: 'last', label: 'LAST RACE' },
    ...options.map((o) => ({ key: o.raceId, label: o.label })),
  ], [options]);
  const onPick = useCallback((key: string) => {
    setPicking(false);
    if (key === 'season' || key === 'last') { setRaceId(null); setSort(key); return; }
    setRaceId(key);
  }, []);

  const goProfile = useCallback(() => router.push('/(simple)/profile' as never), []);
  const goManager = useCallback((step?: 'create' | 'join') => {
    router.push({ pathname: '/(simple)/league-manager', params: step ? { step } : {} } as never);
  }, []);

  const header = (
    <ScreenHeader
      statusLeft={league ? league.name.toUpperCase() : 'LEAGUE'}
      onStatusLeftPress={league ? () => goManager() : undefined}
      statusRight={league ? playersCaption(rows.length || league.memberCount) : 'NOT JOINED'}
      statusRightAccent={false}
      title={league ? 'Standings' : 'No league'}
      right={<GridAvatar name={user?.displayName} imageUrl={user?.photoURL} onPress={goProfile} />}
    />
  );

  if (!league) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={{ flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'center', gap: 12 }}>
          <Text style={{ fontFamily: family.ui.black, fontSize: scaled(40), lineHeight: scaled(40) * 0.95, letterSpacing: -scaled(40) * 0.05, textTransform: 'uppercase', color: colors.text.primary, marginBottom: 8 }}>
            Racing{'\n'}solo.
          </Text>
          <Text style={{ fontFamily: family.ui.regular, fontSize: scaled(12), lineHeight: scaled(18), color: colors.text.muted, marginBottom: 12, maxWidth: 280 }}>
            Standings show up here once you're in a league with friends.
          </Text>
          <Pressable onPress={() => goManager('create')} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: colors.card, borderRadius: 18, padding: 22, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: family.ui.black, fontSize: scaled(18), letterSpacing: -scaled(18) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>Create a league</Text>
              <Text style={[mono(11, 'medium'), { color: colors.text.muted }]}>You run it. Invite friends.</Text>
            </View>
            <Text style={{ fontFamily: family.ui.black, fontSize: scaled(22), color: colors.primary }}>+</Text>
          </Pressable>
          <Pressable onPress={() => goManager('join')} accessibilityRole="button" style={({ pressed }) => ({ borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 18, padding: 22, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: family.ui.black, fontSize: scaled(18), letterSpacing: -scaled(18) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>Join a league</Text>
              <Text style={[mono(11, 'medium'), { color: colors.text.muted }]}>Got a code? Enter it.</Text>
            </View>
            <Text style={{ fontFamily: family.ui.black, fontSize: scaled(18), color: colors.text.muted }}>›</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {header}
      <View style={{ marginHorizontal: spacing.xl, marginTop: 22, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between' }}>
        <MonoLabel>POS · PLAYER</MonoLabel>
        <Pressable onPress={() => setPicking(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Showing ${selectorLabel}. Choose season, last race or a race`}>
          <MonoLabel color={colors.text.primary}>{`${selectorLabel} ▾`}</MonoLabel>
        </Pressable>
      </View>
      {raceId && raceResult?.estimated ? (
        <Text style={[mono(10, 'medium'), { color: colors.text.muted, marginHorizontal: spacing.xl, marginTop: 8 }]}>RACE-DAY POINTS ONLY · NOT COUNTED AS A WIN</Text>
      ) : null}
      {picking ? <GridRaceSelectSheet options={selectorOptions} value={selectorValue} onPick={onPick} onClose={() => setPicking(false)} /> : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.userId}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={<Text style={[mono(11, 'medium'), { color: colors.text.muted, paddingVertical: 24 }]}>{raceId ? (raceLoading ? 'LOADING…' : 'NO LEADERBOARD WAS RECORDED FOR THIS RACE.') : 'NO STANDINGS YET.'}</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/(simple)/member/[userId]', params: { userId: item.userId, leagueId: league.id } } as never)}
            accessibilityRole="button"
            accessibilityLabel={`${item.rank}, ${item.name}, ${item.shown}`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: scaled(18), borderBottomWidth: 1, borderBottomColor: colors.borderLight, opacity: pressed ? 0.7 : 1 })}
          >
            <View style={{ width: scaled(44), gap: 3 }}>
              <Text style={{ fontFamily: family.ui.black, fontSize: scaled(30), lineHeight: scaled(30), letterSpacing: -scaled(30) * 0.05, color: item.isMe ? colors.primary : colors.text.primary }}>{item.rankLabel}</Text>
              <Text style={[mono(10), { color: item.movementDir === 'up' ? colors.positive : item.movementDir === 'down' ? colors.primary : colors.text.muted }]}>{item.movement}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontFamily: family.ui.black, fontSize: scaled(16), lineHeight: scaled(17), letterSpacing: -scaled(16) * 0.02, textTransform: 'uppercase', color: colors.text.primary }}>{item.name}</Text>
              <Text numberOfLines={1} style={[mono(11, 'medium'), { color: colors.text.muted, textTransform: 'uppercase' }]}>{item.team}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[mono(18), { letterSpacing: -scaled(18) * 0.02 }]}>{item.shown}</Text>
              <Text style={[mono(11), { color: item.isLeader ? colors.primary : colors.text.muted }]}>{item.delta}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
});

