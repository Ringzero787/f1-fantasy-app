import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../config/constants';
import type { ChatMessage } from '../../types';
import { ImageMessage } from './ImageMessage';
import { ReactionPicker } from './ReactionPicker';
import { useAuthStore } from '../../store/auth.store';
import { useChatStore } from '../../store/chat.store';
import { useScale } from '../../hooks/useScale';

interface MessageBubbleProps {
  message: ChatMessage;
  leagueId: string;
  onReply: (message: ChatMessage) => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message, leagueId, onReply }: MessageBubbleProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const userId = useAuthStore((s) => s.user?.id);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const { scaledFonts, scaledSpacing } = useScale();
  const isOwn = message.senderId === userId;

  if (message.isDeleted) {
    return (
      <View style={[styles.container, isOwn ? styles.containerOwn : styles.containerOther]}>
        <View style={[styles.bubble, styles.deletedBubble]}>
          <Text style={[styles.deletedText, { fontSize: scaledFonts.sm }]}>This message was deleted</Text>
        </View>
      </View>
    );
  }

  const handleLongPress = () => {
    setShowReactionPicker(true);
  };

  const handleReactionSelect = (emoji: string) => {
    toggleReaction(leagueId, message.id, emoji);
  };

  const handleDelete = () => {
    Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMessage(leagueId, message.id),
      },
    ]);
  };

  const reactionEntries = Object.entries(message.reactions || {}).filter(
    ([, users]) => users.length > 0
  );

  return (
    <View style={[styles.container, isOwn ? styles.containerOwn : styles.containerOther]}>
      {!isOwn && (
        <Text style={[styles.senderName, { fontSize: scaledFonts.xs }]}>{message.senderName}</Text>
      )}

      <TouchableOpacity
        activeOpacity={0.7}
        onLongPress={handleLongPress}
        style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}
      >
        {message.replyTo && (
          <View style={styles.replySnippet}>
            <View style={styles.replyBar} />
            <View style={styles.replyContent}>
              <Text style={[styles.replySender, { fontSize: scaledFonts.xs }]} numberOfLines={1}>
                {message.replyTo.senderName}
              </Text>
              <Text style={[styles.replyText, { fontSize: scaledFonts.xs }]} numberOfLines={1}>
                {message.replyTo.text}
              </Text>
            </View>
          </View>
        )}

        {message.text ? (
          <Text style={[styles.messageText, { fontSize: scaledFonts.md }, isOwn && styles.messageTextOwn]}>
            {message.text}
          </Text>
        ) : null}

        {message.imageUrl && <ImageMessage imageUrl={message.imageUrl} />}

        <View style={styles.meta}>
          {message.editedAt && (
            <Text style={styles.edited}>(edited)</Text>
          )}
          <Text style={[styles.timestamp, { fontSize: scaledFonts.xs }, isOwn && styles.timestampOwn]}>
            {formatTime(message.createdAt)}
          </Text>
        </View>
      </TouchableOpacity>

      {reactionEntries.length > 0 && (
        <View style={[styles.reactions, isOwn && styles.reactionsOwn]}>
          {reactionEntries.map(([emoji, users]) => (
            <TouchableOpacity
              key={emoji}
              style={[
                styles.reactionChip,
                users.includes(userId || '') && styles.reactionChipActive,
              ]}
              onPress={() => toggleReaction(leagueId, message.id, emoji)}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              <Text style={styles.reactionCount}>{users.length}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Action buttons */}
      <View style={[styles.actions, isOwn && styles.actionsOwn]}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onReply(message)}
        >
          <Ionicons name="arrow-undo-outline" size={14} color={COLORS.text.muted} />
        </TouchableOpacity>
        {isOwn && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleDelete}
          >
            <Ionicons name="trash-outline" size={14} color={COLORS.text.muted} />
          </TouchableOpacity>
        )}
      </View>

      <ReactionPicker
        visible={showReactionPicker}
        onSelect={handleReactionSelect}
        onClose={() => setShowReactionPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    maxWidth: '85%',
  },
  containerOwn: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  containerOther: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  senderName: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 2,
    marginLeft: SPACING.xs,
  },
  bubble: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    maxWidth: '100%',
  },
  bubbleOwn: {
    backgroundColor: COLORS.primary + '20',
    borderBottomRightRadius: BORDER_RADIUS.xs,
  },
  bubbleOther: {
    backgroundColor: COLORS.card,
    borderBottomLeftRadius: BORDER_RADIUS.xs,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  deletedBubble: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  deletedText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    fontStyle: 'italic',
  },
  replySnippet: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
  },
  replyBar: {
    width: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginRight: SPACING.sm,
  },
  replyContent: {
    flex: 1,
  },
  replySender: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.primary,
  },
  replyText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.secondary,
    marginTop: 1,
  },
  messageText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.primary,
    lineHeight: 20,
  },
  messageTextOwn: {
    color: COLORS.text.primary,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: SPACING.xs,
    gap: SPACING.xs,
  },
  edited: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    fontStyle: 'italic',
  },
  timestamp: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
  },
  timestampOwn: {
    color: COLORS.text.light,
  },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  reactionsOwn: {
    justifyContent: 'flex-end',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  reactionChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.secondary,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: 2,
    opacity: 0.6,
  },
  actionsOwn: {
    justifyContent: 'flex-end',
  },
  actionButton: {
    padding: 4,
  },
});
