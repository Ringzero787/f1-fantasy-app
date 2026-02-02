import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../config/constants';

// Required for Google auth session
WebBrowser.maybeCompleteAuthSession();

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

  // Google Auth - You'll need to add your own client IDs in app.json or here
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    // Add your Google OAuth client IDs here
    // Get these from Google Cloud Console -> APIs & Services -> Credentials
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  React.useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      if (id_token) {
        handleGoogleSuccess(id_token);
      }
    }
  }, [response]);

  const handleGoogleSuccess = async (idToken: string) => {
    setIsGoogleLoading(true);
    try {
      await onGoogleSignIn(idToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign in failed';
      Alert.alert('Error', message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGooglePress = async () => {
    if (!request) {
      Alert.alert(
        'Google Sign In',
        'Google Sign In is not configured. Please add your Google OAuth client IDs to the environment variables.'
      );
      return;
    }
    await promptAsync();
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
        <Ionicons name="logo-google" size={20} color={COLORS.gray[700]} />
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
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
  },

  appleButton: {
    backgroundColor: '#000000',
  },

  buttonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
  },

  googleText: {
    color: COLORS.gray[700],
  },

  appleText: {
    color: COLORS.white,
  },

  disabled: {
    opacity: 0.5,
  },
});
