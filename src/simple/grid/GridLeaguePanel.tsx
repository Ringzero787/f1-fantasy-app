import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { useSimpleTeam } from '../hooks/useSimpleTeam';
import { useAuthStore } from '../../store/auth.store';
import { useLeagueStore } from '../../store/league.store';
import { GridAvatar, MonoLabel, ScreenHeader } from './GridBits';
import { rankStandings, playersCaption, type StandingsRow, type StandingsSort } from './standings';
import { raceOptions, raceResultRows, shortRaceName, teamLineWithWins, type LeagueRaceResultDoc } from './raceLeaderboard';
import { GridMoonshotFeed } from './GridMoonshotFeed';
import { useMoonshotStore } from '../../store/moonshot.store';
import { useLockoutStatus } from '../../hooks/useLockoutStatus';
import { moonshotAvailability } from './moonshot';
import { useMoonshotConfig } from '../hooks/useMoonshotConfig';
import { GridRaceSelectSheet } from './GridRaceSelectSheet';
import { GridRoundReportSheet } from './GridRoundReport';
import { clearRoundReportCache, readLeagueRaceResult } from '../hooks/useRoundReport';
import { standingsText } from './shareStandings';
import { shareText } from './shareText';
import { SHOWCASE_RESULT_ROUND, showcaseRaceResult } from './showcaseData';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { usePurchaseStore } from '../../store/purchase.store';
import { leagueService } from '../../services/league.service';
import { PRODUCT_IDS } from '../../config/products';
import { PITWALL_CONTENT_OPEN } from '../../pitwall/gates';
import { isAmazonBuild } from '../../utils/storeDetection';
import { approvalCap, charterFlagOn, charterOfferVisible, charterTester, isChartered, rankUpLabel, rankUpsReceived, shouldShowUnlock, weekId, CHARTER_RED } from './charter';
import { CharterMemberLine, CharterOfferCard, CharterOnCard, CharterRequestRow, CharterRequestSheet, CharterSquare, CharterUnlockSheet, shareCharter } from './GridCharter';

/** Leagues whose unlock sheet was shown this session, in case the "seen" write did not land. */
const unlockShownThisSession = new Set<string>();

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
  // F-108: the league's Moonshot feed — this race's locked declarations and the season's history
  const moonshotCfg = useMoonshotConfig();
  const lockout = useLockoutStatus();
  const moonshotAvail = moonshotAvailability(moonshotCfg, lockout.nextRace?.round);
  const board = useMoonshotStore((s) => s.board);
  const activity = useMoonshotStore((s) => s.activity);
  const loadBoard = useMoonshotStore((s) => s.loadBoard);
  const loadActivity = useMoonshotStore((s) => s.loadActivity);
  useEffect(() => {
    if (moonshotAvail !== 'open' || !leagueId) return;
    loadActivity(leagueId);
    if (lockout.nextRace) loadBoard(leagueId, lockout.nextRace.id);
  }, [moonshotAvail, leagueId, lockout.nextRace?.id, loadActivity, loadBoard]); // eslint-disable-line react-hooks/exhaustive-deps
  const feed = moonshotAvail === 'open' && leagueId ? (
    <GridMoonshotFeed board={board.filter((b) => !lockout.nextRace || b.raceId === lockout.nextRace.id)} activity={activity} cfg={moonshotCfg}
      teamOf={(uid) => { const m = members.find((x) => x.userId === uid); return m?.teamName || m?.displayName || 'Team'; }}
      raceLabel={lockout.nextRace ? `RD ${lockout.nextRace.round} · ${shortRaceName(lockout.nextRace.name).toUpperCase()}` : null} />
  ) : null;
  const [refreshing, setRefreshing] = useState(false);
  // F-062: one race's leaderboard instead of the season table. null = season / last race.
  const [raceId, setRaceId] = useState<string | null>(null);
  const [raceResult, setRaceResult] = useState<LeagueRaceResultDoc | null>(null);
  const [raceLoading, setRaceLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  // F-120: the round report for the race on screen, or the latest one while the season table is showing.
  const [reporting, setReporting] = useState(false);
  const races = useRemoteConfigStore((s) => s.races);

  // The user's league: the active team's, else their first.
  const league = leagueId ? leagues.find((l) => l.id === leagueId) ?? null : leagues[0] ?? null;

  // F-175 slice 4: Charter on the league page.
  const now = Date.now();
  const chartered = isChartered(league, now);
  const isOwner = !!league && !!userId && league.ownerId === userId;
  const pendingLeagueIds = useLeagueStore((s) => s.pendingLeagueIds);
  const pending = !!league && pendingLeagueIds.includes(league.id);
  const requestCount = useLeagueStore((s) => (league ? s.pendingCountsByLeague[league.id] ?? 0 : 0));
  const charterFlag = useRemoteConfigStore((s) => charterFlagOn(s.appConfig?.charter));
  const charterPrice = usePurchaseStore((s) => s.storePrices[PRODUCT_IDS.PITWALL_CHARTER]);
  const charterBusy = usePurchaseStore((s) => s.isPurchasing);
  const offerVisible = charterOfferVisible({ flagOn: charterFlag, contentOpen: PITWALL_CONTENT_OPEN, amazon: isAmazonBuild, demo: isDemoMode, price: charterPrice, tester: charterTester(Platform.OS, user?.testAccount) });
  const [requestsOpen, setRequestsOpen] = useState(false);
  // null = not loaded or the read failed: no Rank Up control shows rather than a wrong one
  const [gifts, setGifts] = useState<Array<{ fromUid: string; toUid: string }> | null>(null);
  const thisWeek = weekId(now);
  const loadGifts = useCallback(async () => {
    if (!league || !chartered || pending || isDemoMode) { setGifts(null); return; }
    setGifts(await leagueService.getRankUpsForWeek(league.id, thisWeek));
  }, [league?.id, chartered, pending, isDemoMode, thisWeek]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadGifts(); }, [loadGifts]);
  const received = useMemo(() => rankUpsReceived(gifts ?? []), [gifts]);
  const rankUpSpent = !!userId && !!gifts && gifts.some((g) => g.fromUid === userId);
  const me = league ? members.find((m) => m.leagueId === league.id && m.userId === userId) : undefined;
  // the league whose sheet was just closed (re-renders; the module set covers the rest of the session)
  const [unlockDismissed, setUnlockDismissed] = useState<string | null>(null);
  const showUnlock = !!league && !!me && unlockDismissed !== league.id && !unlockShownThisSession.has(league.id)
    && shouldShowUnlock({ chartered, isOwner, pending, seen: me.charterUnlockSeen === true });
  const closeUnlock = useCallback(() => {
    if (!league || !userId) return;
    unlockShownThisSession.add(league.id);
    setUnlockDismissed(league.id);
    leagueService.markCharterUnlockSeen(league.id, userId).catch(() => {});
  }, [league, userId]);
  const unlock = useCallback(() => {
    if (league && isOwner && offerVisible) void usePurchaseStore.getState().purchaseCharter(league.id);
  }, [league, isOwner, offerVisible]);
  const onShareCharter = useCallback(async () => {
    if (league) await shareCharter(league, user?.displayName ?? league.ownerName);
  }, [league, user?.displayName]);
  const giveRankUp = useCallback((toUid: string, label: string) => {
    if (!league) return;
    Alert.alert(`Rank up ${label}?`, `One a week. It lifts ${league.name} in search; nobody's points change.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Rank up', onPress: async () => {
        try {
          await leagueService.giveRankUp(league.id, toUid);
        } catch (e) {
          const msg = (e as { message?: unknown })?.message;
          Alert.alert('Rank Up', typeof msg === 'string' && msg ? msg : 'Could not give your Rank Up. Try again.');
        }
        await loadGifts();
        if (userId) loadUserLeagues(userId);
      } },
    ]);
  }, [league, loadGifts, userId, loadUserLeagues]);

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
  const resultIds = league?.raceResultIds ?? (isDemoMode && league ? races.filter((r) => r.round === SHOWCASE_RESULT_ROUND).map((r) => r.id) : []);
  const options = useMemo(() => raceOptions(races as never, resultIds), [races, resultIds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // One document read per race picked; cached for the session (pull to refresh clears it).
  useEffect(() => {
    if (!league || !raceId) { setRaceResult(null); setRaceLoading(false); return; }
    let cancelled = false;
    setRaceLoading(true);
    // the table and the round report share one cached read per league and race (F-120)
    (isDemoMode ? Promise.resolve(showcaseRaceResult(league.id, userId ?? '', options.find((o) => o.raceId === raceId)?.round ?? 0)) : readLeagueRaceResult(league.id, raceId))
      .then((r) => { if (cancelled) return; setRaceResult(r); setRaceLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- league identity, race and mode only
  }, [league?.id, raceId, isDemoMode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    clearRoundReportCache();
    if (userId) await loadUserLeagues(userId);
    if (league) await loadLeagueMembers(league.id, true);
    setRefreshing(false);
  }, [userId, league, loadUserLeagues, loadLeagueMembers]);

  const rows = useMemo<StandingsRow[]>(() => {
    if (!league) return [];
    if (raceId) return raceResultRows(raceResult, userId);
    const mine = members.filter((m) => m.leagueId === league.id);
    return rankStandings(mine, sort, userId);
  }, [members, league, sort, userId, raceId, raceResult]);
  // Race wins ride on the small line of the season table. F-142: that line is the player's name now
  // (the team is the headline), and the wins stay out of the rows so the shared text is unchanged.
  const winsByUser = useMemo(() => new Map(members.filter((m) => m.leagueId === league?.id).map((m) => [m.userId, m.raceWins])), [members, league?.id]);
  const showWins = !raceId && sort === 'season';

  const selectorValue = raceId ?? sort;
  const reportRaceId = raceId ?? options[0]?.raceId ?? null;
  const reportLabel = options.find((o) => o.raceId === reportRaceId)?.label ?? null;
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

  /**
   * Hand the whole table to whatever the player shares with. Text rather than an image on purpose:
   * it pastes into Slack, a text message and an email alike, and needs nothing native behind it.
   * Shares what is on screen, so a league looking at one round shares that round.
   */
  const onShare = useCallback(async () => {
    const message = standingsText({
      leagueName: league?.name ?? 'League',
      caption: selectorLabel,
      rows,
    });
    await shareText(message, `${league?.name ?? 'League'} standings`, 'standings');
  }, [league?.name, selectorLabel, rows]);

  const header = (
    <ScreenHeader
      statusLeft={league ? league.name.toUpperCase() : 'LEAGUE'}
      statusLeftAfter={chartered ? <CharterSquare /> : undefined}
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
          <Pressable onPress={() => router.push('/(simple)/league-search' as never)} accessibilityRole="button" style={({ pressed }) => ({ alignItems: 'center', paddingVertical: 14, opacity: pressed ? 0.7 : 1 })}>
            <MonoLabel color={colors.text.primary}>FIND A PUBLIC LEAGUE ›</MonoLabel>
          </Pressable>
        </View>
      </View>
    );
  }

  // F-175: asked to join, not approved yet. League content is for approved members only.
  if (pending) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={{ flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'center', gap: 12 }}>
          <Text style={{ fontFamily: family.ui.black, fontSize: scaled(34), lineHeight: scaled(34) * 0.98, letterSpacing: -scaled(34) * 0.04, textTransform: 'uppercase', color: colors.text.primary }}>
            {`Waiting on ${league.ownerName || 'the owner'}`}
          </Text>
        </View>
      </View>
    );
  }

  const charterBlock = (
    <>
      {isOwner && requestCount > 0 ? <View style={{ marginTop: 12 }}><CharterRequestRow count={requestCount} onPress={() => setRequestsOpen(true)} /></View> : null}
      {isOwner && chartered ? <View style={{ marginTop: 12 }}><CharterOnCard leagueName={league.name} onShare={onShareCharter} /></View> : null}
      {isOwner && !chartered && offerVisible && charterPrice ? <View style={{ marginTop: 12 }}><CharterOfferCard leagueName={league.name} price={charterPrice} onUnlock={unlock} busy={charterBusy} /></View> : null}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      {header}
      <View style={{ marginHorizontal: spacing.xl, marginTop: 22, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <MonoLabel>POS · PLAYER</MonoLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => setPicking(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Showing ${selectorLabel}. Choose season, last race or a race`}>
            <MonoLabel color={colors.text.primary}>{`${selectorLabel} ▾`}</MonoLabel>
          </Pressable>
          {rows.length ? (
            <Pressable
              onPress={onShare}
              // The label is 11px, so the row is nowhere near a 44pt target on its own.
              hitSlop={{ top: 18, bottom: 18, left: 14, right: 14 }}
              accessibilityRole="button"
              accessibilityLabel="Share the standings"
              accessibilityHint={`Shares the ${selectorLabel.toLowerCase()} table as text`}
            >
              <MonoLabel color={colors.primary}>SHARE</MonoLabel>
            </Pressable>
          ) : null}
        </View>
      </View>
      {chartered && !isOwner ? <View style={{ marginHorizontal: spacing.xl, marginTop: 8 }}><CharterMemberLine ownerName={league.ownerName || 'The owner'} /></View> : null}
      {raceId && raceResult?.estimated ? (
        <Text style={[mono(10, 'medium'), { color: colors.text.muted, marginHorizontal: spacing.xl, marginTop: 8 }]}>RACE-DAY POINTS ONLY · NOT COUNTED AS A WIN</Text>
      ) : null}
      {/* F-120: its own row, not a third link in the header: that row has no room, and this is the thing to tap after a race */}
      {reportRaceId ? (
        <Pressable
          onPress={() => setReporting(true)}
          accessibilityRole="button"
          accessibilityLabel={`Round report${reportLabel ? `, ${reportLabel}` : ''}`}
          accessibilityHint="How everyone in the league did in this race"
          style={({ pressed }) => ({ marginHorizontal: spacing.xl, marginTop: 10, paddingVertical: scaled(12), paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.card, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 6, opacity: pressed ? 0.7 : 1 })}
        >
          {/* a wrapping row: when the two do not fit side by side the second drops under the first, instead of squeezing the first to a column of letters */}
          <MonoLabel color={colors.text.primary} style={{ flexShrink: 1 }}>{`ROUND REPORT${reportLabel ? ` · ${reportLabel}` : ''}`}</MonoLabel>
          <MonoLabel color={colors.primary} style={{ marginLeft: 'auto' }}>HOW THE LEAGUE DID →</MonoLabel>
        </Pressable>
      ) : null}
      {picking ? <GridRaceSelectSheet options={selectorOptions} value={selectorValue} onPick={onPick} onClose={() => setPicking(false)} /> : null}
      {requestsOpen ? (
        <CharterRequestSheet leagueId={league.id} leagueName={league.name} approved={Math.max(members.filter((m) => m.leagueId === league.id).length, league.memberCount || 0)} cap={approvalCap(league, now)} chartered={chartered}
          onClose={() => setRequestsOpen(false)} onChanged={() => { if (userId) loadUserLeagues(userId); loadLeagueMembers(league.id, true).catch(() => {}); }} />
      ) : null}
      {showUnlock ? <CharterUnlockSheet ownerName={league.ownerName || 'The owner'} leagueName={league.name} onClose={closeUnlock} /> : null}
      {reporting && league && reportRaceId ? <GridRoundReportSheet leagueId={league.id} raceId={reportRaceId} resultIds={league.raceResultIds} leagueName={league.name} inviteCode={league.inviteCode} onClose={() => setReporting(false)} /> : null}
      <FlatList
        ListHeaderComponent={<>{charterBlock}{feed}</>}
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
            accessibilityLabel={`${item.rank}, ${item.team || item.name}${item.team ? `, ${item.name}` : ''}, ${item.shown}`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: scaled(18), borderBottomWidth: 1, borderBottomColor: colors.borderLight, opacity: pressed ? 0.7 : 1 })}
          >
            <View style={{ width: scaled(44), gap: 3 }}>
              <Text style={{ fontFamily: family.ui.black, fontSize: scaled(30), lineHeight: scaled(30), letterSpacing: -scaled(30) * 0.05, color: item.isMe ? colors.primary : colors.text.primary }}>{item.rankLabel}</Text>
              <Text style={[mono(10), { color: item.movementDir === 'up' ? colors.positive : item.movementDir === 'down' ? colors.primary : colors.text.muted }]}>{item.movement}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontFamily: family.ui.black, fontSize: scaled(16), lineHeight: scaled(17), letterSpacing: -scaled(16) * 0.02, textTransform: 'uppercase', color: colors.text.primary }}>{item.team || item.name}</Text>
              {/* F-142: the team is the headline, the player's name the small line */}
              {item.team || (showWins && winsByUser.get(item.userId)) ? (
                <Text numberOfLines={1} style={[mono(11, 'medium'), { color: colors.text.muted, textTransform: 'uppercase' }]}>
                  {item.team ? teamLineWithWins(item.name, showWins ? winsByUser.get(item.userId) : 0) : teamLineWithWins('', winsByUser.get(item.userId))}
                </Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[mono(18), { letterSpacing: -scaled(18) * 0.02 }]}>{item.shown}</Text>
              <Text style={[mono(11), { color: item.isLeader ? colors.primary : colors.text.muted }]}>{item.delta}</Text>
              {item.moonshot ? <Text style={[mono(10), { color: item.moonshot.startsWith('+') ? colors.positive : colors.primary }]}>🚀 {item.moonshot}</Text> : null}
              {/* F-175: Rank Up on another player's row in a chartered league; hidden on your own */}
              {chartered && gifts && !raceId && !item.isMe && userId && !isDemoMode ? (
                rankUpSpent ? (
                  <Text accessibilityLabel={`${received.get(item.userId) ?? 0} Rank Ups this week`} style={[mono(10), { color: colors.text.muted }]}>{rankUpLabel(true, received.get(item.userId) ?? 0)}</Text>
                ) : (
                  <Pressable onPress={() => giveRankUp(item.userId, item.team || item.name)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Rank up ${item.team || item.name}`}>
                    <Text style={[mono(10), { color: CHARTER_RED }]}>{rankUpLabel(false, 0)}</Text>
                  </Pressable>
                )
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
});

