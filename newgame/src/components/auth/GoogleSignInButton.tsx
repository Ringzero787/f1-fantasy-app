// "Sign in with Google" button — uses the native Google Sign-In SDK
// (@react-native-google-signin/google-signin), then hands the resulting ID
// token to Firebase Auth via authStore.signInWithGoogle.
//
// Configure() runs once at module load. webClientId must be the Web OAuth
// client ID from Firebase project f1-app-18077 — shared with Undercut.
// The native Android client (per-bundle) is auto-resolved by the library
// from android/app/google-services.json.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useAuthStore } from '@store/auth.store';
import { colors, fontSize, spacing } from '@/constants/theme';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!WEB_CLIENT_ID) return;
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: false,
  });
  configured = true;
}

export function GoogleSignInButton({ disabled }: { disabled?: boolean }) {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const setError = useAuthStore((s) => s.setError);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ensureConfigured();
  }, []);

  const onPress = async () => {
    if (!WEB_CLIENT_ID) {
      setError('Google sign-in is not configured for this build.');
      return;
    }
    setBusy(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      // SDK v16+ returns { type: 'success', data: { idToken, user, ... } }.
      // Older shapes had idToken on the top-level result. Handle both.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r: any = result;
      const idToken: string | undefined = r?.data?.idToken ?? r?.idToken;
      if (!idToken) {
        setError('Google sign-in returned no ID token. Try again.');
        return;
      }
      await signInWithGoogle(idToken);
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e: any = err;
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) {
        // User dismissed the picker — silent.
      } else if (e?.code === statusCodes.IN_PROGRESS) {
        // Another sign-in in flight — silent.
      } else if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError('Google Play services are required for Google sign-in.');
      } else {
        setError(e?.message ? `Google sign-in failed: ${e.message}` : 'Google sign-in failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = !!disabled || busy || !WEB_CLIENT_ID;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.85 : isDisabled ? 0.5 : 1 }]}
    >
      {busy ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <View style={styles.row}>
          <View style={styles.glyph}>
            <Text style={styles.glyphText}>G</Text>
          </View>
          <Text style={styles.text}>Continue with Google</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  glyph: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphText: {
    color: '#4285F4',
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 14,
  },
  text: { color: colors.text, fontSize: fontSize.body, fontWeight: '600', letterSpacing: 0.2 },
});
