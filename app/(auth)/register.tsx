import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { AuthShell, AuthError, GridField, GridSocialButtons } from '../../src/simple/grid/GridAuthBits';
import { MonoLabel, PillButton } from '../../src/simple/grid/GridBits';
import { validateDisplayName, validatePassword, isValidEmail } from '../../src/utils/validation';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { colors, title } = useSimpleTheme();
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
    if (!email.trim()) errors.push(t('auth.errors.emailRequired'));
    else if (!isValidEmail(email)) errors.push(t('auth.errors.emailInvalid'));
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) errors.push(...passwordValidation.errors);
    if (password !== confirmPassword) errors.push(t('auth.errors.passwordsMismatch'));
    if (errors.length) { setValidationErrors(errors); return; }
    setValidationErrors([]);
    try { await signUp(email.trim(), password, displayName.trim()); router.replace('/'); } catch { /* store holds the error */ }
  };
  const social = (fn: () => Promise<void>) => async () => {
    clearError(); setValidationErrors([]);
    try { await fn(); router.replace('/'); } catch { /* store holds the error */ }
  };

  return (
    <AuthShell caption={t('auth.register.caption')}>
      <View style={{ gap: 14 }}>
        <Text style={title}>{t('auth.register.title')}</Text>
        <AuthError messages={[...validationErrors, ...(error ? [error] : [])]} />
        <GridSocialButtons
          onGoogleSignIn={(t) => social(() => signInWithGoogle(t))()}
          onAppleSignIn={(t, n) => social(() => signInWithApple(t, n))()}
          disabled={isLoading}
        />
        <MonoLabel style={{ textAlign: 'center', marginVertical: 4 }}>{t('auth.register.orWithEmail')}</MonoLabel>
        <GridField label={t('auth.register.displayNameLabel')} value={displayName} onChangeText={setDisplayName} placeholder={t('auth.register.displayNamePlaceholder')} autoCapitalize="words" />
        <GridField label={t('auth.register.emailLabel')} value={email} onChangeText={setEmail} placeholder={t('auth.register.emailPlaceholder')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} mono />
        <GridField label={t('auth.register.passwordLabel')} value={password} onChangeText={setPassword} placeholder={t('auth.register.passwordPlaceholder')} secureTextEntry mono />
        <GridField label={t('auth.register.confirmPasswordLabel')} value={confirmPassword} onChangeText={setConfirmPassword} placeholder={t('auth.register.confirmPasswordPlaceholder')} secureTextEntry mono />
        <PillButton label={isLoading ? t('auth.register.submitting') : t('auth.register.submit')} variant="primary" disabled={isLoading} onPress={handleRegister} style={{ marginTop: 6 }} />
        <Pressable onPress={() => router.back()} style={{ alignItems: 'center', paddingVertical: 12 }} accessibilityRole="button" accessibilityLabel={t('auth.register.backToSignInLabel')}>
          <MonoLabel color={colors.text.muted}>{t('auth.register.haveAccount')}</MonoLabel>
        </Pressable>
      </View>
    </AuthShell>
  );
}
