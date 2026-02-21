import React, { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS } from '../../../src/config/constants';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLeagueStore } from '../../../src/store/league.store';
import { useChatStore } from '../../../src/store/chat.store';
import { ChatListItem } from '../../../src/components/chat/ChatListItem';

export default function AdminChatListScreen() {
  const theme = useTheme();
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
          Join or create a league to start chatting
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={leagues}
        keyExtractor={(item) => item.id}
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
            <ChatListItem
              leagueId={item.id}
              leagueName={item.name}
              lastMessage={lastMessagePreview}
              lastMessageTime={lastMessageTime}
              unreadCount={unreadCounts[item.id] || 0}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/admin/chat-room' as any,
                  params: { leagueId: item.id },
                })
              }
            />
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
