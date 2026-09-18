import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { AuthShell, AuthError, GridField, GridSocialButtons } from '../../src/simple/grid/GridAuthBits';
import { MonoLabel, PillButton } from '../../src/simple/grid/GridBits';
import { validateDisplayName, validatePassword, isValidEmail } from '../../src/utils/validation';

export default function RegisterScreen() {
  const { colors, family, scaled, title } = useSimpleTheme();
  const { signUp, signInWithGoogle, signInWithApple, isLoading, error, clearError } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const handleRegister = async () => {
    clearError();
    const errors: string[] = [];
    const nameValidation = validateDisplayName(displayName);
    if (!nameValidation.isValid) errors.push(nameValidation.error!);
    if (!email.trim()) errors.push('Email is required');
    else if (!isValidEmail(email)) errors.push('Please enter a valid email');
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) errors.push(...passwordValidation.errors);
    if (password !== confirmPassword) errors.push('Passwords do not match');
    if (errors.length) { setValidationErrors(errors); return; }
    setValidationErrors([]);
    try { await signUp(email.trim(), password, displayName.trim()); router.replace('/'); } catch { /* store holds the error */ }
  };
  const social = (fn: () => Promise<void>) => async () => {
    clearError(); setValidationErrors([]);
    try { await fn(); router.replace('/'); } catch { /* store holds the error */ }
  };

  return (
    <AuthShell caption="CREATE ACCOUNT">
      <View style={{ gap: 14 }}>
        <Text style={title}>New here</Text>
        <AuthError messages={[...validationErrors, ...(error ? [error] : [])]} />
        <GridSocialButtons
          onGoogleSignIn={(t) => social(() => signInWithGoogle(t))()}
          onAppleSignIn={(t, n) => social(() => signInWithApple(t, n))()}
          disabled={isLoading}
        />
        <MonoLabel style={{ textAlign: 'center', marginVertical: 4 }}>OR WITH EMAIL</MonoLabel>
        <GridField label="DISPLAY NAME" value={displayName} onChangeText={setDisplayName} placeholder="Your name" autoCapitalize="words" />
        <GridField label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} mono />
        <GridField label="PASSWORD" value={password} onChangeText={setPassword} placeholder="Create a password" secureTextEntry mono />
        <GridField label="CONFIRM PASSWORD" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat it" secureTextEntry mono />
        <PillButton label={isLoading ? 'CREATING…' : 'CREATE ACCOUNT'} variant="primary" disabled={isLoading} onPress={handleRegister} style={{ marginTop: 6 }} />
        <Pressable onPress={() => router.back()} style={{ alignItems: 'center', paddingVertical: 12 }} accessibilityRole="button" accessibilityLabel="Back to sign in">
          <MonoLabel color={colors.text.muted}>ALREADY HAVE AN ACCOUNT? SIGN IN</MonoLabel>
        </Pressable>
      </View>
    </AuthShell>
  );
}
