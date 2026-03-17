import { Redirect } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { Loading } from '../src/components/Loading';

export default function Index() {
  const { isLoading, isAuthenticated, authReady, isDemoMode } = useAuth();

  // Wait for Firebase onAuthStateChanged to fire before routing.
  // Without this, stale persisted isAuthenticated skips login on fresh installs.
  if (!authReady && !isDemoMode) {
    return <Loading fullScreen message="Loading..." />;
  }

  if (isLoading) {
    return <Loading fullScreen message="Loading..." />;
  }

  if (isAuthenticated) {
    return <Redirect href={'/(simple)' as any} />;
  }

  return <Redirect href="/(auth)/login" />;
}
