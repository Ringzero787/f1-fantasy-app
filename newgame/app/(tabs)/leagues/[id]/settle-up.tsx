import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { leagueService } from '@services/league.service';
import { ledgerService } from '@services/ledger.service';
import { MemberAvatar, SectionGroup } from '@components/tl';
import { MarkSentSheet } from '@components/sheets/MarkSentSheet';
import { useTheme } from '@/theme';
import type { League } from '@/types';

interface Transfer {
  fromUserId: string;
  fromDisplayName: string;
  toUserId: string;
  toDisplayName: string;
  amount: number;
}

export default function SettleUpScreen() {
  const t = useTheme();
  const { id: leagueId } = useLocalSearchParams<{ id: string }>();
  const userId = useAuthStore((s) => s.user?.id);
  const userName = useAuthStore((s) => s.user?.displayName);

  const [loading, setLoading] = useState(true);
  const [league, setLeague] = useState<League | null>(null);
  const [plan, setPlan] = useState<Transfer[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [marked, setMarked] = useState<Record<string, true>>({});
  const [sheetTarget, setSheetTarget] = useState<Transfer | null>(null);

  const reload = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    try {
      const l = await leagueService.getLeague(leagueId);
      const ms = await leagueService.getMembers(leagueId);
      if (!l) {
        setLoading(false);
        return;
      }
      setLeague(l);
      const bags = await ledgerService.computeBagsForAllMembers({
        leagueId,
        members: ms.map((m) => ({ userId: m.userId, displayName: m.displayName })),
        currencyLabel: l.ledger.currencyLabel,
      });
      const transfers = ledgerService.computeSettleUpPlan(
        bags.map((b) => ({ userId: b.userId, displayName: b.displayName, net: b.net }))
      );
      setPlan(transfers);
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const onMarkSent = (transfer: Transfer) => {
    if (!userId || !league) return;
    if (transfer.fromUserId !== userId) {
      Alert.alert('Not your transfer', 'Only the sender can mark a payment as sent.');
      return;
    }
    setSheetTarget(transfer);
  };

  const onSheetSent = () => {
    if (sheetTarget) {
      const key = `${sheetTarget.fromUserId}-${sheetTarget.toUserId}-${sheetTarget.amount}`;
      setMarked((m) => ({ ...m, [key]: true }));
    }
    reload();
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
          Loading...
        </Text>
      </View>
    );
  }

  if (!league || !league.ledger.enabled) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, padding: 24 }}>
        <Text style={{ color: t.textMute, fontFamily: t.fSans, fontSize: 14, textAlign: 'center' }}>
          This league doesn't track money — nothing to settle.
        </Text>
      </View>
    );
  }

  if (plan.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, padding: 60 }}>
        <Text style={{ color: t.text, fontFamily: t.fDisp, fontSize: 60, lineHeight: 64 }}>—</Text>
        <Text style={{ color: t.text, fontFamily: t.fDisp, fontSize: 22, fontWeight: '600', letterSpacing: -0.4, marginTop: 16 }}>
          All settled up
        </Text>
        <Text style={{ color: t.textDim, fontFamily: t.fSans, fontSize: 13, lineHeight: 20, marginTop: 8, textAlign: 'center' }}>
          No outstanding balances. Bag of cash is zeroed across the league.
        </Text>
      </View>
    );
  }

  const cur = league.ledger.currencyLabel;
  const myOutgoing = plan.filter((p) => p.fromUserId === userId);
  const myIncoming = plan.filter((p) => p.toUserId === userId);
  const between = plan.filter((p) => p.fromUserId !== userId && p.toUserId !== userId);
  const memberSet = new Set(plan.flatMap((p) => [p.fromUserId, p.toUserId]));

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Hero summary card */}
      <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
        <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 18 }}>
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
            Smart settlement
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontFamily: t.fDisp,
              fontWeight: '600',
              fontSize: 22,
              letterSpacing: -0.5,
              color: t.text,
              lineHeight: 28,
            }}
          >
            <Text style={{ color: t.accent }}>{plan.length}</Text> transfers settle{' '}
            <Text style={{ color: t.accent }}>{memberSet.size}</Text> people
          </Text>
          <Text style={{ marginTop: 12, fontFamily: t.fSans, fontSize: 12, color: t.textDim, lineHeight: 18 }}>
            Minimum-transfer plan. Track Limits hands you the amount and recipient — settle outside via Venmo / Cash App /
            Zelle.
          </Text>
        </View>
      </View>

      {myOutgoing.length > 0 ? (
        <SectionGroup label="You owe" tone="owe">
          {myOutgoing.map((p, i) => {
            const key = `${p.fromUserId}-${p.toUserId}-${p.amount}`;
            const sentMarked = !!marked[key];
            const busy = submitting === key;
            return (
              <TransferRow
                key={i}
                from={{ id: p.fromUserId, name: p.fromDisplayName, you: true }}
                to={{ id: p.toUserId, name: p.toDisplayName }}
                amount={p.amount}
                currency={cur}
                variant="owe"
                isLast={i === myOutgoing.length - 1}
                action={
                  sentMarked ? (
                    <Text
                      style={{
                        marginTop: 4,
                        fontFamily: t.fMono,
                        fontSize: 9,
                        fontWeight: '700',
                        color: '#FFC857',
                        letterSpacing: 1.2,
                        textTransform: 'uppercase',
                      }}
                    >
                      Awaiting · ›
                    </Text>
                  ) : (
                    <Pressable
                      disabled={busy}
                      onPress={() => onMarkSent(p)}
                      style={{
                        marginTop: 4,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 5,
                        backgroundColor: t.accent,
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      <Text
                        style={{
                          color: '#0E1116',
                          fontFamily: t.fMono,
                          fontSize: 9,
                          fontWeight: '700',
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                        }}
                      >
                        {busy ? '…' : 'Mark sent'}
                      </Text>
                    </Pressable>
                  )
                }
                fadedRow={sentMarked}
              />
            );
          })}
        </SectionGroup>
      ) : null}

      {myIncoming.length > 0 ? (
        <SectionGroup label="Owed to you" tone="owed">
          {myIncoming.map((p, i) => (
            <TransferRow
              key={i}
              from={{ id: p.fromUserId, name: p.fromDisplayName }}
              to={{ id: p.toUserId, name: p.toDisplayName, you: true }}
              amount={p.amount}
              currency={cur}
              variant="owed"
              isLast={i === myIncoming.length - 1}
              action={
                <Text
                  style={{
                    marginTop: 4,
                    fontFamily: t.fMono,
                    fontSize: 9,
                    fontWeight: '700',
                    color: t.success,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                  }}
                >
                  Incoming
                </Text>
              }
            />
          ))}
        </SectionGroup>
      ) : null}

      {between.length > 0 ? (
        <SectionGroup label="Between others" tone="neutral" sub="Who else owes whom in your league">
          {between.map((p, i) => (
            <TransferRow
              key={i}
              from={{ id: p.fromUserId, name: p.fromDisplayName }}
              to={{ id: p.toUserId, name: p.toDisplayName }}
              amount={p.amount}
              currency={cur}
              variant="between"
              isLast={i === between.length - 1}
            />
          ))}
        </SectionGroup>
      ) : null}

      {sheetTarget && league && userId ? (
        <MarkSentSheet
          visible={!!sheetTarget}
          onClose={() => setSheetTarget(null)}
          leagueId={league.id}
          fromUserId={sheetTarget.fromUserId}
          fromDisplayName={userName || 'You'}
          toUserId={sheetTarget.toUserId}
          toDisplayName={sheetTarget.toDisplayName}
          amount={sheetTarget.amount}
          onSent={onSheetSent}
        />
      ) : null}
    </ScrollView>
  );
}

function TransferRow({
  from,
  to,
  amount,
  currency,
  variant,
  action,
  isLast,
  fadedRow,
}: {
  from: { id: string; name: string; you?: boolean };
  to: { id: string; name: string; you?: boolean };
  amount: number;
  currency: string;
  variant: 'owe' | 'owed' | 'between';
  action?: React.ReactNode;
  isLast: boolean;
  fadedRow?: boolean;
}) {
  const t = useTheme();
  const borderColor = variant === 'owe' ? t.danger : variant === 'owed' ? t.success : t.lineSoft;
  return (
    <View
      style={{
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderLeftWidth: 3,
        borderLeftColor: borderColor,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: t.lineSoft,
        opacity: fadedRow ? 0.5 : 1,
      }}
    >
      <MemberAvatar member={from} size={26} />
      <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 11 }}>→</Text>
      <MemberAvatar member={to} size={26} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontFamily: t.fSans, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
          {from.name} → {to.name}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text
          style={{
            color: t.text,
            fontFamily: t.fMono,
            fontSize: 16,
            fontWeight: '700',
            letterSpacing: -0.2,
            fontVariant: ['tabular-nums'],
          }}
        >
          {currency}
          {amount.toFixed(2)}
        </Text>
        {action}
      </View>
    </View>
  );
}
