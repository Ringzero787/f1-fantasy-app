// Call-sign prompt — shown once after sign-in when the account's display name
// is a signup-era placeholder ("Player", "Track Limits Player", "Demo XXXX")
// rather than something the player chose. Routed from AuthGate in _layout.
//
// Skip uses the first 6 characters of the email — per product decision
// 2026-07-22 — and counts as choosing (won't re-prompt: the saved name is no
// longer a placeholder... unless their email starts with "player", which we
// accept as fate).

import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { authService } from '@services/auth.service';
import { useTheme } from '@/theme';

export default function CallSignScreen() {
  const t = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const emailFallback = (user?.email ?? '').split('@')[0].slice(0, 6) || 'Player';
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const commit = async (chosen: string) => {
    if (!user || saving) return;
    const finalName = chosen.trim();
    if (finalName.length < 2 || finalName.length > 24) {
      Alert.alert('Pick a call sign', 'Between 2 and 24 characters.');
      return;
    }
    setSaving(true);
    try {
      await authService.updateDisplayNameEverywhere(user.id, finalName);
      setUser({ ...user, displayName: finalName });
      router.back();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Unknown error');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.body}>
          <Text style={{ fontFamily: t.fMono, fontSize: 11, color: t.accent, letterSpacing: 1.4, textTransform: 'uppercase' }}>
            One more thing
          </Text>
          <Text style={{ fontFamily: t.fDisp, fontSize: 30, fontWeight: '700', color: t.text, letterSpacing: -0.6, marginTop: 8 }}>
            Pick your call sign.
          </Text>
          <Text style={{ fontFamily: t.fSans, fontSize: 15, color: t.textDim, marginTop: 10, lineHeight: 21 }}>
            This is the name your leagues see on every leaderboard. You can change it later from your profile.
          </Text>

          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={24}
            placeholder={emailFallback}
            placeholderTextColor={t.textMute}
            style={{
              marginTop: 28,
              borderWidth: 1,
              borderColor: t.line,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontFamily: t.fDisp,
              fontSize: 18,
              fontWeight: '600',
              color: t.text,
              backgroundColor: t.surface,
            }}
            onSubmitEditing={() => commit(name || emailFallback)}
            returnKeyType="done"
          />

          <Pressable
            onPress={() => commit(name || emailFallback)}
            disabled={saving}
            style={({ pressed }) => [
              {
                marginTop: 16,
                height: 52,
                borderRadius: 12,
                backgroundColor: t.accent,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: saving ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ fontFamily: t.fSans, fontSize: 16, fontWeight: '700', color: '#0E1116' }}>
              {saving ? 'Saving…' : name.trim() ? 'Lock it in' : `Use "${emailFallback}"`}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 48 },
});
