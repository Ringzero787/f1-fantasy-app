import { Stack } from 'expo-router';
import { COLORS } from '../../../src/config/constants';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.surface,
        },
        headerTintColor: COLORS.text.primary,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Admin Panel',
        }}
      />
      <Stack.Screen
        name="error-logs"
        options={{
          title: 'Error Logs',
        }}
      />
      <Stack.Screen
        name="news"
        options={{
          title: 'News Management',
        }}
      />
    </Stack>
  );
}
