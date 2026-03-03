import React, { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';

import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS } from '../../../src/config/constants';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLayout } from '../../../src/hooks/useLayout';
import { useLeagueStore } from '../../../src/store/league.store';
import { useChatStore } from '../../../src/store/chat.store';
import { ChatListItem } from '../../../src/components/chat/ChatListItem';
import { ChatScreen } from '../../../src/components/chat/ChatScreen';
import { Stack } from 'expo-router';

export default function ChatListScreen() {
  const theme = useTheme();
  const { numColumns } = useLayout();
  const router = useRouter();
  const leagues = useLeagueStore((s) => s.leagues);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const loadUnreadCounts = useChatStore((s) => s.loadUnreadCounts);
  const messagesByLeague = useChatStore((s) => s.messagesByLeague);

  useEffect(() => {
    if (leagues.length > 0) {
      loadUnreadCounts(leagues.map((l) => l.id));
    }
  }, [leagues.length]);

  if (leagues.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="chatbubbles-outline" size={64} color={COLORS.text.muted} />
        <Text style={styles.emptyTitle}>No Leagues Yet</Text>
        <Text style={styles.emptySubtitle}>
          Join or create a league to start chatting with other members
        </Text>
      </View>
    );
  }

  // Single league: render chat inline (no navigation, so back works correctly)
  if (leagues.length === 1) {
    return (
      <>
        <Stack.Screen options={{ title: leagues[0].name || 'Chat' }} />
        <ChatScreen leagueId={leagues[0].id} />
      </>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        key={`chat-${numColumns}`}
        data={leagues}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: SPACING.sm } : undefined}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const messages = messagesByLeague[item.id] || [];
          const latestMsg = messages[0];
          let lastMessagePreview: string | undefined;
          let lastMessageTime: Date | undefined;

          if (latestMsg) {
            if (latestMsg.isDeleted) {
              lastMessagePreview = 'Message deleted';
            } else {
              lastMessagePreview = latestMsg.imageUrl
                ? `${latestMsg.senderName}: [Image]`
                : `${latestMsg.senderName}: ${latestMsg.text}`;
            }
            lastMessageTime = latestMsg.createdAt;
          }

          return (
            <View style={numColumns > 1 ? { flex: 1 } : undefined}>
              <ChatListItem
                leagueId={item.id}
                leagueName={item.name}
                lastMessage={lastMessagePreview}
                lastMessageTime={lastMessageTime}
                unreadCount={unreadCounts[item.id] || 0}
                onPress={() => router.push(`/(tabs)/chat/${item.id}` as any)}
              />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: undefined, // themed via inline style
  },
  listContent: {
    padding: SPACING.md,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    backgroundColor: undefined, // themed via inline style
  },
  emptyTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginTop: SPACING.md,
  },
  emptySubtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
});
