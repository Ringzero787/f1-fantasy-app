import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { GridField, AuthError } from './GridAuthBits';
import { MonoLabel, PillButton } from './GridBits';

interface Props {
  onCreate: (name: string, joinCode?: string) => Promise<void>;
  isSecondTeam?: boolean;
  onCancel?: () => void;
}

// First run: one-field "Name your team" in the League Manager form style,
// with the optional league code kept. Lands on the Team grid with 6 open slots.
export const GridCreateTeam = React.memo(function GridCreateTeam({ onCreate, isSecondTeam, onCancel }: Props) {
  const { colors, family, spacing, scaled, title } = useSimpleTheme();
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length >= 2;

  const create = async () => {
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try { await onCreate(name.trim(), joinCode.trim() || undefined); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create the team.'); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: 24, gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <MonoLabel>{isSecondTeam ? 'SECOND TEAM' : 'FIRST RUN'}</MonoLabel>
        <MonoLabel>{`SEASON ${new Date().getFullYear()}`}</MonoLabel>
      </View>
      <Text style={title}>Name your team</Text>
      <Text style={{ fontFamily: family.ui.regular, fontSize: scaled(12), lineHeight: scaled(18), color: colors.text.muted, marginBottom: 8 }}>
        Five drivers, one constructor, a $1,000 budget. You can rename it any time from your profile.
      </Text>
      <GridField label="TEAM NAME" value={name} onChangeText={(t) => { setName(t); setError(null); }} placeholder="Apex Predators" maxLength={30} autoCapitalize="words" returnKeyType="done" onSubmitEditing={create} />
      <GridField label="LEAGUE CODE · OPTIONAL" value={joinCode} onChangeText={(t) => setJoinCode(t.toUpperCase())} placeholder="XXX-0000" autoCapitalize="characters" autoCorrect={false} maxLength={12} mono />
      <AuthError messages={error ? [error] : []} />
      <PillButton label={busy ? 'CREATING…' : 'CREATE TEAM'} variant={valid ? 'primary' : 'muted'} disabled={!valid || busy} onPress={create} style={{ marginTop: 8 }} />
      {onCancel ? (
        <Pressable onPress={onCancel} style={{ alignItems: 'center', paddingVertical: 12 }} accessibilityRole="button" accessibilityLabel="Cancel">
          <MonoLabel color={colors.text.muted}>CANCEL</MonoLabel>
        </Pressable>
      ) : null}
    </View>
  );
});
