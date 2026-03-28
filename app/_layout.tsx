import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Updates from 'expo-updates';
// import crashlytics from '@react-native-firebase/crashlytics';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { useLayout } from '../src/hooks/useLayout';
import { handleAmazonDeepLink } from '../src/utils/amazonSignIn';

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
      // Handle Amazon auth callback deep link
      if (url.includes('auth/amazon')) {
        handleAmazonDeepLink(url);
        return;
      }

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
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
