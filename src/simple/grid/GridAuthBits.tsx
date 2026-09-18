import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert, KeyboardAvoidingView, Platform, StatusBar, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { getGoogleIdToken, getAppleCredential } from '../../components/SocialAuthButtons';
import { isAmazonBuild } from '../../utils/storeDetection';
import { MonoLabel } from './GridBits';

const isExpoGo = Constants.appOwnership === 'expo';

// ── Shell: surface background, wordmark header, centred content ────────────
export function AuthShell({ caption, onWordmarkLongPress, children }: { caption?: string; onWordmarkLongPress?: () => void; children: React.ReactNode }) {
  const { colors, family, spacing, scaled, isDark } = useSimpleTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: 24, paddingBottom: 34 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <MonoLabel>{caption ?? 'FANTASY · SEASON ' + new Date().getFullYear()}</MonoLabel>
          </View>
          <Pressable onLongPress={onWordmarkLongPress} delayLongPress={1200} accessibilityRole="header" accessibilityLabel="Undercut">
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
  onAppleSignIn: (identityToken: string, nonce: string) => Promise<void>;
  onAmazonSignIn?: () => Promise<void>;
  disabled?: boolean;
}

export function GridSocialButtons({ onGoogleSignIn, onAppleSignIn, onAmazonSignIn, disabled }: SocialProps) {
  const { colors, family, scaled, mono } = useSimpleTheme();
  const [busy, setBusy] = useState<'google' | 'apple' | 'amazon' | null>(null);

  const google = async () => {
    if (isExpoGo) { Alert.alert('Google Sign In', 'Not available in Expo Go. Use Demo Mode or a development build.'); return; }
    setBusy('google');
    try { await onGoogleSignIn(await getGoogleIdToken()); }
    catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'SIGN_IN_CANCELLED') return;
      Alert.alert('Sign in error', err.message || 'Google sign in failed');
    } finally { setBusy(null); }
  };
  const apple = async () => {
    setBusy('apple');
    try { const { identityToken, nonce } = await getAppleCredential(); await onAppleSignIn(identityToken, nonce); }
    catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Sign in error', err.message || 'Apple sign in failed');
    } finally { setBusy(null); }
  };
  const amazon = async () => {
    if (!onAmazonSignIn) return;
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

  return (
    <View style={{ gap: 10 }}>
      {isAmazonBuild && onAmazonSignIn
        ? pill('#FF9900', '#FF9900', '#111111', <Ionicons name="cart" size={18} color="#111111" />, 'CONTINUE WITH AMAZON', amazon, 'amazon')
        : null}
      {/* Google: light button with the G mark, per Google's sign-in branding */}
      {pill('#FFFFFF', '#D6D6D2', '#1F1F1F', <Ionicons name="logo-google" size={18} color="#1F1F1F" />, 'CONTINUE WITH GOOGLE', google, 'google')}
      {/* Apple: black on light, white on dark, per the HIG */}
      {Platform.OS !== 'android'
        ? pill(colors.text.primary, colors.text.primary, colors.text.inverse, <Ionicons name="logo-apple" size={18} color={colors.text.inverse} />, 'CONTINUE WITH APPLE', apple, 'apple')
        : null}
      {isExpoGo ? <Text style={[mono(10, 'medium'), { color: colors.text.muted, textAlign: 'center', marginTop: 6 }]}>USE DEMO MODE IN EXPO GO</Text> : null}
    </View>
  );
}
