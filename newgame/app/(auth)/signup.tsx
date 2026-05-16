import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '@store/auth.store';
import { AuthInput } from '@components/auth/AuthInput';
import { PrimaryButton } from '@components/auth/PrimaryButton';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const signUp = useAuthStore((s) => s.signUp);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const onSubmit = async () => {
    clearError();
    try {
      await signUp(email.trim(), password, displayName.trim());
    } catch {
      // store captured
    }
  };

  const canSubmit =
    email.length > 3 &&
    password.length >= 6 &&
    displayName.length >= 2 &&
    !isLoading;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.headline}>Build your garage</Text>
          <Text style={styles.subtitle}>
            Roll for four drivers, start two each weekend, and out-strategize your friends.
          </Text>
        </View>

        <View style={styles.form}>
          <AuthInput
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="What should we call you?"
            autoCapitalize="words"
          />
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
            placeholder="At least 6 characters"
            secureTextEntry
            textContentType="newPassword"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <PrimaryButton title="Create account" onPress={onSubmit} loading={isLoading} disabled={!canSubmit} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: spacing.xl, gap: spacing.xxl },
  header: { gap: spacing.sm },
  headline: { color: colors.text, fontSize: fontSize.heading, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: fontSize.body, lineHeight: 20 },
  form: { gap: spacing.lg },
  errorText: { color: colors.danger, textAlign: 'center', fontSize: fontSize.body },
});
