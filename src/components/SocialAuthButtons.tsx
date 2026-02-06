import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../config/constants';

// Check if running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

interface SocialAuthButtonsProps {
  onGoogleSignIn: (idToken: string) => Promise<void>;
  onAppleSignIn: (identityToken: string, nonce: string) => Promise<void>;
  disabled?: boolean;
}

export function SocialAuthButtons({
  onGoogleSignIn,
  onAppleSignIn,
  disabled = false,
}: SocialAuthButtonsProps) {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  const handleGooglePress = async () => {
    if (isExpoGo) {
      // Google Sign-In requires native modules not available in Expo Go
      Alert.alert(
        'Google Sign In',
        'Google Sign In is not available in Expo Go. Please use Demo Mode or build a development version.',
        [{ text: 'OK' }]
      );
      return;
    }

    // In development build, use native Google Sign-In
    setIsGoogleLoading(true);
    try {
      // Dynamic import to avoid crash in Expo Go
      const { GoogleSignin, isSuccessResponse, statusCodes } = require('@react-native-google-signin/google-signin');

      const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

      // Debug logging
      console.log('=== Google Sign-In Debug ===');
      console.log('webClientId:', webClientId);
      console.log('webClientId length:', webClientId?.length);

      // Configure Google Sign-In
      GoogleSignin.configure({
        webClientId,
        offlineAccess: true,
        scopes: ['profile', 'email'],
      });
      console.log('GoogleSignin configured');

      // Check Play Services
      const hasPlayServices = await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      console.log('hasPlayServices:', hasPlayServices);

      // Sign in
      console.log('Calling GoogleSignin.signIn()...');
      const response = await GoogleSignin.signIn();
      console.log('signIn response:', JSON.stringify(response, null, 2));

      if (isSuccessResponse(response) && response.data.idToken) {
        console.log('Got idToken, calling onGoogleSignIn');
        await onGoogleSignIn(response.data.idToken);
      } else {
        throw new Error('No ID token received from Google');
      }
    } catch (error: any) {
      console.error('=== Google Sign-In Error ===');
      console.error('Error object:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('Full error JSON:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

      // Handle specific error codes
      if (error.code === 'SIGN_IN_CANCELLED') {
        // User cancelled - don't show error
        return;
      }

      const message = error instanceof Error ? error.message : 'Google sign in failed';
      Alert.alert('Sign In Error', `${message}\n\nCode: ${error.code || 'unknown'}`);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleApplePress = async () => {
    setIsAppleLoading(true);
    try {
      // Generate a secure nonce
      const nonce = Math.random().toString(36).substring(2, 10);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (credential.identityToken) {
        await onAppleSignIn(credential.identityToken, nonce);
      } else {
        throw new Error('No identity token received from Apple');
      }
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED') {
        // User canceled the sign-in
        return;
      }
      const message = error instanceof Error ? error.message : 'Apple sign in failed';
      Alert.alert('Error', message);
    } finally {
      setIsAppleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Google Sign In */}
      <TouchableOpacity
        style={[styles.button, styles.googleButton, disabled && styles.disabled]}
        onPress={handleGooglePress}
        disabled={disabled || isGoogleLoading}
      >
        <Ionicons name="logo-google" size={20} color="#374151" />
        <Text style={[styles.buttonText, styles.googleText]}>
          {isGoogleLoading ? 'Signing in...' : 'Continue with Google'}
        </Text>
      </TouchableOpacity>

      {/* Apple Sign In - Only show on iOS */}
      {Platform.OS === 'ios' && (
        <TouchableOpacity
          style={[styles.button, styles.appleButton, disabled && styles.disabled]}
          onPress={handleApplePress}
          disabled={disabled || isAppleLoading}
        >
          <Ionicons name="logo-apple" size={20} color={COLORS.white} />
          <Text style={[styles.buttonText, styles.appleText]}>
            {isAppleLoading ? 'Signing in...' : 'Continue with Apple'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Info notice - only show in Expo Go */}
      {isExpoGo && (
        <Text style={styles.notice}>
          Use Demo Mode for testing in Expo Go
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.sm,
  },

  googleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  appleButton: {
    backgroundColor: '#000000',
  },

  buttonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
  },

  googleText: {
    color: '#374151',
  },

  appleText: {
    color: COLORS.white,
  },

  disabled: {
    opacity: 0.5,
  },

  notice: {
    fontSize: FONTS.sizes.xs,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});
