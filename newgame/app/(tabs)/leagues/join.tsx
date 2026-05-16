import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { leagueService } from '@services/league.service';
import { AuthInput } from '@components/auth/AuthInput';
import { PrimaryButton } from '@components/auth/PrimaryButton';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function JoinLeagueScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const onJoin = async () => {
    if (!user) return;
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      Alert.alert('Bad code', 'Invite codes are 6 characters.');
      return;
    }
    setJoining(true);
    try {
      const league = await leagueService.joinByInviteCode({
        inviteCode: trimmed,
        userId: user.id,
        displayName: user.displayName,
      });
      router.replace(`/(tabs)/leagues/${league.id}`);
    } catch (err) {
      Alert.alert('Could not join', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setJoining(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Join a league</Text>
        <Text style={styles.body}>Ask the league owner for the 6-character invite code.</Text>
        <View style={{ height: spacing.md }} />
        <AuthInput
          label="Invite code"
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          placeholder="ABC123"
          autoCapitalize="characters"
          maxLength={6}
        />
        <PrimaryButton title="Join league" onPress={onJoin} loading={joining} disabled={code.length !== 6 || joining} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  title: { color: colors.text, fontSize: fontSize.heading, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: fontSize.body, lineHeight: 20 },
});
