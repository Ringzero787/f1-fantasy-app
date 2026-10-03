import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert, KeyboardAvoidingView, Platform, StatusBar, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { getGoogleIdToken, getAppleCredential } from '../../components/SocialAuthButtons';
import { isAmazonBuild } from '../../utils/storeDetection';
import { appleWebSignIn, appleWebSignInAvailable } from '../../utils/appleWebSignIn';
import { amazonWebSignInAvailable } from '../../utils/amazonSignIn';
import { googleWebSignIn, googleWebSignInAvailable } from '../../utils/googleWebSignIn';
import { providerOrder, type Provider } from './signInProviders';
import { MonoLabel } from './GridBits';

const isExpoGo = Constants.appOwnership === 'expo';

// ── Shell: surface background, wordmark header, centred content ────────────
export function AuthShell({ caption, onWordmarkLongPress, children }: { caption?: string; onWordmarkLongPress?: () => void; children: React.ReactNode }) {
  const { colors, family, spacing, scaled, isDark } = useSimpleTheme();
  // The long-press demo entry is a testing hook: dev and Expo Go builds, plus
  // verification builds made with EXPO_PUBLIC_ALLOW_DEMO=1 (store builds never set it).
  const demoAllowed = __DEV__ || isExpoGo || process.env.EXPO_PUBLIC_ALLOW_DEMO === '1';
  const longPress = demoAllowed ? onWordmarkLongPress : undefined;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: 24, paddingBottom: 34 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <MonoLabel>{caption ?? 'FANTASY · SEASON ' + new Date().getFullYear()}</MonoLabel>
          </View>
          <Pressable onLongPress={longPress} accessibilityRole="header" accessibilityLabel="Undercut">
            <Text style={{ fontFamily: family.ui.black, fontSize: scaled(40), lineHeight: scaled(40), letterSpacing: -scaled(40) * 0.05, textTransform: 'uppercase', color: colors.text.primary, marginTop: 10 }}>
              Under<Text style={{ color: colors.primary }}>cut</Text>
            </Text>
          </Pressable>
          <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 32 }}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Labelled input (League Manager form style) ──────────────────────────────
export function GridField({ label, mono, style, ...input }: { label: string; mono?: boolean } & TextInputProps) {
  const { colors, family, scaled } = useSimpleTheme();
  return (
    <View style={{ gap: 8 }}>
      <MonoLabel>{label}</MonoLabel>
      <TextInput
        placeholderTextColor={colors.text.muted}
        accessibilityLabel={label}
        {...input}
        style={[{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: scaled(18), color: colors.text.primary, fontFamily: mono ? family.mono.bold : family.ui.bold, fontSize: scaled(mono ? 18 : 16) }, style]}
      />
    </View>
  );
}

export function AuthError({ messages }: { messages: string[] }) {
  const { colors, mono } = useSimpleTheme();
  if (!messages.length) return null;
  return (
    <View style={{ gap: 4 }}>
      {messages.map((m, i) => <Text key={i} style={[mono(11), { color: colors.primary }]}>{m.toUpperCase()}</Text>)}
    </View>
  );
}

// ── Social sign-in: provider-required marks on Grid pills ───────────────────
interface SocialProps {
  onGoogleSignIn: (idToken: string) => Promise<void>;
  onAppleSignIn: (identityToken: string, nonce: string, displayName?: string | null) => Promise<void>;
  onAmazonSignIn?: () => Promise<void>;
  disabled?: boolean;
}

export function GridSocialButtons({ onGoogleSignIn, onAppleSignIn, onAmazonSignIn, disabled }: SocialProps) {
  const { colors, family, scaled, mono } = useSimpleTheme();
  const [busy, setBusy] = useState<'google' | 'apple' | 'amazon' | null>(null);

  const google = async () => {
    if (isExpoGo) { Alert.alert('Google Sign In', 'Not available in Expo Go. Use Demo Mode or a development build.'); return; }
    setBusy('google');
    try {
      // Fire OS has no Play Services, so the native module cannot run there; the browser flow is
      // the only way an account made with Google on a phone opens on a Fire tablet (F-093).
      await onGoogleSignIn(isAmazonBuild ? await googleWebSignIn() : await getGoogleIdToken());
    }
    catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'SIGN_IN_CANCELLED' || err.message === 'Sign in cancelled') return;
      Alert.alert('Sign in error', err.message || 'Google sign in failed');
    } finally { setBusy(null); }
  };
  const apple = async () => {
    setBusy('apple');
    try {
      // iOS has the native sheet. Everywhere else the same credential comes back through Apple's
      // web flow, so an account made on an iPhone opens on a Pixel or a Fire tablet (F-091).
      const credential = Platform.OS === 'ios'
        ? { ...(await getAppleCredential()), displayName: null as string | null }
        : await appleWebSignIn();
      // Apple sends the name on first consent only, and over the web flow it arrives beside the
      // token rather than in the Firebase user, so it has to be carried through.
      await onAppleSignIn(credential.identityToken, credential.nonce, credential.displayName);
    }
    catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'ERR_REQUEST_CANCELED' || err.message === 'Sign in cancelled') return;
      Alert.alert('Sign in error', err.message || 'Apple sign in failed');
    } finally { setBusy(null); }
  };
  const amazon = async () => {
    if (!onAmazonSignIn) return;
    // Same reason as Google: the browser session needs a custom scheme the Expo Go shell does not
    // own, so the flow would open and never come back.
    if (isExpoGo) { Alert.alert('Login with Amazon', 'Not available in Expo Go. Use Demo Mode or a development build.'); return; }
    setBusy('amazon');
    try { await onAmazonSignIn(); }
    catch (e: unknown) {
      const err = e as { message?: string };
      if (err.message === 'Sign in cancelled') return;
      Alert.alert('Sign in error', err.message || 'Amazon sign in failed');
    } finally { setBusy(null); }
  };

  const fontSize = scaled(12);
  const pill = (bg: string, border: string, fg: string, icon: React.ReactNode, label: string, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      disabled={disabled || !!busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: scaled(18), borderRadius: 999, backgroundColor: bg, borderWidth: 1, borderColor: border, opacity: pressed || (busy && busy !== key) ? 0.6 : 1 })}
    >
      {icon}
      <Text style={{ fontFamily: family.ui.black, fontSize, letterSpacing: fontSize * 0.08, color: fg }}>{busy === key ? 'SIGNING IN…' : label}</Text>
    </Pressable>
  );

  const amazonPill = () => pill('#FF9900', '#FF9900', '#111111', <Ionicons name="cart" size={18} color="#111111" />, 'LOGIN WITH AMAZON', amazon, 'amazon');
  // Google: light button with the G mark, per Google's sign-in branding.
  const googlePill = () => pill('#FFFFFF', '#D6D6D2', '#1F1F1F', <Ionicons name="logo-google" size={18} color="#1F1F1F" />, 'CONTINUE WITH GOOGLE', google, 'google');
  // Apple: black on light, white on dark, per the HIG.
  const applePill = () => pill(colors.text.primary, colors.text.primary, colors.text.inverse, <Ionicons name="logo-apple" size={18} color={colors.text.inverse} />, 'CONTINUE WITH APPLE', apple, 'apple');

  // Which pills, in which order, is decided in `signInProviders.ts` so it can be tested — getting
  // it wrong is the difference between reaching your account and quietly making a second one.
  const pills: Record<Provider, () => React.ReactNode> = { amazon: amazonPill, google: googlePill, apple: applePill };
  const order = providerOrder({
    isAmazonBuild,
    isIOS: Platform.OS === 'ios',
    // Apple is native on iOS; elsewhere its web flow needs a Services ID in the build.
    canApple: Platform.OS === 'ios' || appleWebSignInAvailable(),
    canAmazon: !!onAmazonSignIn && (isAmazonBuild || amazonWebSignInAvailable()),
    canGoogleWeb: googleWebSignInAvailable(),
  });

  return (
    <View style={{ gap: 10 }}>
      {order.map((provider) => pills[provider]())}
      {isExpoGo ? <Text style={[mono(10, 'medium'), { color: colors.text.muted, textAlign: 'center', marginTop: 6 }]}>USE DEMO MODE IN EXPO GO</Text> : null}
    </View>
  );
}
