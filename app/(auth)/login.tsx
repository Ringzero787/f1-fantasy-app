import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { AuthShell, AuthError, GridSocialButtons } from '../../src/simple/grid/GridAuthBits';
import { amazonWebSignIn } from '../../src/utils/amazonSignIn';

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
  const handleAppleSignIn = async (identityToken: string, nonce: string, displayName?: string | null) => {
    clearError();
    try { await signInWithApple(identityToken, nonce, displayName ?? undefined); router.replace('/'); } catch { /* store holds the error */ }
  };
  const handleAmazonSignIn = async () => {
    clearError();
    try {
      // One flow: the code stays on the server (F-091), and the pill is hidden on a build that
      // cannot run it rather than falling back to the original exchange, which handed the code to
      // whatever app claimed the scheme (F-094).
      const { customToken, displayName, email } = await amazonWebSignIn();
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
          /* Login with Amazon is a browser flow, so every build can offer it — which is how an
             account created on a Fire tablet opens on a phone (F-091). */
          onAmazonSignIn={handleAmazonSignIn}
          disabled={isLoading}
        />
        <Text style={[mono(10, 'medium'), { color: colors.text.muted, textAlign: 'center', marginTop: 8 }]}>{t('auth.signIn.noPasswords')}</Text>
      </View>
    </AuthShell>
  );
}
