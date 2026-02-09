import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { useAuthStore } from '../../src/store/auth.store';
import { SocialAuthButtons } from '../../src/components';
import { COLORS, SPACING, FONTS } from '../../src/config/constants';

export default function LoginScreen() {
  const { signInWithGoogle, signInWithApple, isLoading, error, clearError } = useAuth();

  const handleGoogleSignIn = async (idToken: string) => {
    clearError();
    try {
      await signInWithGoogle(idToken);
      router.replace('/(tabs)');
    } catch (err) {
      // Error is handled by the store
    }
  };

  const handleAppleSignIn = async (identityToken: string, nonce: string) => {
    clearError();
    try {
      await signInWithApple(identityToken, nonce);
      router.replace('/(tabs)');
    } catch (err) {
      // Error is handled by the store
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.tagline}>Leave it to Me</Text>
          <Text style={styles.logo}>F1</Text>
          <Text style={styles.subtitle}>Fantasy</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Welcome</Text>
          <Text style={styles.description}>
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
            disabled={isLoading}
          />

          {/* Demo Mode */}
          <TouchableOpacity
            style={styles.demoButton}
            onPress={() => {
              useAuthStore.getState().enterDemoMode();
              router.replace('/(tabs)');
            }}
          >
            <Text style={styles.demoButtonText}>Continue as Guest</Text>
          </TouchableOpacity>
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
    fontSize: FONTS.sizes.xs,
    fontWeight: '400',
    color: '#6B7280',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },

  logo: {
    fontSize: 72,
    fontWeight: 'bold',
    color: COLORS.primary,
  },

  subtitle: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: '300',
    color: '#374151',
    marginTop: -SPACING.sm,
  },

  form: {
    width: '100%',
  },

  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: SPACING.xs,
  },

  description: {
    fontSize: FONTS.sizes.md,
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
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },

  demoButtonText: {
    fontSize: FONTS.sizes.md,
    color: '#6B7280',
    fontWeight: '500',
  },
});
