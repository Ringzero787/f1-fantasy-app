import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { leagueService } from '@services/league.service';
import { ledgerService } from '@services/ledger.service';
import { HelmetAvatar } from '@components/HelmetAvatar';
import {
  SectionLabel,
  GhostBtn,
  BagSplit,
  ActionTile,
  ChevronRank,
  StatusBanner,
  Num,
  CashFlowStat,
} from '@components/tl';
import { useTheme } from '@/theme';
import type { BagOfCash, League, LeagueMember } from '@/types';

type StandingsView = 'points' | 'cash';

export default function LeagueDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [bag, setBag] = useState<BagOfCash | null>(null);
  const [cashBoard, setCashBoard] = useState<(BagOfCash & { displayName: string; rank: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [standingsView, setStandingsView] = useState<StandingsView>('points');

  const reload = useCallback(async () => {
    if (!id || !user) return;
    setLoading(true);
    try {
      const [l, ms] = await Promise.all([leagueService.getLeague(id), leagueService.getMembers(id)]);
      setLeague(l);
      setMembers(ms);
      if (l?.ledger.enabled) {
        const b = await ledgerService.computeBag({ leagueId: id, userId: user.id, currencyLabel: l.ledger.currencyLabel });
        setBag(b);
        const allBags = await ledgerService.computeBagsForAllMembers({
          leagueId: id,
          members: ms.map((m) => ({ userId: m.userId, displayName: m.displayName })),
          currencyLabel: l.ledger.currencyLabel,
        });
        setCashBoard(ledgerService.cashLeaderboard(allBags));
      } else {
        setBag(null);
        setCashBoard([]);
      }
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const onShareCode = async () => {
    if (!league) return;
    try {
      await Share.share({
        message: `Join my Track Limits league "${league.name}" with code ${league.inviteCode}`,
      });
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

  const onPledgeBuyIn = async () => {
    if (!league || !user || !league.ledger.enabled) return;
    Alert.alert(
      'Pledge buy-in?',
      `Mark your ${league.ledger.currencyLabel}${league.ledger.buyInAmount} buy-in as pledged. Send it via Venmo / Cash App / Zelle.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pledge',
          onPress: async () => {
            await ledgerService.pledgeBuyIn({ leagueId: league.id, userId: user.id, amount: league.ledger.buyInAmount });
            reload();
          },
        },
      ]
    );
  };

  if (loading || !league) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const isOwner = league.ownerId === user?.id;
  const ledgerOn = league.ledger.enabled;

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Header */}
      <View style={{ padding: 20, paddingTop: 8 }}>
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
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontFamily: t.fDisp,
            fontWeight: '600',
            fontSize: 26,
            letterSpacing: -0.8,
            color: t.text,
          }}
        >
          {league.name}
        </Text>
      </View>

      {/* Invite code card */}
      <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
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
            <Text
              style={{
                fontFamily: t.fMono,
                fontSize: 9,
                color: t.textMute,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              Invite code
            </Text>
            <Text style={{ marginTop: 2, fontFamily: t.fMono, fontSize: 18, fontWeight: '600', color: t.text, letterSpacing: 2 }}>
              {league.inviteCode}
            </Text>
          </View>
          <GhostBtn title="Share" onPress={onShareCode} />
        </View>
      </View>

      {/* Bag of cash hero */}
      {ledgerOn && bag ? (
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <View
            style={{
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.line,
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            <View style={{ padding: 18, borderBottomWidth: 1, borderBottomColor: t.lineSoft }}>
              <Text
                style={{
                  fontFamily: t.fMono,
                  fontSize: 10,
                  color: t.accent,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  fontWeight: '700',
                }}
              >
                Bag of cash · your position
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                <Text
                  style={{
                    fontFamily: t.fDisp,
                    fontWeight: '600',
                    fontSize: 38,
                    color: bag.net >= 0 ? t.success : t.danger,
                    letterSpacing: -1.0,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {bag.net >= 0 ? '+' : '−'}
                  {bag.currencyLabel}
                  {Math.abs(bag.net).toFixed(2)}
                </Text>
                <Text
                  style={{
                    fontFamily: t.fMono,
                    fontSize: 11,
                    color: t.textMute,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}
                >
                  {bag.net >= 0 ? 'net owed to you' : 'net you owe'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <BagSplit label="Owed to you" amount={bag.unsettledOwed} positive currency={bag.currencyLabel} />
                <BagSplit label="You owe" amount={bag.unsettledOwing} positive={false} currency={bag.currencyLabel} />
              </View>
            </View>

            {/* Action grid 2x2 */}
            <View>
              <View style={{ flexDirection: 'row', backgroundColor: t.lineSoft, gap: 1 }}>
                <ActionTile label="Settle up" sub="Optimal transfers" primary onPress={() => router.push(`/(tabs)/leagues/${league.id}/settle-up`)} />
                <ActionTile label="Settlements" sub="Confirm / dispute" onPress={() => router.push(`/(tabs)/leagues/${league.id}/settlements`)} />
              </View>
              <View style={{ flexDirection: 'row', backgroundColor: t.lineSoft, gap: 1, borderTopWidth: 1, borderTopColor: t.lineSoft }}>
                <ActionTile label="Ledger" sub="Full history" onPress={() => router.push(`/(tabs)/leagues/${league.id}/ledger`)} />
                {isOwner ? (
                  <ActionTile label="Create payout" sub="Commish action" onPress={() => router.push(`/(tabs)/leagues/${league.id}/payout`)} />
                ) : (
                  <ActionTile label="House rules" sub="Read only" onPress={() => undefined} />
                )}
              </View>
            </View>

            <Text
              style={{
                padding: 12,
                fontFamily: t.fMono,
                fontSize: 10,
                color: t.textMute,
                letterSpacing: 0.4,
                textAlign: 'center',
                borderTopWidth: 1,
                borderTopColor: t.lineSoft,
              }}
            >
              Track Limits never moves real money. Settle on Venmo, Cash App, or Zelle.
            </Text>
          </View>

          {bag.net === 0 && bag.unsettledOwing === 0 ? (
            <Pressable
              onPress={onPledgeBuyIn}
              style={({ pressed }) => [
                {
                  marginTop: 12,
                  backgroundColor: t.accent,
                  borderRadius: 10,
                  padding: 14,
                  alignItems: 'center',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={{ color: '#0E1116', fontFamily: t.fSans, fontWeight: '700', fontSize: 15, letterSpacing: 0.2 }}>
                Pledge buy-in ({league.ledger.currencyLabel}
                {league.ledger.buyInAmount})
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Standings */}
      <View style={{ marginTop: 22 }}>
        <SectionLabel trailing={ledgerOn ? undefined : 'STANDINGS'}>Leaderboard</SectionLabel>
        {ledgerOn ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', backgroundColor: t.surface, borderRadius: 8, padding: 3, borderWidth: 1, borderColor: t.line, gap: 4 }}>
              {(['points', 'cash'] as const).map((opt) => {
                const active = standingsView === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setStandingsView(opt)}
                    style={{ flex: 1, padding: 7, borderRadius: 6, backgroundColor: active ? t.accent : 'transparent', alignItems: 'center' }}
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
                      {opt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12, overflow: 'hidden' }}>
            {standingsView === 'points'
              ? members.map((m, idx) => (
                  <MemberRow
                    key={m.id}
                    rank={idx + 1}
                    name={m.displayName}
                    you={m.userId === user?.id}
                    sub={`${m.totalPoints} pts · ${m.raceWins} ${m.raceWins === 1 ? 'win' : 'wins'}`}
                    rightValue={`${m.totalPoints}`}
                    rightColor={t.text}
                    isFirst={idx === 0}
                    isLast={idx === members.length - 1}
                    userId={m.userId}
                  />
                ))
              : cashBoard.map((b, idx) => {
                  const isTop = idx === 0;
                  const isBottom = idx === cashBoard.length - 1 && cashBoard.length > 1;
                  return (
                    <MemberRow
                      key={b.userId}
                      rank={idx + 1}
                      name={b.displayName}
                      you={b.userId === user?.id}
                      sub={`net ${b.currencyLabel}${b.net.toFixed(0)}`}
                      rightValue=""
                      rightNode={<CashFlowStat amount={b.net} size={16} prefix={b.currencyLabel} />}
                      chevron={isTop ? 'top' : isBottom ? 'bottom' : null}
                      isFirst={idx === 0}
                      isLast={idx === cashBoard.length - 1}
                      userId={b.userId}
                    />
                  );
                })}
          </View>
        </View>
      </View>

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
            <Text style={{ color: t.danger, fontFamily: t.fSans, fontWeight: '600', fontSize: 14 }}>Leave league</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function MemberRow({
  rank,
  name,
  you,
  sub,
  rightValue,
  rightNode,
  rightColor,
  chevron,
  isFirst,
  isLast,
  userId,
}: {
  rank: number;
  name: string;
  you: boolean;
  sub: string;
  rightValue: string;
  rightNode?: React.ReactNode;
  rightColor?: string;
  chevron?: 'top' | 'bottom' | null;
  isFirst: boolean;
  isLast: boolean;
  userId: string;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        padding: 14,
        backgroundColor: you ? t.accentSoft : 'transparent',
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: t.lineSoft,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 4,
          backgroundColor: isFirst ? t.accent : t.surface2,
          borderWidth: isFirst ? 0 : 1,
          borderColor: t.line,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: isFirst ? '#0E1116' : t.textDim, fontFamily: t.fMono, fontSize: 12, fontWeight: '700' }}>{rank}</Text>
      </View>
      <HelmetAvatar userId={userId} displayName={name} size={32} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontFamily: t.fSans, fontWeight: you ? '600' : '500', fontSize: 14, color: t.text }}>{name}</Text>
          {chevron ? <ChevronRank kind={chevron} /> : null}
        </View>
        <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 0.4, marginTop: 2 }}>{sub}</Text>
      </View>
      {rightNode ? rightNode : (
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 16,
            fontWeight: '700',
            color: rightColor || t.text,
            letterSpacing: -0.2,
            fontVariant: ['tabular-nums'],
          }}
        >
          {rightValue}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
