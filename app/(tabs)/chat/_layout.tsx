import { Stack } from 'expo-router';
import { COLORS } from '../../../src/config/constants';

export default function ChatLayout() {
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
          title: 'Chat',
        }}
      />
      <Stack.Screen
        name="[leagueId]"
        options={{
          title: 'League Chat',
        }}
      />
    </Stack>
  );
}
