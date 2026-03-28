import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { handleAmazonDeepLink } from '../../src/utils/amazonSignIn';

export default function AmazonAuthCallback() {
  const params = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    // Reconstruct the URL and pass to the handler
    if (params.code) {
      handleAmazonDeepLink(`theundercut://auth/amazon?code=${params.code}`);
    }
  }, [params.code]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#14B8A6" />
      <Text style={styles.text}>Signing in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
});
