import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { AuthInput } from '@components/auth/AuthInput';
import { PrimaryButton } from '@components/auth/PrimaryButton';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signIn = useAuthStore((s) => s.signIn);
  const signInAsGuest = useAuthStore((s) => s.signInAsGuest);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const onSubmit = async () => {
    clearError();
    try {
      await signIn(email.trim(), password);
    } catch {
      // store already captured the error
    }
  };

  const onDemo = async () => {
    clearError();
    try {
      await signInAsGuest();
    } catch {
      // store already captured the error
    }
  };

  const canSubmit = email.length > 3 && password.length >= 6 && !isLoading;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Track Limits</Text>
          <Text style={styles.tagline}>Leave it to me.</Text>
        </View>

        <View style={styles.form}>
          <AuthInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <AuthInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            textContentType="password"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <PrimaryButton title="Sign in" onPress={onSubmit} loading={isLoading} disabled={!canSubmit} />

          <View style={styles.demoSeparator}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          <Pressable
            onPress={onDemo}
            disabled={isLoading}
            style={({ pressed }) => [styles.demoBtn, { opacity: pressed ? 0.7 : isLoading ? 0.4 : 1 }]}
          >
            <Text style={styles.demoBtnText}>Skip sign-up · try demo mode</Text>
            <Text style={styles.demoBtnSub}>No password. Anonymous account, full app access.</Text>
          </Pressable>

          <Link href="/(auth)/forgot" style={styles.linkSubtle}>
            <Text style={styles.linkSubtleText}>Forgot password?</Text>
          </Link>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>New here? </Text>
          <Link href="/(auth)/signup">
            <Text style={styles.linkText}>Create an account</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.xxl },
  header: { alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontSize: fontSize.display, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { color: colors.accent, fontSize: fontSize.bodyLarge, fontWeight: '600', letterSpacing: 0.5 },
  form: { gap: spacing.lg },
  errorText: { color: colors.danger, textAlign: 'center', fontSize: fontSize.body },
  linkSubtle: { alignSelf: 'center' },
  linkSubtleText: { color: colors.textMuted, fontSize: fontSize.body },
  demoSeparator: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  demoBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'transparent',
    alignItems: 'center',
    gap: 4,
  },
  demoBtnText: { color: colors.accent, fontSize: fontSize.body, fontWeight: '700', letterSpacing: 0.3 },
  demoBtnSub: { color: colors.textMuted, fontSize: 11, letterSpacing: 0.2 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: colors.textMuted, fontSize: fontSize.body },
  linkText: { color: colors.accent, fontWeight: '600', fontSize: fontSize.body },
});
