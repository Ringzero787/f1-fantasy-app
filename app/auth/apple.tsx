import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';

/**
 * Landing route for `theundercut://auth/apple` (F-091).
 *
 * The Apple web flow collects its own result: `WebBrowser.openAuthSessionAsync` hands the redirect
 * straight back to `appleWebSignIn()`, so nothing is read here. The route exists because the app
 * declares the `theundercut` scheme, so the system may also deliver the redirect as an intent — and
 * without a route for it expo-router would show "unmatched route" on top of a sign-in that is in
 * fact going fine. It shows a spinner and steps aside.
 */
export default function AppleAuthCallback() {
  useEffect(() => {
    const t = setTimeout(() => router.replace('/'), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#14B8A6" />
      <Text style={styles.text}>Signing in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1117', alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', marginTop: 16, fontSize: 16 },
});
