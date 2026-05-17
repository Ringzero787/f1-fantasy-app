// Create-a-league wizard — single page, themed to match the rest of the app.
// Lives in a modal route (see leagues/_layout.tsx).
//
// Sections:
//   1. Header pep talk
//   2. Name + optional description
//   3. Track real money? toggle → reveals buy-in + currency + payout template
//   4. Big Create button + footnote

import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { leagueService } from '@services/league.service';
import { dataService } from '@services/data.service';
import { PrimaryBtn } from '@components/tl';
import { useTheme } from '@/theme';
import type { LeagueLedgerConfig } from '@/types';

const TEMPLATES: { id: LeagueLedgerConfig['payoutTemplate']; label: string; sub: string }[] = [
  { id: 'per_race', label: 'Per-race winner', sub: 'Top scorer of each weekend wins the pot.' },
  { id: 'season_end', label: 'Season-end pot', sub: 'Whole pot pays out at season end.' },
  { id: 'hybrid', label: 'Per-race + season-end', sub: 'Smaller per-race + bigger end-of-year prize.' },
  { id: 'custom', label: 'Custom', sub: 'Set splits yourself when paying out.' },
];

export default function CreateLeagueScreen() {
  const t = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ledgerEnabled, setLedgerEnabled] = useState(false);
  const [buyIn, setBuyIn] = useState('20');
  const [currency, setCurrency] = useState('$');
  const [template, setTemplate] = useState<LeagueLedgerConfig['payoutTemplate']>('per_race');
  const [creating, setCreating] = useState(false);

  const canCreate = name.trim().length >= 3 && !creating;

  const onCreate = async () => {
    if (!user) return;
    if (name.trim().length < 3) {
      Alert.alert('Pick a name', 'League name must be at least 3 characters.');
      return;
    }
    setCreating(true);
    try {
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
      style={[styles.flex, { backgroundColor: t.bg }]}
    >
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 60, gap: 22 }} keyboardShouldPersistTaps="handled">
        {/* Pep talk */}
        <View>
          <Text style={{ fontFamily: t.fMono, fontSize: 11, color: t.accent, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: '700' }}>
            New league
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontFamily: t.fDisp,
              fontWeight: '700',
              fontSize: 30,
              letterSpacing: -0.9,
              lineHeight: 32,
              color: t.text,
            }}
          >
            Build a paddock.
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontFamily: t.fSans,
              fontSize: 13.5,
              color: t.textDim,
              lineHeight: 19,
            }}
          >
            Name your league, optionally track real money on the side. Invite your friends with a 6-character code after you're done.
          </Text>
        </View>

        {/* Name + description */}
        <View style={{ gap: 14 }}>
          <Field label="League name" value={name} onChangeText={setName} placeholder="Sunday Drivers" autoCapitalize="words" />
          <Field
            label="Description (optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="What's the vibe?"
            autoCapitalize="sentences"
            multiline
          />
        </View>

        {/* Ledger toggle */}
        <View
          style={{
            backgroundColor: t.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: t.line,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: t.fMono,
                fontSize: 10,
                color: t.textMute,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                fontWeight: '700',
              }}
            >
              Track real money
            </Text>
            <Text style={{ marginTop: 4, fontFamily: t.fSans, fontSize: 12.5, color: t.textDim, lineHeight: 18 }}>
              Track buy-ins and payouts as a ledger. Money settles outside the app via Venmo / Cash App / Zelle.
            </Text>
          </View>
          <Switch
            value={ledgerEnabled}
            onValueChange={setLedgerEnabled}
            trackColor={{ false: t.surface2, true: t.accentSoft }}
            thumbColor={ledgerEnabled ? t.accent : t.textDim}
          />
        </View>

        {/* Ledger details */}
        {ledgerEnabled ? (
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 70 }}>
                <Field label="Currency" value={currency} onChangeText={setCurrency} placeholder="$" maxLength={3} />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Buy-in per player"
                  value={buyIn}
                  onChangeText={setBuyIn}
                  placeholder="20"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View>
              <Text
                style={{
                  fontFamily: t.fMono,
                  fontSize: 10,
                  color: t.textMute,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  fontWeight: '700',
                  marginBottom: 8,
                }}
              >
                Payout template
              </Text>
              <View style={{ gap: 8 }}>
                {TEMPLATES.map((opt) => {
                  const active = template === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => setTemplate(opt.id)}
                      style={({ pressed }) => [
                        {
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          padding: 14,
                          borderRadius: 12,
                          borderWidth: active ? 1.5 : 1,
                          borderColor: active ? t.accent : t.line,
                          backgroundColor: active ? t.accentSoft : t.surface,
                          opacity: pressed ? 0.9 : 1,
                        },
                      ]}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          borderWidth: 2,
                          borderColor: active ? t.accent : t.line,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.accent }} /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.text, fontFamily: t.fSans, fontWeight: '600', fontSize: 14 }}>{opt.label}</Text>
                        <Text style={{ marginTop: 2, color: t.textDim, fontFamily: t.fMono, fontSize: 10, letterSpacing: 0.4 }}>
                          {opt.sub}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        ) : null}

        {/* CTA */}
        <PrimaryBtn title={creating ? 'Creating…' : 'Create league'} onPress={onCreate} disabled={!canCreate} />

        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 10,
            color: t.textMute,
            letterSpacing: 0.4,
            textAlign: 'center',
            lineHeight: 16,
          }}
        >
          You'll get a 6-character invite code to share with friends after the league is created.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize,
  multiline,
  keyboardType,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'email-address';
  maxLength?: number;
}) {
  const t = useTheme();
  return (
    <View>
      <Text
        style={{
          fontFamily: t.fMono,
          fontSize: 10,
          color: t.textMute,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          fontWeight: '700',
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textMute}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={maxLength}
        style={{
          backgroundColor: t.surface,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: t.line,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 12,
          minHeight: multiline ? 64 : 46,
          color: t.text,
          fontFamily: t.fSans,
          fontSize: 14.5,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
