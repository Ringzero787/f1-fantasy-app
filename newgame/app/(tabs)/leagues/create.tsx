import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { leagueService } from '@services/league.service';
import { dataService } from '@services/data.service';
import { AuthInput } from '@components/auth/AuthInput';
import { PrimaryButton } from '@components/auth/PrimaryButton';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import type { LeagueLedgerConfig } from '@/types';

const TEMPLATES: { id: LeagueLedgerConfig['payoutTemplate']; label: string; sub: string }[] = [
  { id: 'per_race', label: 'Per-race winner', sub: 'Top scorer of each weekend wins the pot.' },
  { id: 'season_end', label: 'Season-end pot', sub: 'Whole pot pays out at season end.' },
  { id: 'hybrid', label: 'Per-race + season-end', sub: 'Smaller per-race + bigger end-of-year prize.' },
  { id: 'custom', label: 'Custom', sub: 'Set splits yourself when paying out.' },
];

export default function CreateLeagueScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ledgerEnabled, setLedgerEnabled] = useState(false);
  const [buyIn, setBuyIn] = useState('20');
  const [currency, setCurrency] = useState('$');
  const [template, setTemplate] = useState<LeagueLedgerConfig['payoutTemplate']>('per_race');
  const [creating, setCreating] = useState(false);

  const onCreate = async () => {
    if (!user) return;
    if (name.trim().length < 3) {
      Alert.alert('Pick a name', 'League name must be at least 3 characters.');
      return;
    }
    setCreating(true);
    try {
      // Use the active season (latest) so leaderboards anchor against it.
      const upcoming = await dataService.getUpcomingRace();
      const seasonId = upcoming?.seasonId ?? '2026';

      const league = await leagueService.createLeague({
        name: name.trim(),
        description: description.trim() || undefined,
        ownerId: user.id,
        ownerName: user.displayName,
        seasonId,
        ledger: {
          enabled: ledgerEnabled,
          buyInAmount: ledgerEnabled ? Math.max(parseInt(buyIn || '0', 10), 0) : 0,
          currencyLabel: currency || '$',
          payoutTemplate: template,
        },
      });
      router.replace(`/(tabs)/leagues/${league.id}`);
    } catch (err) {
      Alert.alert('Could not create league', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AuthInput label="League name" value={name} onChangeText={setName} placeholder="Sunday Drivers" autoCapitalize="words" />
        <AuthInput
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="What's the vibe?"
          autoCapitalize="sentences"
          multiline
        />

        <View style={styles.ledgerToggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Track real money</Text>
            <Text style={styles.helper}>
              Track buy-ins and payouts as a ledger. Money settles outside the app via Venmo / Cash App / Zelle.
            </Text>
          </View>
          <Switch
            value={ledgerEnabled}
            onValueChange={setLedgerEnabled}
            trackColor={{ false: colors.bgInput, true: colors.accentMuted }}
            thumbColor={ledgerEnabled ? colors.accent : colors.textDim}
          />
        </View>

        {ledgerEnabled && (
          <View style={styles.ledgerBlock}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ width: 64 }}>
                <AuthInput label="Currency" value={currency} onChangeText={setCurrency} placeholder="$" maxLength={3} />
              </View>
              <View style={{ flex: 1 }}>
                <AuthInput label="Buy-in per player" value={buyIn} onChangeText={setBuyIn} placeholder="20" keyboardType="number-pad" />
              </View>
            </View>

            <Text style={styles.label}>Payout template</Text>
            <View style={{ gap: spacing.sm }}>
              {TEMPLATES.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setTemplate(t.id)}
                  style={({ pressed }) => [
                    styles.templateRow,
                    template === t.id && styles.templateRowActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.radioOuter, template === t.id && styles.radioOuterActive]}>
                    {template === t.id && <View style={styles.radioInner} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateLabel}>{t.label}</Text>
                    <Text style={styles.templateSub}>{t.sub}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <PrimaryButton title="Create league" onPress={onCreate} loading={creating} disabled={creating} />

        <Text style={styles.footnote}>
          You'll get a 6-character invite code to share with friends after the league is created.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  helper: { color: colors.textDim, fontSize: fontSize.caption, marginTop: 4 },
  ledgerToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  ledgerBlock: { gap: spacing.md },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  templateRowActive: { borderColor: colors.accent },
  pressed: { opacity: 0.85 },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: { borderColor: colors.accent },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  templateLabel: { color: colors.text, fontSize: fontSize.body, fontWeight: '700' },
  templateSub: { color: colors.textMuted, fontSize: fontSize.caption, marginTop: 2 },
  footnote: { color: colors.textDim, fontSize: fontSize.caption, textAlign: 'center' },
});
