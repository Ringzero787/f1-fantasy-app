import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '@store/auth.store';
import { authService } from '@services/auth.service';
import { notificationsService } from '@services/notifications.service';
import { colors } from '@/constants/theme';
import { ThemeProvider } from '@/theme';
import { AppConfigGate } from '@components/AppConfigGate';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUser = useAuthStore((s) => s.setUser);

  // Use Zustand's official persist hydration API — emits a real change event
  // so React re-renders when secureStorage finishes loading.
  const [isHydrated, setIsHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    if (isHydrated) return;
    const unsub = useAuthStore.persist.onFinishHydration(() => setIsHydrated(true));
    // Fallback: if hydration silently fails (rare native error in secureStorage),
    // unblock after 3s so the user still gets to the login screen.
    const timer = setTimeout(() => setIsHydrated(true), 3000);
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [isHydrated]);

  // Subscribe to Firebase auth changes — always refresh from Firestore so server
  // updates (e.g. hasOnboarded flag flipped admin-side) propagate on next launch.
  useEffect(() => {
    const unsub = authService.onAuthStateChanged((user) => {
      setUser(user);
    });
    return unsub;
  }, [setUser]);

  const user = useAuthStore((s) => s.user);

  // Register for push once signed in + onboarded. Fire-and-forget: denial, a
  // simulator, or a build without FCM are all silent no-ops. The server falls
  // back to email when there's no token.
  useEffect(() => {
    if (!user?.id || user.hasOnboarded === false) return;
    notificationsService.registerForPush(user.id).catch(() => {});
  }, [user?.id, user?.hasOnboarded]);

  useEffect(() => {
    if (!isHydrated) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // After signin, gate on onboarding
      if (user && user.hasOnboarded === false) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)');
      }
    } else if (isAuthenticated && user && user.hasOnboarded === false && !inOnboarding) {
      router.replace('/onboarding');
    }
  }, [isAuthenticated, isHydrated, segments, router, user]);

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <AppConfigGate>
          <AuthGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
              }}
            >
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="store/index" options={{ headerShown: true, presentation: 'modal' }} />
              <Stack.Screen name="results" options={{ headerShown: true, presentation: 'modal' }} />
              <Stack.Screen name="demo" options={{ headerShown: true, presentation: 'modal' }} />
              <Stack.Screen name="standings" options={{ headerShown: true, presentation: 'modal' }} />
            </Stack>
          </AuthGate>
          </AppConfigGate>
        </SafeAreaProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
