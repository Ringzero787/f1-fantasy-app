import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../src/hooks/useAuth';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { AuthShell, AuthError, GridSocialButtons } from '../../src/simple/grid/GridAuthBits';
import { isAmazonBuild } from '../../src/utils/storeDetection';
import { amazonSignIn } from '../../src/utils/amazonSignIn';
import { functions } from '../../src/config/firebase';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { colors, family, scaled, mono, title } = useSimpleTheme();
  const { signInWithGoogle, signInWithApple, signInWithAmazon, enterDemoMode, isLoading, error, clearError } = useAuth();

  // TEMP dev-only: ?demo=1 on web enters demo mode for headless UI verification
  React.useEffect(() => {
    if (__DEV__ && typeof window !== 'undefined' && window.location?.search?.includes('demo=1')) {
      enterDemoMode();
      router.replace('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleSignIn = async (idToken: string) => {
    clearError();
    try { await signInWithGoogle(idToken); router.replace('/'); } catch { /* store holds the error */ }
  };
  const handleAppleSignIn = async (identityToken: string, nonce: string) => {
    clearError();
    try { await signInWithApple(identityToken, nonce); router.replace('/'); } catch { /* store holds the error */ }
  };
  const handleAmazonSignIn = async () => {
    clearError();
    try {
      const { code, redirectUri } = await amazonSignIn();
      const signInFn = httpsCallable<{ code: string; redirectUri: string }, { customToken: string; displayName: string; email: string }>(functions, 'signInWithAmazon');
      const { customToken, displayName, email } = (await signInFn({ code, redirectUri })).data;
      await signInWithAmazon(customToken, { displayName, email });
      router.replace('/');
    } catch (err) {
      if (err instanceof Error && err.message === 'Sign in cancelled') throw err;
    }
  };

  return (
    <AuthShell onWordmarkLongPress={() => { enterDemoMode(); router.replace('/'); }}>
      <View style={{ gap: 18 }}>
        <View style={{ gap: 8 }}>
          <Text style={title}>{t('auth.signIn.title')}</Text>
          <Text style={{ fontFamily: family.ui.regular, fontSize: scaled(12), lineHeight: scaled(18), color: colors.text.muted }}>
            {t('auth.signIn.subtitle')}
          </Text>
        </View>
        <AuthError messages={error ? [error] : []} />
        <GridSocialButtons
          onGoogleSignIn={handleGoogleSignIn}
          onAppleSignIn={handleAppleSignIn}
          onAmazonSignIn={isAmazonBuild ? handleAmazonSignIn : undefined}
          disabled={isLoading}
        />
        <Text style={[mono(10, 'medium'), { color: colors.text.muted, textAlign: 'center', marginTop: 8 }]}>{t('auth.signIn.noPasswords')}</Text>
      </View>
    </AuthShell>
  );
}
