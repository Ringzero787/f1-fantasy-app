import { Stack } from 'expo-router';
import { COLORS } from '../../../src/config/constants';
import { useTheme } from '../../../src/hooks/useTheme';

export default function AdminLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.surface,
        },
        headerTintColor: COLORS.text.primary,
        headerTitleStyle: {
          fontWeight: '600',
        },
        contentStyle: {
          backgroundColor: theme.background,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Admin Panel',
          headerTitle: '',
          headerStyle: {
            backgroundColor: theme.surface,
            height: 50,
          },
          headerShadowVisible: false,
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
      <Stack.Screen
        name="chat-list"
        options={{
          title: 'League Chat',
        }}
      />
      <Stack.Screen
        name="chat-room"
        options={{
          title: 'Chat',
        }}
      />
    </Stack>
  );
}
