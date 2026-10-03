import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';

/**
 * Landing route for `theundercut://auth/amazon` (F-094).
 *
 * The Amazon web flow collects its own result: `WebBrowser.openAuthSessionAsync` hands the redirect
 * straight back to `amazonWebSignIn()`, so nothing is read here. The route exists because the app
 * declares the `theundercut` scheme, so the system may also deliver the redirect as an intent — and
 * without a route for it expo-router would show "unmatched route" on top of a sign-in that is in
 * fact going fine. It shows a spinner and steps aside.
 */
export default function AmazonAuthCallback() {
  const { colors, mono } = useSimpleTheme();

  useEffect(() => {
    const t = setTimeout(() => router.replace('/'), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[mono(11, 'medium'), { color: colors.text.muted }]}>SIGNING IN…</Text>
    </View>
  );
}
