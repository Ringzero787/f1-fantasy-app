import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { AuthInput } from '@components/auth/AuthInput';
import { PrimaryButton } from '@components/auth/PrimaryButton';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function ForgotScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);

  const onSubmit = async () => {
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch {
      // store captured
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.body}>
          Enter the email associated with your account and we'll send you a reset link.
        </Text>

        {sent ? (
          <View style={styles.sentBox}>
            <Text style={styles.sentText}>
              Email sent. Check your inbox (and spam folder) for the reset link.
            </Text>
            <PrimaryButton title="Back to sign in" onPress={() => router.back()} />
          </View>
        ) : (
          <View style={styles.form}>
            <AuthInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <PrimaryButton
              title="Send reset email"
              onPress={onSubmit}
              loading={isLoading}
              disabled={email.length < 4 || isLoading}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: spacing.xl, gap: spacing.lg },
  title: { color: colors.text, fontSize: fontSize.heading, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: fontSize.body, lineHeight: 20 },
  form: { gap: spacing.lg, marginTop: spacing.lg },
  sentBox: { gap: spacing.lg, marginTop: spacing.lg },
  sentText: { color: colors.success, fontSize: fontSize.body, lineHeight: 20 },
  errorText: { color: colors.danger, textAlign: 'center', fontSize: fontSize.body },
});
