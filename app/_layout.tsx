import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Updates from 'expo-updates';
import { useFonts } from 'expo-font';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
// import crashlytics from '@react-native-firebase/crashlytics';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { AppUpdateGate } from '../src/components/AppUpdateGate';
import { LaunchReveal } from '../src/simple/grid/LaunchReveal';
import { useLayout } from '../src/hooks/useLayout';
import { useRemoteConfigStore } from '../src/store/remoteConfig.store';
import { usePrefsStore } from '../src/store/prefs.store';
import { usePurchaseStore } from '../src/store/purchase.store';
import '../src/i18n/bootstrap';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

function extractInviteCode(url: string): string | null {
  // Handle deep link: theundercut://join/CODE
  const deepLinkMatch = url.match(/theundercut:\/\/join\/([A-Za-z0-9]+)/);
  if (deepLinkMatch) return deepLinkMatch[1].toUpperCase();

  // Handle web URL: https://.../join?code=CODE
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/join' || parsed.pathname === '/join.html') {
      const code = parsed.searchParams.get('code');
      if (code) return code.toUpperCase();
    }
  } catch {}

  return null;
}

export default function RootLayout() {
  const { isTablet } = useLayout();

  // Grid type system (Archivo wide UI + JetBrains Mono data). Don't block
  // rendering on the load — RN falls back to the system font until ready.
  // Archivo at width 125, instanced from the OFL variable font (scripts/design/make-archivo-expanded.sh):
  // the same face the Pit Wall portal uses, so the app and the portal read as one product (F-099).
  const [fontsLoaded, fontError] = useFonts({
    ArchivoExpanded_400Regular: require('../assets/fonts/ArchivoExpanded_400Regular.ttf'),
    ArchivoExpanded_700Bold: require('../assets/fonts/ArchivoExpanded_700Bold.ttf'),
    ArchivoExpanded_900Black: require('../assets/fonts/ArchivoExpanded_900Black.ttf'),
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });
  useEffect(() => {
    if (fontError) console.warn('[fonts] load failed:', fontError.message ?? fontError);
    else if (fontsLoaded) console.log('[fonts] loaded');
  }, [fontsLoaded, fontError]);

  // Load remote config from Firestore on startup
  useEffect(() => { useRemoteConfigStore.getState().initialize(); }, []);

  /**
   * Open the store connection and register the purchase listener.
   *
   * This had no caller at all, in any released version, so initConnection() and
   * purchaseUpdatedListener() never ran: a purchase could not complete, because the completion
   * handler that sends the receipt to the server is that listener. StoreKit redelivers an
   * unfinished transaction on the next launch, which is exactly why this belongs at the root and
   * runs before sign-in rather than behind it — a transaction redelivered with nobody listening is
   * never finished and never granted, and the buyer has paid.
   */
  useEffect(() => {
    usePurchaseStore.getState().initializeIAP().catch((err) => console.warn('[iap] init failed:', err?.message ?? err));
    return () => usePurchaseStore.getState().cleanupIAP();
  }, []);

  // Track session count for review prompt
  useEffect(() => { usePrefsStore.getState().incrementSession(); }, []);

  // Lock phones to portrait; let tablets rotate freely
  useEffect(() => {
    if (!isTablet) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } else {
      ScreenOrientation.unlockAsync();
    }
  }, [isTablet]);

  useEffect(() => {
    function handleUrl(url: string) {
      // The sign-in redirects (auth/apple, auth/amazon, auth/google) are collected by the
      // browser session that opened them, not here — see src/utils/authRedirect.ts. Nothing
      // to do but let the routes under app/auth/ show a spinner and step aside (F-094).
      if (url.includes('/auth/')) return;

      const code = extractInviteCode(url);
      if (code) {
        // Route based on UI mode
        const { usePrefsStore } = require('../src/store/prefs.store');
        const uiMode = usePrefsStore.getState().uiMode;
        if (uiMode === 'simple' || !uiMode) {
          // In Simple mode, store the code and let the league panel handle it
          router.replace({ pathname: '/(simple)', params: { join: 'true', code } });
        } else {
          router.replace({ pathname: '/leagues', params: { join: 'true', code } });
        }
      }
    }

    // Handle cold start
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    // Handle warm open
    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    // Check for OTA updates and reload immediately if available
    if (!__DEV__) {
      console.log('[OTA] Checking for updates...');
      Updates.checkForUpdateAsync()
        .then(({ isAvailable }) => {
          console.log('[OTA] Update available:', isAvailable);
          if (isAvailable) {
            return Updates.fetchUpdateAsync().then(() => {
              console.log('[OTA] Update fetched, reloading...');
              Updates.reloadAsync();
            });
          }
        })
        .catch((err) => {
          console.warn('[OTA] Update check failed:', err?.message || err);
        });
    } else {
      console.log('[OTA] Skipped — dev mode');
    }

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(simple)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
          {/* Remote-config version gate (config/app). Fails open: renders
              nothing unless a min/latest version is set and this build is below it. */}
          <AppUpdateGate />
          {/* Cold-start reveal: the splash's U unrolls into UNDERCUT (F-067). */}
          <LaunchReveal />
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
