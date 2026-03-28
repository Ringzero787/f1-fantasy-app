import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { SocialAuthButtons } from '../../src/components';
import { COLORS, SPACING, FONTS } from '../../src/config/constants';
import { useTheme } from '../../src/hooks/useTheme';
import { isAmazonBuild } from '../../src/utils/storeDetection';
import { amazonSignIn } from '../../src/utils/amazonSignIn';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../src/config/firebase';

export default function LoginScreen() {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { signInWithGoogle, signInWithApple, signInWithAmazon, enterDemoMode, isLoading, error, clearError } = useAuth();

  const handleGoogleSignIn = async (idToken: string) => {
    clearError();
    try {
      await signInWithGoogle(idToken);
      router.replace('/');
    } catch (err) {
      // Error is handled by the store
    }
  };

  const handleAppleSignIn = async (identityToken: string, nonce: string) => {
    clearError();
    try {
      await signInWithApple(identityToken, nonce);
      router.replace('/');
    } catch (err) {
      // Error is handled by the store
    }
  };

  const handleAmazonSignIn = async () => {
    clearError();
    try {
      const { code, redirectUri } = await amazonSignIn();
      const signInFn = httpsCallable<
        { code: string; redirectUri: string },
        { customToken: string; displayName: string; email: string }
      >(functions, 'signInWithAmazon');
      const result = await signInFn({ code, redirectUri });
      const { customToken, displayName, email } = result.data;
      await signInWithAmazon(customToken, { displayName, email });
      router.replace('/');
    } catch (err) {
      // Error is handled by the store (or re-thrown for cancel)
      if (err instanceof Error && err.message === 'Sign in cancelled') throw err;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#0F1A1C' : '#FFFFFF' }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.tagline, isDark && { color: '#6B8085' }]}>Leave it to me.</Text>
          <Text
            style={[styles.logo, { color: '#14B8A6' }]}
            onLongPress={() => { enterDemoMode(); router.replace('/'); }}
          >Undercut</Text>
        </View>

        <View style={styles.form}>
          <Text style={[styles.title, isDark && { color: '#E8F0F0' }]}>Welcome</Text>
          <Text style={[styles.description, isDark && { color: '#6B8085' }]}>
            Sign in to manage your fantasy team
          </Text>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Social Auth Buttons */}
          <SocialAuthButtons
            onGoogleSignIn={handleGoogleSignIn}
            onAppleSignIn={handleAppleSignIn}
            onAmazonSignIn={isAmazonBuild ? handleAmazonSignIn : undefined}
            disabled={isLoading}
          />

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },

  header: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },

  tagline: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '400',
    color: '#6B7280',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },

  logo: {
    fontSize: 56,
    fontWeight: 'bold',
    color: COLORS.primary,
  },

  form: {
    width: '100%',
  },

  title: {
    fontSize: FONTS.sizes.xxxl,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: SPACING.xs,
  },

  description: {
    fontSize: FONTS.sizes.xl,
    color: '#6B7280',
    marginBottom: SPACING.xl,
  },

  errorContainer: {
    backgroundColor: COLORS.error + '15',
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.md,
  },

  errorText: {
    color: COLORS.error,
    fontSize: FONTS.sizes.sm,
  },

  demoButton: {
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#9CA3AF',
    borderRadius: 8,
  },

  demoButtonText: {
    fontSize: FONTS.sizes.md,
    color: '#6B7280',
    fontWeight: '500',
  },

});
