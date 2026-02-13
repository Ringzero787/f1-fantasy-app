import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { usePurchaseStore } from '../src/store/purchase.store';

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
  useEffect(() => {
    function handleUrl(url: string) {
      const code = extractInviteCode(url);
      if (code) {
        router.replace({ pathname: '/leagues', params: { join: 'true', code } });
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

    // Initialize in-app purchases
    usePurchaseStore.getState().initializeIAP();

    return () => {
      subscription.remove();
      usePurchaseStore.getState().cleanupIAP();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
