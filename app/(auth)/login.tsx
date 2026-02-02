import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { Input, Button, SocialAuthButtons } from '../../src/components';
import { COLORS, SPACING, FONTS } from '../../src/config/constants';
import { isValidEmail } from '../../src/utils/validation';

export default function LoginScreen() {
  const { signIn, signInWithGoogle, signInWithApple, enterDemoMode, isLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleLogin = async () => {
    clearError();
    setValidationError(null);

    if (!email.trim()) {
      setValidationError('Email is required');
      return;
    }

    if (!isValidEmail(email)) {
      setValidationError('Please enter a valid email');
      return;
    }

    if (!password) {
      setValidationError('Password is required');
      return;
    }

    try {
      await signIn(email.trim(), password);
      router.replace('/(tabs)');
    } catch (err) {
      // Error is handled by the store
    }
  };

  const handleGoogleSignIn = async (idToken: string) => {
    clearError();
    setValidationError(null);
    try {
      await signInWithGoogle(idToken);
      router.replace('/(tabs)');
    } catch (err) {
      // Error is handled by the store
    }
  };

  const handleAppleSignIn = async (identityToken: string, nonce: string) => {
    clearError();
    setValidationError(null);
    try {
      await signInWithApple(identityToken, nonce);
      router.replace('/(tabs)');
    } catch (err) {
      // Error is handled by the store
    }
  };

  const handleDemoMode = () => {
    enterDemoMode();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
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
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.description}>
              Sign in to manage your fantasy team
            </Text>

            {(error || validationError) && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error || validationError}</Text>
              </View>
            )}

            {/* Social Auth Buttons */}
            <SocialAuthButtons
              onGoogleSignIn={handleGoogleSignIn}
              onAppleSignIn={handleAppleSignIn}
              disabled={isLoading}
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or sign in with email</Text>
              <View style={styles.dividerLine} />
            </View>

            <Input
              label="Email"
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              leftIcon="mail-outline"
            />

            <Input
              label="Password"
              placeholder="Enter your password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              leftIcon="lock-closed-outline"
            />

            <TouchableOpacity
              onPress={() => router.push('/(auth)/forgot-password')}
              style={styles.forgotPassword}
            >
              <Text style={styles.forgotPasswordText}>Forgot password?</Text>
            </TouchableOpacity>

            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={isLoading}
              fullWidth
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Button
              title="Continue in Demo Mode"
              onPress={handleDemoMode}
              variant="outline"
              fullWidth
            />

            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>Don't have an account? </Text>
              <Link href="/(auth)/register" asChild>
                <TouchableOpacity>
                  <Text style={styles.signupLink}>Sign Up</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },

  keyboardView: {
    flex: 1,
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
    color: COLORS.gray[400],
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
    color: COLORS.gray[600],
    marginTop: -SPACING.sm,
  },

  form: {
    width: '100%',
  },

  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.gray[900],
    marginBottom: SPACING.xs,
  },

  description: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[600],
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

  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: SPACING.lg,
  },

  forgotPasswordText: {
    color: COLORS.primary,
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
  },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.lg,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.gray[300],
  },

  dividerText: {
    marginHorizontal: SPACING.md,
    color: COLORS.gray[500],
    fontSize: FONTS.sizes.sm,
  },

  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.xl,
  },

  signupText: {
    color: COLORS.gray[600],
    fontSize: FONTS.sizes.md,
  },

  signupLink: {
    color: COLORS.primary,
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
  },
});
