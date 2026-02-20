import React, { useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS } from '../../config/constants';
import { useChatStore } from '../../store/chat.store';
import type { ChatMessage } from '../../types';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { useScale } from '../../hooks/useScale';

interface ChatScreenProps {
  leagueId: string;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function formatDateSeparator(date: Date): string {
  const now = new Date();
  if (isSameDay(date, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function ChatScreen({ leagueId }: ChatScreenProps) {
  const subscribe = useChatStore((s) => s.subscribe);
  const unsubscribe = useChatStore((s) => s.unsubscribe);
  const markAsRead = useChatStore((s) => s.markAsRead);
  const loadOlder = useChatStore((s) => s.loadOlder);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const messages = useChatStore((s) => s.messagesByLeague[leagueId] || []);
  const isLoading = useChatStore((s) => s.isLoadingMessages);
  const isLoadingOlder = useChatStore((s) => s.isLoadingOlder);
  const hasMore = useChatStore((s) => s.hasMoreOlderMessages[leagueId] ?? true);
  const subscriptionError = useChatStore((s) => s.subscriptionErrors[leagueId]);
  const sendError = useChatStore((s) => s.sendError);
  const { scaledFonts, scaledSpacing, scaledIcon } = useScale();

  useEffect(() => {
    subscribe(leagueId);
    return () => {
      markAsRead(leagueId);
      unsubscribe(leagueId);
    };
  }, [leagueId]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingOlder) {
      loadOlder(leagueId);
    }
  }, [leagueId, hasMore, isLoadingOlder]);

  const handleReply = useCallback(
    (message: ChatMessage) => {
      setReplyingTo(message);
    },
    [setReplyingTo]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      // Date separator: show when day changes (inverted list, so compare with next item)
      const nextMessage = messages[index + 1];
      const showDate =
        !nextMessage || !isSameDay(item.createdAt, nextMessage.createdAt);

      return (
        <>
          <MessageBubble
            message={item}
            leagueId={leagueId}
            onReply={handleReply}
          />
          {showDate && (
            <View style={styles.dateSeparator}>
              <View style={styles.dateLine} />
              <Text style={[styles.dateText, { fontSize: scaledFonts.xs }]}>
                {formatDateSeparator(item.createdAt)}
              </Text>
              <View style={styles.dateLine} />
            </View>
          )}
        </>
      );
    },
    [messages, leagueId, handleReply]
  );

  const renderFooter = useCallback(() => {
    if (!isLoadingOlder) return null;
    return (
      <View style={styles.loadingOlder}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }, [isLoadingOlder]);

  if (isLoading && messages.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {sendError && (
        <View style={styles.sendErrorBanner}>
          <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
          <Text style={[styles.sendErrorText, { fontSize: scaledFonts.sm }]}>{sendError}</Text>
        </View>
      )}
      {subscriptionError ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cloud-offline-outline" size={scaledIcon(64)} color={COLORS.text.muted} />
          <Text style={[styles.emptyTitle, { fontSize: scaledFonts.lg }]}>Chat Unavailable</Text>
          <Text style={[styles.emptySubtitle, { fontSize: scaledFonts.md }]}>{subscriptionError}</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={scaledIcon(64)} color={COLORS.text.muted} />
          <Text style={[styles.emptyTitle, { fontSize: scaledFonts.lg }]}>No messages yet</Text>
          <Text style={[styles.emptySubtitle, { fontSize: scaledFonts.md }]}>
            Be the first to say something!
          </Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={styles.listContent}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        />
      )}
      {!subscriptionError && <ChatInput leagueId={leagueId} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingVertical: SPACING.sm,
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    marginVertical: SPACING.sm,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border.default,
  },
  dateText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginHorizontal: SPACING.md,
    fontWeight: '500',
  },
  loadingOlder: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
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
    paddingHorizontal: SPACING.xl,
  },
  sendErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.warningLight,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warning + '30',
  },
  sendErrorText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.warning,
    flex: 1,
  },
});
