// League Detail — header + invite code + edge/biggest-haul hero + leaderboard
// with three sort modes (vs Ben / Points / Cash). Per the v2 design handoff:
// the bag-of-cash + inline ledger action grid moved out of the main page; the
// sub-screens (settle-up, settlements, ledger, payout) still exist and are
// reachable via a compact "Ledger tools" link block for ledger-enabled leagues.

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View, RefreshControl } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { leagueService } from '@services/league.service';
import { useUpcomingRace } from '@/hooks/useUpcomingRace';
import { HelmetAvatar } from '@components/HelmetAvatar';
import { SectionLabel, GhostBtn, ChevronRank } from '@components/tl';
import { useTheme } from '@/theme';
import type { League, LeagueMember } from '@/types';

type Enriched = LeagueMember & {
  totalCash: number;
  callsCorrect: number;
  callsTotal: number;
};

type SortMode = 'ben' | 'points' | 'cash';

export default function LeagueDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { data: upcomingRace } = useUpcomingRace();
  const seasonId = upcomingRace?.seasonId ?? '2026';

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Enriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>('ben');

  const reload = useCallback(async () => {
    if (!id || !user) return;
    setLoading(true);
    try {
      const [l, enriched] = await Promise.all([
        leagueService.getLeague(id),
        leagueService.getStandings({ leagueId: id, seasonId }),
      ]);
      setLeague(l);
      setMembers(enriched);
    } finally {
      setLoading(false);
    }
  }, [id, user, seasonId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  // Pull-to-refresh reuses reload() but tracks its own flag so the full-screen
  // spinner (keyed on `loading`) doesn't replace the list mid-pull.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  // Compute per-sort orderings + top/bottom IDs for chevron highlights.
  const sorted = useMemo(() => {
    const arr = [...members];
    if (sortBy === 'ben' || sortBy === 'cash') arr.sort((a, b) => b.totalCash - a.totalCash);
    else arr.sort((a, b) => b.totalPoints - a.totalPoints);
    return arr;
  }, [members, sortBy]);

  const byCash = useMemo(() => [...members].sort((a, b) => b.totalCash - a.totalCash), [members]);
  const byPoints = useMemo(() => [...members].sort((a, b) => b.totalPoints - a.totalPoints), [members]);
  const cashTopId = byCash[0]?.userId;
  const cashBotId = byCash.length > 1 ? byCash[byCash.length - 1]?.userId : null;
  const ptsTopId = byPoints[0]?.userId;
  // For our model edge == cash (both are net from Ben mechanic); we still
  // expose ben tab separately so users can switch wording.
  const benTopId = cashTopId;
  const benBotId = cashBotId;

  const me = members.find((m) => m.userId === user?.id);
  const myEdge = me?.totalCash ?? 0;
  const topMember = byCash[0];

  const onShareCode = async () => {
    if (!league) return;
    try {
      await Share.share({ message: `Join my Track Limits league "${league.name}" with code ${league.inviteCode}` });
    } catch {
      // cancelled
    }
  };

  const onLeave = () => {
    if (!league || !user) return;
    Alert.alert('Leave league?', `You'll lose your spot in ${league.name}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await leagueService.leaveLeague(league.id, user.id);
          router.back();
        },
      },
    ]);
  };

  // Gate only on the FIRST load — during pull-to-refresh (and focus reloads)
  // `league` is already populated and the list must stay mounted.
  if (!league) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const isOwner = league.ownerId === user?.id;
  const ledgerOn = league.ledger.enabled;

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 80 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />}>
      {/* Header */}
      <View style={{ padding: 20, paddingTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {league.avatarUrl ? (
            <Image
              source={{ uri: league.avatarUrl }}
              style={{ width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderColor: t.line }}
              resizeMode="cover"
            />
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontFamily: t.fMono,
                fontSize: 11,
                color: t.textMute,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              League · {league.memberCount} of {league.maxMembers}
              {isOwner ? ' · You commish' : ''}
              {league.isPublic ? ' · Public' : ''}
            </Text>
            <Text
              style={{
                marginTop: 4,
                fontFamily: t.fDisp,
                fontWeight: '600',
                fontSize: 26,
                letterSpacing: -0.8,
                color: t.text,
              }}
              numberOfLines={1}
            >
              {league.name}
            </Text>
          </View>
          {isOwner ? (
            <Pressable
              onPress={() => router.push(`/(tabs)/leagues/${league.id}/settings`)}
              style={({ pressed }) => [
                {
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: t.line,
                  backgroundColor: t.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              accessibilityLabel="League settings"
            >
              <Text style={{ fontSize: 18, color: t.textDim }}>⚙</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Invite code */}
      <View style={{ paddingHorizontal: 16 }}>
        <View
          style={{
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.line,
            borderRadius: 12,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View>
            <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Invite code
            </Text>
            <Text style={{ marginTop: 2, fontFamily: t.fMono, fontSize: 18, fontWeight: '600', color: t.text, letterSpacing: 2 }}>
              {league.inviteCode}
            </Text>
          </View>
          <GhostBtn title="Share" onPress={onShareCode} />
        </View>
      </View>

      {/* Hero — your edge + biggest haul (two cells with a hairline between) */}
      <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
        <View
          style={{
            backgroundColor: t.line,
            borderRadius: 12,
            overflow: 'hidden',
            flexDirection: 'row',
            gap: 1,
          }}
        >
          <View style={{ flex: 1, backgroundColor: t.surface, padding: 14 }}>
            <Text
              style={{
                fontFamily: t.fMono,
                fontSize: 9,
                color: t.textMute,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                fontWeight: '700',
              }}
            >
              Your edge
            </Text>
            <Text
              style={{
                marginTop: 4,
                fontFamily: t.fDisp,
                fontWeight: '700',
                fontSize: 24,
                color: myEdge >= 0 ? t.success : t.danger,
                letterSpacing: -0.6,
                fontVariant: ['tabular-nums'],
              }}
            >
              {myEdge >= 0 ? '+' : '−'}${Math.abs(myEdge).toFixed(0)}
            </Text>
            <Text style={{ marginTop: 2, fontFamily: t.fMono, fontSize: 10, color: t.textDim, letterSpacing: 0.4 }}>
              vs Ben this season
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: t.surface, padding: 14 }}>
            <Text
              style={{
                fontFamily: t.fMono,
                fontSize: 9,
                color: t.textMute,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                fontWeight: '700',
              }}
            >
              ▲ Biggest haul
            </Text>
            <Text
              style={{
                marginTop: 4,
                fontFamily: t.fDisp,
                fontWeight: '700',
                fontSize: 20,
                color: t.text,
                letterSpacing: -0.4,
              }}
              numberOfLines={1}
            >
              {topMember?.displayName ?? '—'}
            </Text>
            <Text
              style={{
                marginTop: 2,
                fontFamily: t.fMono,
                fontSize: 10,
                color: topMember && topMember.totalCash >= 0 ? t.success : t.textDim,
                letterSpacing: 0.4,
                fontWeight: '700',
              }}
            >
              {topMember
                ? `${topMember.totalCash >= 0 ? '+' : '−'}$${Math.abs(topMember.totalCash).toFixed(0)} · ${topMember.callsCorrect}W`
                : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* Leaderboard */}
      <View style={{ marginTop: 22 }}>
        <SectionLabel trailing={`R${upcomingRace?.round ?? ''} · LIVE`}>Leaderboard</SectionLabel>
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', backgroundColor: t.surface, borderRadius: 8, padding: 3, borderWidth: 1, borderColor: t.line, gap: 4 }}>
            {([
              { id: 'ben', label: 'vs Ben' },
              { id: 'points', label: 'Points' },
              { id: 'cash', label: 'Cash' },
            ] as const).map((opt) => {
              const active = sortBy === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => setSortBy(opt.id)}
                  style={{ flex: 1, padding: 8, borderRadius: 6, backgroundColor: active ? t.accent : 'transparent', alignItems: 'center' }}
                >
                  <Text
                    style={{
                      color: active ? '#0E1116' : t.textDim,
                      fontFamily: t.fMono,
                      fontSize: 10,
                      fontWeight: '700',
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12, overflow: 'hidden' }}>
            {sorted.map((m, i) => {
              const isLast = i === sorted.length - 1;
              const isMe = m.userId === user?.id;
              const lost = Math.max(0, m.callsTotal - m.callsCorrect);
              const chevron: 'top' | 'bottom' | null =
                sortBy === 'cash' && m.userId === cashTopId ? 'top' :
                sortBy === 'cash' && m.userId === cashBotId ? 'bottom' :
                sortBy === 'ben' && m.userId === benTopId ? 'top' :
                sortBy === 'ben' && m.userId === benBotId ? 'bottom' :
                sortBy === 'points' && m.userId === ptsTopId ? 'top' :
                null;

              let primary = '';
              let primaryColor = t.text;
              if (sortBy === 'points') {
                primary = String(m.totalPoints);
              } else {
                const v = m.totalCash;
                primary = `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(0)}`;
                primaryColor = v >= 0 ? t.success : t.danger;
              }

              const sub =
                sortBy === 'points'
                  ? `${m.raceWins} ${m.raceWins === 1 ? 'win' : 'wins'} · ${m.callsCorrect}W-${lost}L vs Ben`
                  : sortBy === 'ben'
                    ? `${m.callsCorrect}W-${lost}L · ${m.totalPoints} pts`
                    : `${m.callsCorrect}W vs Ben · ${m.totalPoints} pts`;

              return (
                <Pressable
                  key={m.id}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/leagues/[id]/member',
                      params: { id: league.id, uid: m.userId, name: m.displayName, seasonId },
                    })
                  }
                  style={({ pressed }) => ({
                    padding: 14,
                    backgroundColor: pressed ? t.surface2 : isMe ? t.accentSoft : 'transparent',
                    borderBottomWidth: isLast ? 0 : 1,
                    borderBottomColor: t.lineSoft,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  })}
                >
                  <Text
                    style={{
                      width: 24,
                      fontFamily: t.fMono,
                      fontSize: 12,
                      fontWeight: '700',
                      color: i === 0 ? t.accent : t.textMute,
                      textAlign: 'center',
                    }}
                  >
                    {i + 1}
                  </Text>
                  <HelmetAvatar userId={m.userId} displayName={m.displayName} size={30} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={{ fontFamily: t.fSans, fontWeight: isMe ? '600' : '500', fontSize: 14, color: t.text }} numberOfLines={1}>
                        {m.displayName}
                      </Text>
                      {chevron ? <ChevronRank kind={chevron} /> : null}
                    </View>
                    <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 0.4, marginTop: 2 }}>
                      {sub}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={{
                        fontFamily: t.fMono,
                        fontSize: 16,
                        fontWeight: '700',
                        color: primaryColor,
                        letterSpacing: -0.2,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {primary}
                    </Text>
                    {sortBy !== 'points' ? (
                      <Text
                        style={{
                          marginTop: 2,
                          fontFamily: t.fMono,
                          fontSize: 9,
                          color: t.textMute,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          fontWeight: '600',
                        }}
                      >
                        {sortBy === 'cash' ? 'NET' : 'EDGE'}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* Ledger tools — compact link block, only shown when ledger enabled */}
      {ledgerOn ? (
        <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
          <SectionLabel>Ledger</SectionLabel>
          <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12, overflow: 'hidden' }}>
            <LedgerLink label="Settle up" sub="Optimal transfers" onPress={() => router.push(`/(tabs)/leagues/${league.id}/settle-up`)} />
            <LedgerLink label="Settlements" sub="Confirm / dispute" onPress={() => router.push(`/(tabs)/leagues/${league.id}/settlements`)} />
            <LedgerLink label="Ledger" sub="Full history" onPress={() => router.push(`/(tabs)/leagues/${league.id}/ledger`)} />
            {isOwner ? (
              <LedgerLink label="Create payout" sub="Commish action" onPress={() => router.push(`/(tabs)/leagues/${league.id}/payout`)} isLast />
            ) : null}
          </View>
          <Text style={{ marginTop: 8, fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 0.4, textAlign: 'center' }}>
            Track Limits never moves real money. Settle on Venmo, Cash App, or Zelle.
          </Text>
        </View>
      ) : null}

      {!isOwner ? (
        <View style={{ padding: 16, marginTop: 16 }}>
          <Pressable
            onPress={onLeave}
            style={({ pressed }) => [
              {
                paddingVertical: 14,
                backgroundColor: t.surface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: t.line,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ color: t.danger, fontFamily: t.fSans, fontWeight: '600', fontSize: 14 }}>
              Leave league
            </Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function LedgerLink({
  label,
  sub,
  onPress,
  isLast,
}: {
  label: string;
  sub: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: t.lineSoft,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: t.fSans, fontWeight: '600', fontSize: 14, color: t.text }}>{label}</Text>
        <Text style={{ marginTop: 1, fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 0.4 }}>{sub}</Text>
      </View>
      <Text style={{ color: t.textMute, fontSize: 16 }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
