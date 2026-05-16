import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { leagueService } from '@services/league.service';
import { ledgerService } from '@services/ledger.service';
import { FieldLabel, MemberAvatar } from '@components/tl';
import { useTheme } from '@/theme';
import type { League, LeagueMember } from '@/types';

export default function CreatePayoutScreen() {
  const t = useTheme();
  const { id: leagueId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'season_payout' | 'manual_adjust'>('season_payout');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ recipient: string; amount: number; currency: string } | null>(null);

  const reload = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    try {
      const [l, ms] = await Promise.all([leagueService.getLeague(leagueId), leagueService.getMembers(leagueId)]);
      setLeague(l);
      setMembers(ms);
      if (!recipientId && ms.length > 0) setRecipientId(ms[0].userId);
    } finally {
      setLoading(false);
    }
  }, [leagueId, recipientId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const onSubmit = async () => {
    if (!league || !recipientId) return;
    const member = members.find((m) => m.userId === recipientId);
    if (!member) return;
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert('Bad amount', 'Enter a positive number.');
      return;
    }
    setSubmitting(true);
    try {
      await ledgerService.recordPayout({
        leagueId: league.id,
        userId: member.userId,
        amount: amt,
        type: 'season_payout',
        description: description.trim() || `${type === 'season_payout' ? 'Season payout' : 'Adjustment'} for ${member.displayName}`,
      });
      setDone({ recipient: member.displayName, amount: amt, currency: league.ledger.currencyLabel });
      setTimeout(() => router.back(), 1200);
    } catch (err) {
      Alert.alert('Failed', err instanceof Error ? err.message : 'Unknown');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !league) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  if (league.ownerId !== userId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, padding: 24 }}>
        <Text style={{ color: t.textMute, fontFamily: t.fSans, fontSize: 14, textAlign: 'center' }}>
          Only the commissioner can create payouts.
        </Text>
      </View>
    );
  }

  if (!league.ledger.enabled) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, padding: 24 }}>
        <Text style={{ color: t.textMute, fontFamily: t.fSans, fontSize: 14, textAlign: 'center' }}>
          This league doesn't track money.
        </Text>
      </View>
    );
  }

  if (done) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, padding: 60 }}>
        <Text style={{ color: t.success, fontFamily: t.fDisp, fontSize: 22, fontWeight: '600', letterSpacing: -0.4 }}>
          Entry recorded
        </Text>
        <Text style={{ color: t.textDim, fontFamily: t.fSans, fontSize: 13, marginTop: 8, lineHeight: 20, textAlign: 'center' }}>
          {done.recipient}'s bag credited {done.currency}
          {done.amount.toFixed(2)}.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: t.textDim, fontFamily: t.fSans, fontSize: 12, lineHeight: 18, marginBottom: 18 }}>
          Commissioner action. Credits a member's bag with a season payout or a manual adjustment.
        </Text>

        <FieldLabel>Recipient</FieldLabel>
        <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          {members.map((m, i) => {
            const active = recipientId === m.userId;
            return (
              <Pressable
                key={m.userId}
                onPress={() => setRecipientId(m.userId)}
                style={{
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: active ? t.accentSoft : 'transparent',
                  borderBottomWidth: i === members.length - 1 ? 0 : 1,
                  borderBottomColor: t.lineSoft,
                }}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    borderWidth: 2,
                    borderColor: active ? t.accent : t.line,
                    backgroundColor: active ? t.accent : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {active ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#0E1116' }} /> : null}
                </View>
                <MemberAvatar member={{ id: m.userId, name: m.displayName }} size={28} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontFamily: t.fSans, fontSize: 13, fontWeight: '500' }}>{m.displayName}</Text>
                  <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 10, letterSpacing: 0.4, marginTop: 2 }}>
                    {m.totalPoints} pts · {m.raceWins} {m.raceWins === 1 ? 'win' : 'wins'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <FieldLabel>Entry type</FieldLabel>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
          {(['season_payout', 'manual_adjust'] as const).map((opt) => {
            const active = type === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => setType(opt)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: active ? t.accent : t.surface,
                  borderWidth: 1,
                  borderColor: active ? t.accent : t.line,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: active ? '#0E1116' : t.text, fontFamily: t.fSans, fontSize: 13, fontWeight: '600' }}>
                  {opt === 'season_payout' ? 'Season payout' : 'Manual adjust'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <FieldLabel>Amount</FieldLabel>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 10,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.line,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: t.textDim, fontFamily: t.fMono, fontSize: 18 }}>{league.ledger.currencyLabel}</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={t.textMute}
            keyboardType="decimal-pad"
            style={{
              flex: 1,
              fontFamily: t.fMono,
              fontSize: 18,
              fontWeight: '600',
              color: t.text,
            }}
          />
        </View>

        <FieldLabel>Description</FieldLabel>
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 10,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.line,
            marginBottom: 24,
          }}
        >
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Mid-season pot · Marco took P1"
            placeholderTextColor={t.textMute}
            style={{ fontFamily: t.fSans, fontSize: 13, color: t.text }}
          />
        </View>

        <Pressable
          onPress={onSubmit}
          disabled={!amount || !recipientId || submitting}
          style={({ pressed }) => [
            {
              padding: 15,
              borderRadius: 10,
              backgroundColor: amount && recipientId ? t.accent : t.surface2,
              alignItems: 'center',
              opacity: !amount || !recipientId ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={{
              color: amount && recipientId ? '#0E1116' : t.textMute,
              fontFamily: t.fSans,
              fontSize: 14,
              fontWeight: '700',
            }}
          >
            {submitting ? 'Recording...' : 'Record entry'}
          </Text>
        </Pressable>

        <Text
          style={{
            marginTop: 12,
            color: t.textMute,
            fontFamily: t.fMono,
            fontSize: 10,
            letterSpacing: 0.4,
            textAlign: 'center',
            lineHeight: 16,
          }}
        >
          Entries are immutable. Members can see all entries on the ledger.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
