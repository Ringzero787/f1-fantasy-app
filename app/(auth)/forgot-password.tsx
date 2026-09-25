import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { AuthShell, AuthError, GridField } from '../../src/simple/grid/GridAuthBits';
import { MonoLabel, PillButton } from '../../src/simple/grid/GridBits';
import { isValidEmail } from '../../src/utils/validation';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const { colors, family, scaled, title } = useSimpleTheme();
  const { resetPassword, isLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    clearError(); setValidationError(null);
    if (!email.trim()) { setValidationError(t('auth.errors.emailRequired')); return; }
    if (!isValidEmail(email)) { setValidationError(t('auth.errors.emailInvalid')); return; }
    try { await resetPassword(email.trim()); setSuccess(true); } catch { /* store holds the error */ }
  };

  const body = { fontFamily: family.ui.regular, fontSize: scaled(12), lineHeight: scaled(18), color: colors.text.muted };

  return (
    <AuthShell caption={success ? t('auth.forgot.captionSent') : t('auth.forgot.caption')}>
      {success ? (
        <View style={{ gap: 14 }}>
          <Text style={title}>{t('auth.forgot.sentTitle')}</Text>
          <Text style={body}>{t('auth.forgot.sentBody', { email })}</Text>
          <PillButton label={t('auth.forgot.backToSignIn')} variant="inverse" onPress={() => router.back()} style={{ marginTop: 6 }} />
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <Text style={title}>{t('auth.forgot.title')}</Text>
          <Text style={body}>{t('auth.forgot.subtitle')}</Text>
          <AuthError messages={[...(validationError ? [validationError] : []), ...(error ? [error] : [])]} />
          <GridField label={t('auth.forgot.emailLabel')} value={email} onChangeText={setEmail} placeholder={t('auth.forgot.emailPlaceholder')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} mono />
          <PillButton label={isLoading ? t('auth.forgot.submitting') : t('auth.forgot.submit')} variant="primary" disabled={isLoading} onPress={handleReset} style={{ marginTop: 6 }} />
          <Pressable onPress={() => router.back()} style={{ alignItems: 'center', paddingVertical: 12 }} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <MonoLabel color={colors.text.muted}>{t('common.back')}</MonoLabel>
          </Pressable>
        </View>
      )}
    </AuthShell>
  );
}
