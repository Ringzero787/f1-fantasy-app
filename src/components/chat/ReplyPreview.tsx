import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../config/constants';
import type { ChatMessage } from '../../types';

interface ReplyPreviewProps {
  message: ChatMessage;
  onClose: () => void;
}

export function ReplyPreview({ message, onClose }: ReplyPreviewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.bar} />
      <View style={styles.content}>
        <Text style={styles.senderName} numberOfLines={1}>
          {message.senderName}
        </Text>
        <Text style={styles.text} numberOfLines={1}>
          {message.isDeleted ? 'This message was deleted' : message.text || 'Image'}
        </Text>
      </View>
      <TouchableOpacity onPress={onClose} style={styles.closeButton}>
        <Ionicons name="close-circle" size={20} color={COLORS.text.muted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  bar: {
    width: 3,
    height: '100%',
    minHeight: 32,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginRight: SPACING.sm,
  },
  content: {
    flex: 1,
  },
  senderName: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
  text: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  closeButton: {
    padding: SPACING.xs,
  },
});
