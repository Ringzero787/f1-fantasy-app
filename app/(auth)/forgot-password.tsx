import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { AuthShell, AuthError, GridField } from '../../src/simple/grid/GridAuthBits';
import { MonoLabel, PillButton } from '../../src/simple/grid/GridBits';
import { isValidEmail } from '../../src/utils/validation';

export default function ForgotPasswordScreen() {
  const { colors, family, scaled, title } = useSimpleTheme();
  const { resetPassword, isLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    clearError(); setValidationError(null);
    if (!email.trim()) { setValidationError('Email is required'); return; }
    if (!isValidEmail(email)) { setValidationError('Please enter a valid email'); return; }
    try { await resetPassword(email.trim()); setSuccess(true); } catch { /* store holds the error */ }
  };

  const body = { fontFamily: family.ui.regular, fontSize: scaled(12), lineHeight: scaled(18), color: colors.text.muted };

  return (
    <AuthShell caption={success ? 'EMAIL SENT' : 'RESET PASSWORD'}>
      {success ? (
        <View style={{ gap: 14 }}>
          <Text style={title}>Check your email</Text>
          <Text style={body}>We sent a reset link to {email}. Follow it to choose a new password.</Text>
          <PillButton label="BACK TO SIGN IN" variant="inverse" onPress={() => router.back()} style={{ marginTop: 6 }} />
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <Text style={title}>Reset password</Text>
          <Text style={body}>Enter the email on your account and we'll send a reset link.</Text>
          <AuthError messages={[...(validationError ? [validationError] : []), ...(error ? [error] : [])]} />
          <GridField label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} mono />
          <PillButton label={isLoading ? 'SENDING…' : 'SEND RESET LINK'} variant="primary" disabled={isLoading} onPress={handleReset} style={{ marginTop: 6 }} />
          <Pressable onPress={() => router.back()} style={{ alignItems: 'center', paddingVertical: 12 }} accessibilityRole="button" accessibilityLabel="Back">
            <MonoLabel color={colors.text.muted}>BACK</MonoLabel>
          </Pressable>
        </View>
      )}
    </AuthShell>
  );
}
