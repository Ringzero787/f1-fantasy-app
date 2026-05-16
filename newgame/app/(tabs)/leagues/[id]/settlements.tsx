import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { leagueService } from '@services/league.service';
import { ledgerService } from '@services/ledger.service';
import { MemberAvatar, StatusPill, Num } from '@components/tl';
import { useTheme } from '@/theme';
import type { League, Settlement } from '@/types';

export default function SettlementsScreen() {
  const t = useTheme();
  const { id: leagueId } = useLocalSearchParams<{ id: string }>();
  const userId = useAuthStore((s) => s.user?.id);

  const [league, setLeague] = useState<League | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    try {
      const [l, all] = await Promise.all([
        leagueService.getLeague(leagueId),
        ledgerService.getSettlementsForLeague(leagueId),
      ]);
      setLeague(l);
      setSettlements(all);
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const onConfirm = (s: Settlement) => {
    Alert.alert(
      `Confirm received ${formatAmount(s.amount, league?.ledger.currencyLabel)}?`,
      `${s.fromDisplayName} says they sent it. This rebalances both bags.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            await ledgerService.confirmSettlement(s.leagueId, s.id);
            reload();
          },
        },
      ]
    );
  };

  const onDispute = (s: Settlement) => {
    Alert.alert(
      'Dispute this?',
      `Marks ${s.fromDisplayName}'s claim as disputed. The commissioner can resolve.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dispute',
          style: 'destructive',
          onPress: async () => {
            await ledgerService.disputeSettlement(s.leagueId, s.id);
            reload();
          },
        },
      ]
    );
  };

  const onResolve = (s: Settlement) => {
    Alert.alert(
      'Resolve as commissioner',
      `Override the dispute on ${s.fromDisplayName} → ${s.toDisplayName} ${formatAmount(s.amount, league?.ledger.currencyLabel)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Force settled',
          onPress: async () => {
            await ledgerService.resolveSettlementAsCommissioner(s.leagueId, s.id, 'settled');
            reload();
          },
        },
        {
          text: 'Cancel transfer',
          style: 'destructive',
          onPress: async () => {
            await ledgerService.resolveSettlementAsCommissioner(s.leagueId, s.id, 'canceled');
            reload();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (!league) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <Text style={{ color: t.textMute, fontFamily: t.fSans }}>League not found.</Text>
      </View>
    );
  }
  if (settlements.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, padding: 24 }}>
        <Text style={{ color: t.textMute, fontFamily: t.fSans, fontSize: 14, textAlign: 'center' }}>
          No settlement activity yet.
        </Text>
      </View>
    );
  }

  const isOwner = league.ownerId === userId;
  const cur = league.ledger.currencyLabel;

  return (
    <FlatList
      data={settlements}
      keyExtractor={(s) => s.id}
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 8 }}
      renderItem={({ item }) => (
        <SettlementCard
          settlement={item}
          currency={cur}
          isMyIncoming={item.toUserId === userId && item.status === 'awaiting_confirmation'}
          isOwner={isOwner}
          onConfirm={() => onConfirm(item)}
          onDispute={() => onDispute(item)}
          onResolve={() => onResolve(item)}
        />
      )}
    />
  );
}

function SettlementCard({
  settlement,
  currency,
  isMyIncoming,
  isOwner,
  onConfirm,
  onDispute,
  onResolve,
}: {
  settlement: Settlement;
  currency: string;
  isMyIncoming: boolean;
  isOwner: boolean;
  onConfirm: () => void;
  onDispute: () => void;
  onResolve: () => void;
}) {
  const t = useTheme();
  const focal = settlement.status === 'awaiting_confirmation' && isMyIncoming;
  const faded = settlement.status === 'canceled';

  return (
    <View
      style={{
        backgroundColor: focal ? t.accentSoft : t.surface,
        borderWidth: 1,
        borderColor: t.line,
        borderRadius: 10,
        padding: 12,
        opacity: faded ? 0.55 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <MemberAvatar member={{ id: settlement.fromUserId, name: settlement.fromDisplayName }} size={26} />
        <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 11 }}>→</Text>
        <MemberAvatar member={{ id: settlement.toUserId, name: settlement.toDisplayName }} size={26} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontFamily: t.fSans, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
            {settlement.fromDisplayName} → {settlement.toDisplayName}
          </Text>
          {settlement.externalNote ? (
            <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 10, marginTop: 2, letterSpacing: 0.4 }}>
              {settlement.externalNote}
            </Text>
          ) : null}
        </View>
        <Num size={16} weight="700">
          {currency}
          {settlement.amount.toFixed(2)}
        </Num>
      </View>

      <View
        style={{
          marginTop: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <StatusPill status={settlement.status === 'pending_payment' ? 'awaiting_confirmation' : (settlement.status as 'awaiting_confirmation' | 'settled' | 'disputed' | 'canceled')} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {settlement.status === 'awaiting_confirmation' && isMyIncoming ? (
            <>
              <ActionBtn label="Dispute" tone="danger" onPress={onDispute} ghost />
              <ActionBtn label="Confirm received" tone="primary" onPress={onConfirm} />
            </>
          ) : null}
          {settlement.status === 'disputed' && isOwner ? (
            <>
              <ActionBtn label="Cancel" tone="danger" onPress={onResolve} ghost />
              <ActionBtn label="Force settle" tone="danger" onPress={onResolve} />
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ActionBtn({ label, tone, ghost, onPress }: { label: string; tone: 'primary' | 'danger'; ghost?: boolean; onPress: () => void }) {
  const t = useTheme();
  const fillColor = tone === 'danger' ? t.danger : t.accent;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 5,
          backgroundColor: ghost ? 'transparent' : fillColor,
          borderWidth: ghost ? 1 : 0,
          borderColor: ghost ? (tone === 'danger' ? t.danger : t.line) : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: ghost ? (tone === 'danger' ? t.danger : t.textDim) : '#0E1116',
          fontFamily: t.fMono,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatAmount(n: number, currency = '$'): string {
  return `${currency}${n.toFixed(2)}`;
}
