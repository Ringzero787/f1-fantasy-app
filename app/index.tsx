import { Redirect } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { Loading } from '../src/components/Loading';

export default function Index() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <Loading fullScreen message="Loading..." />;
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
