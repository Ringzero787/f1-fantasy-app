import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function LeaguesStack() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerTitleStyle: { fontFamily: t.fDisp, fontWeight: '700' },
        contentStyle: { backgroundColor: t.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Leagues' }} />
      <Stack.Screen name="create" options={{ title: 'New league', presentation: 'modal' }} />
      <Stack.Screen name="join" options={{ title: 'Join with code', presentation: 'modal' }} />
      <Stack.Screen name="[id]/index" options={{ title: 'League' }} />
      <Stack.Screen name="[id]/settle-up" options={{ title: 'Settle up' }} />
      <Stack.Screen name="[id]/ledger" options={{ title: 'Ledger history' }} />
      <Stack.Screen name="[id]/settlements" options={{ title: 'Settlements' }} />
      <Stack.Screen name="[id]/payout" options={{ title: 'Create payout', presentation: 'modal' }} />
      <Stack.Screen name="[id]/settings" options={{ title: 'League settings' }} />
    </Stack>
  );
}
