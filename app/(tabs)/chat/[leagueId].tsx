import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '../../../src/components/chat/ChatScreen';
import { useLeagueStore } from '../../../src/store/league.store';
import { Stack } from 'expo-router';

export default function ChatRoomScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const leagues = useLeagueStore((s) => s.leagues);
  const league = leagues.find((l) => l.id === leagueId);

  return (
    <>
      <Stack.Screen options={{ title: league?.name || 'League Chat' }} />
      <ChatScreen leagueId={leagueId || ''} />
    </>
  );
}
