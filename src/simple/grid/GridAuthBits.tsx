import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert, Image, KeyboardAvoidingView, Platform, StatusBar, useWindowDimensions, type TextInputProps } from 'react-native';
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
import * as AppleAuthentication from 'expo-apple-authentication';
import { MonoLabel } from './GridBits';
import { fitFontSize, WORDMARK_EM_WIDTH } from './fitText';

const isExpoGo = Constants.appOwnership === 'expo';

// Provider artwork, used as supplied (recorded in .aidlc/assets.yaml): Google's current G cut from
// its Sign in with Google asset bundle, and Amazon's gold Login with Amazon button images.
const GOOGLE_G = require('../../../assets/signin/google-g.png');
const AMAZON_BUTTON = require('../../../assets/signin/login-with-amazon.png');
const AMAZON_BUTTON_PRESSED = require('../../../assets/signin/login-with-amazon-pressed.png');
const AMAZON_BUTTON_ASPECT = 195 / 46;
const GOOGLE_BUTTON_FACE = 'GoogleSans_500Medium';

// ── Shell: surface background, wordmark header, centred content ────────────
export function AuthShell({ caption, onWordmarkLongPress, children }: { caption?: string; onWordmarkLongPress?: () => void; children: React.ReactNode }) {
  const { colors, family, spacing, scaled, isDark } = useSimpleTheme();
  // The long-press demo entry is a testing hook: dev and Expo Go builds, plus
  // verification builds made with EXPO_PUBLIC_ALLOW_DEMO=1 (store builds never set it).
  const demoAllowed = __DEV__ || isExpoGo || process.env.EXPO_PUBLIC_ALLOW_DEMO === '1';
  const longPress = demoAllowed ? onWordmarkLongPress : undefined;
  // One line at every display size and phone width: at XXL the full size broke as "UNDERC / UT".
  // The system text size multiplies whatever is set here, so the row is measured in those units too.
  const { width, fontScale } = useWindowDimensions();
  const wordmarkSize = fitFontSize(scaled(40), (width - spacing.xl * 2) / (fontScale || 1), WORDMARK_EM_WIDTH);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: 24, paddingBottom: 34 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <MonoLabel>{caption ?? 'FANTASY · SEASON ' + new Date().getFullYear()}</MonoLabel>
          </View>
          <Pressable onLongPress={longPress} accessibilityRole="header" accessibilityLabel="Undercut">
            <Text numberOfLines={1} ellipsizeMode="clip" style={{ fontFamily: family.ui.black, fontSize: wordmarkSize, lineHeight: wordmarkSize, letterSpacing: -wordmarkSize * 0.05, textTransform: 'uppercase', color: colors.text.primary, marginTop: 10 }}>
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
  const { colors, scaled, mono, isDark } = useSimpleTheme();
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

  // Sign-in buttons follow each provider's own button rules, not this app's type: the provider's
  // artwork as they publish it, their wording in sentence case, the system face rather than the
  // display face, and their colours. Only the pill shape and the shared height are ours. All
  // three are one height, because Apple and Google each ask to be no smaller than the others.
  const pillHeight = scaled(48);
  const fontSize = Math.round(pillHeight * 0.4);
  // A second tap can land before the busy state has re-rendered; the native Apple button has no
  // `disabled` of its own to catch it.
  const inFlight = useRef(false);
  const once = (fn: () => Promise<void>) => async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try { await fn(); } finally { inFlight.current = false; }
  };
  const blocked = disabled || !!busy;
  const dimmed = (key: string) => (busy && busy !== key ? 0.6 : 1);
  const pill = (bg: string, border: string, fg: string, icon: React.ReactNode, label: string, onPress: () => Promise<void>, key: string, gap = 10, face?: string) => (
    <Pressable
      key={key}
      onPress={once(onPress)}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={busy === key ? 'Signing in' : label}
      accessibilityState={{ disabled: blocked, busy: busy === key }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap, height: pillHeight, paddingHorizontal: 16, borderRadius: 999, backgroundColor: bg, borderWidth: 1, borderColor: border, opacity: pressed ? 0.6 : dimmed(key) })}
    >
      {icon}
      {/* shrinks to stay inside the pill on one line; the system text size may enlarge it only a little, the pill being a fixed height */}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.15} style={[{ flexShrink: 1, fontSize, color: fg }, face ? { fontFamily: face } : { fontWeight: '500' }]}>{busy === key ? 'Signing in…' : label}</Text>
    </Pressable>
  );

  // Amazon: Amazon's own gold Login with Amazon button image, at its own proportions. Its page
  // offers only the supplied images and no rules for drawing one, so this is not a pill.
  const amazonPill = () => (
    <Pressable
      key="amazon"
      onPress={once(amazon)}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={busy === 'amazon' ? 'Signing in' : 'Login with Amazon'}
      accessibilityState={{ disabled: blocked, busy: busy === 'amazon' }}
      style={{ alignSelf: 'center', opacity: dimmed('amazon') }}
    >
      {({ pressed }) => (
        <Image
          source={pressed || busy === 'amazon' ? AMAZON_BUTTON_PRESSED : AMAZON_BUTTON}
          style={{ height: pillHeight, width: Math.round(pillHeight * AMAZON_BUTTON_ASPECT) }}
          resizeMode="contain"
        />
      )}
    </Pressable>
  );
  // Google: the light button from the Sign in with Google guidelines: white fill, #747775 stroke,
  // #1F1F1F text, and the G from Google's own asset bundle at the bundle's size relative to the
  // button (20 in 44). The gap is theirs too: 12 on iOS, 10 on Android. The label is in Google
  // Sans Medium, the face those guidelines name; it is embedded for this one label.
  const googlePill = () => pill('#FFFFFF', '#747775', '#1F1F1F',
    <Image source={GOOGLE_G} style={{ width: Math.round(pillHeight * 20 / 44), height: Math.round(pillHeight * 20 / 44) }} />,
    'Continue with Google', google, 'google', Platform.OS === 'ios' ? 12 : 10, GOOGLE_BUTTON_FACE);
  // Apple on iOS: the system's own button, which is the one the HIG guarantees is right (mark,
  // wording, face, localisation). Black on light, white on dark.
  // The system button draws itself about 4% shorter than the frame it is given (46 in 48 on the
  // simulator), which left it smaller than the Google button beside it. The HIG asks for the
  // opposite, so its frame is that much taller.
  const appleFrame = Math.round(pillHeight * 1.045);
  const appleNative = () => (
    <View key="apple" pointerEvents={blocked ? 'none' : 'auto'} accessibilityState={{ disabled: blocked, busy: busy === 'apple' }} style={{ opacity: dimmed('apple') }}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={appleFrame / 2}
        style={{ width: '100%', height: appleFrame }}
        onPress={once(apple)}
      />
    </View>
  );
  // Apple elsewhere (its web flow): a custom button the HIG allows, mark and title in one colour.
  // The mark is an icon-set glyph, not artwork from Apple Design Resources, which the HIG asks for.
  const applePill = () => Platform.OS === 'ios'
    ? appleNative()
    : pill(colors.text.primary, colors.text.primary, colors.text.inverse, <Ionicons name="logo-apple" size={Math.round(pillHeight * 0.44)} color={colors.text.inverse} />, 'Continue with Apple', apple, 'apple');

  // Which pills, in which order, is decided in `signInProviders.ts` so it can be tested — getting
  // it wrong is the difference between reaching your account and quietly making a second one.
  const pills: Record<Provider, () => React.ReactNode> = { amazon: amazonPill, google: googlePill, apple: applePill };
  const order = providerOrder({
    isAmazonBuild,
    isIOS: Platform.OS === 'ios',
    // Apple is native on iOS; elsewhere its web flow needs a Services ID in the build.
    canApple: Platform.OS === 'ios' || appleWebSignInAvailable(),
    canAmazon: !!onAmazonSignIn && amazonWebSignInAvailable(),
    canGoogleWeb: googleWebSignInAvailable(),
  });

  return (
    <View style={{ gap: 10 }}>
      {order.map((provider) => pills[provider]())}
      {isExpoGo ? <Text style={[mono(10, 'medium'), { color: colors.text.muted, textAlign: 'center', marginTop: 6 }]}>USE DEMO MODE IN EXPO GO</Text> : null}
    </View>
  );
}
