import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { Input, Button } from '../../src/components';
import { COLORS, SPACING, FONTS } from '../../src/config/constants';
import { isValidEmail } from '../../src/utils/validation';

export default function ForgotPasswordScreen() {
  const { resetPassword, isLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleResetPassword = async () => {
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

    try {
      await resetPassword(email.trim());
      setSuccess(true);
    } catch (err) {
      // Error is handled by the store
    }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.successContainer}>
          <Text style={styles.successTitle}>Check Your Email</Text>
          <Text style={styles.successText}>
            We've sent a password reset link to {email}. Please check your inbox
            and follow the instructions to reset your password.
          </Text>
          <Button
            title="Back to Sign In"
            onPress={() => router.back()}
            fullWidth
            style={styles.button}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.form}>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.description}>
              Enter your email address and we'll send you a link to reset your
              password.
            </Text>

            {(error || validationError) && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error || validationError}</Text>
              </View>
            )}

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

            <Button
              title="Send Reset Link"
              onPress={handleResetPassword}
              loading={isLoading}
              fullWidth
              style={styles.button}
            />

            <Button
              title="Back to Sign In"
              onPress={() => router.back()}
              variant="ghost"
              fullWidth
            />
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
    padding: SPACING.xl,
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
    lineHeight: 22,
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

  button: {
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },

  successContainer: {
    flex: 1,
    padding: SPACING.xl,
    justifyContent: 'center',
  },

  successTitle: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.gray[900],
    marginBottom: SPACING.md,
    textAlign: 'center',
  },

  successText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[600],
    marginBottom: SPACING.xl,
    lineHeight: 22,
    textAlign: 'center',
  },
});
