import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAnnouncementStore } from '../store/announcement.store';
import { useAuth } from '../hooks/useAuth';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../config/constants';
import { useTheme } from '../hooks/useTheme';

export function AnnouncementBanner() {
  const theme = useTheme();
  const { user } = useAuth();
  const activeAnnouncements = useAnnouncementStore(s => s.activeAnnouncements);
  const dismissedIds = useAnnouncementStore(s => s.dismissedIds);
  const dismissAnnouncement = useAnnouncementStore(s => s.dismissAnnouncement);
  const submitReply = useAnnouncementStore(s => s.submitReply);
  const isSubmittingReply = useAnnouncementStore(s => s.isSubmittingReply);

  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySent, setReplySent] = useState(false);

  const announcement = activeAnnouncements.find(a => !dismissedIds.includes(a.id)) || null;
  if (!announcement) return null;

  const handleDismiss = () => {
    dismissAnnouncement(announcement.id);
    setExpanded(false);
    setReplyText('');
    setReplySent(false);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !user) return;
    await submitReply(
      announcement.leagueId,
      announcement.id,
      user.id,
      user.displayName || 'Anonymous',
      replyText.trim()
    );
    setReplyText('');
    setReplySent(true);
    // Auto-dismiss the banner after showing confirmation
    setTimeout(() => {
      setReplySent(false);
      dismissAnnouncement(announcement.id);
    }, 1500);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.primary + '1F', borderColor: theme.primary + '30' }]}>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}
        >
          <Ionicons name="megaphone" size={18} color={theme.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.content}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}
        >
          <View style={[styles.leagueTag, { backgroundColor: theme.primary + '25' }]}>
            <Text style={[styles.leagueTagText, { color: theme.primary }]}>{announcement.leagueName}</Text>
          </View>
          <Text style={styles.message} numberOfLines={expanded ? undefined : 2}>
            {announcement.message}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={handleDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={18} color={COLORS.text.muted} />
        </TouchableOpacity>
      </View>

      {expanded && (
        <View style={[styles.replySection, { borderTopColor: theme.primary + '20' }]}>
          {replySent ? (
            <View style={styles.replySentRow}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              <Text style={styles.replySentText}>Reply sent</Text>
            </View>
          ) : (
            <View style={styles.replyRow}>
              <TextInput
                style={styles.replyInput}
                placeholder="Write a reply..."
                placeholderTextColor={COLORS.text.muted}
                value={replyText}
                onChangeText={setReplyText}
                multiline
                maxLength={300}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  { backgroundColor: theme.primary + '15' },
                  (!replyText.trim() || isSubmittingReply) && styles.sendButtonDisabled,
                ]}
                onPress={handleSendReply}
                disabled={!replyText.trim() || isSubmittingReply}
              >
                <Ionicons
                  name="send"
                  size={16}
                  color={replyText.trim() && !isSubmittingReply ? theme.primary : COLORS.text.muted}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.primary + '1F',
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  leagueTag: {
    backgroundColor: COLORS.primary + '25',
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  leagueTagText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.primary,
  },
  message: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.primary,
    lineHeight: 20,
  },
  dismissButton: {
    padding: 2,
  },
  replySection: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.primary + '20',
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  replyInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.primary,
    maxHeight: 80,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  replySentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  replySentText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.success,
    fontWeight: '500',
  },
});
