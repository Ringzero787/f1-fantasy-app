import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../config/constants';
import { useTheme } from '../hooks/useTheme';
import { functions, httpsCallable } from '../config/firebase';

type Priority = 'info' | 'warning' | 'critical';

const PRIORITY_COLORS: Record<Priority, string> = {
  info: '#06B6D4',
  warning: '#F59E0B',
  critical: '#EF4444',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

export default function BroadcastContent() {
  const theme = useTheme();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('info');
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const accentColor = PRIORITY_COLORS[priority];
  const canSend = title.trim().length > 0 && body.trim().length > 0;

  const handleSendPress = () => {
    if (!canSend) return;
    Alert.alert(
      'Send Global Broadcast',
      'This will send a notification to ALL users. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            setConfirmText('');
            setConfirmModalVisible(true);
          },
        },
      ],
    );
  };

  const handleConfirmSend = async () => {
    setConfirmModalVisible(false);
    setSending(true);

    try {
      const sendBroadcast = httpsCallable(functions, 'sendGlobalBroadcast');
      const result = await sendBroadcast({
        title: title.trim(),
        body: body.trim(),
        priority,
        sendEmail,
      });

      const data = result.data as { recipientCount: number; emailsSent: number };

      Alert.alert(
        'Broadcast Sent',
        `Notification sent to ${data.recipientCount} users${data.emailsSent > 0 ? ` (${data.emailsSent} emails)` : ''}.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (error: any) {
      const message = error?.message || 'Failed to send broadcast';
      Alert.alert('Error', message);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Priority Selector */}
        <Text style={[styles.label, { color: COLORS.text.secondary }]}>Priority</Text>
        <View style={styles.priorityRow}>
          {(['info', 'warning', 'critical'] as Priority[]).map((p) => {
            const isActive = priority === p;
            const color = PRIORITY_COLORS[p];
            return (
              <TouchableOpacity
                key={p}
                style={[
                  styles.priorityButton,
                  { borderColor: color + '40', backgroundColor: isActive ? color + '20' : theme.card },
                  isActive && { borderColor: color },
                ]}
                onPress={() => setPriority(p)}
              >
                <View style={[styles.priorityDot, { backgroundColor: color }]} />
                <Text
                  style={[
                    styles.priorityText,
                    { color: isActive ? color : COLORS.text.muted },
                    isActive && { fontWeight: '700' },
                  ]}
                >
                  {PRIORITY_LABELS[p]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Title */}
        <View style={styles.fieldRow}>
          <Text style={[styles.label, { color: COLORS.text.secondary }]}>Title</Text>
          <Text style={[styles.counter, { color: COLORS.text.muted }]}>
            {title.length}/100
          </Text>
        </View>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.card,
              color: COLORS.text.primary,
              borderColor: COLORS.border.default,
            },
          ]}
          placeholder="Notification title..."
          placeholderTextColor={COLORS.text.muted}
          value={title}
          onChangeText={(t) => setTitle(t.slice(0, 100))}
          maxLength={100}
        />

        {/* Body */}
        <View style={styles.fieldRow}>
          <Text style={[styles.label, { color: COLORS.text.secondary }]}>Message</Text>
          <Text style={[styles.counter, { color: COLORS.text.muted }]}>
            {body.length}/2000
          </Text>
        </View>
        <TextInput
          style={[
            styles.input,
            styles.textArea,
            {
              backgroundColor: theme.card,
              color: COLORS.text.primary,
              borderColor: COLORS.border.default,
            },
          ]}
          placeholder="Broadcast message..."
          placeholderTextColor={COLORS.text.muted}
          value={body}
          onChangeText={(t) => setBody(t.slice(0, 2000))}
          maxLength={2000}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        {/* Email Toggle */}
        <View style={[styles.toggleRow, { backgroundColor: theme.card, borderColor: COLORS.border.default }]}>
          <View style={styles.toggleLabel}>
            <Ionicons name="mail-outline" size={18} color={COLORS.text.secondary} />
            <Text style={[styles.toggleText, { color: COLORS.text.primary }]}>
              Also send via email
            </Text>
          </View>
          <Switch
            value={sendEmail}
            onValueChange={setSendEmail}
            trackColor={{ false: COLORS.border.default, true: accentColor + '60' }}
            thumbColor={sendEmail ? accentColor : COLORS.text.muted}
          />
        </View>

        {/* Preview */}
        <Text style={[styles.label, { color: COLORS.text.secondary, marginTop: SPACING.lg }]}>
          Preview
        </Text>
        <View
          style={[
            styles.previewCard,
            {
              backgroundColor: theme.card,
              borderColor: COLORS.border.default,
              borderLeftColor: accentColor,
            },
          ]}
        >
          <View style={styles.previewHeader}>
            <View style={[styles.previewIcon, { backgroundColor: accentColor + '20' }]}>
              <Ionicons name="megaphone" size={18} color={accentColor} />
            </View>
            <Text
              style={[styles.previewTitle, { color: COLORS.text.primary }]}
              numberOfLines={1}
            >
              {title || 'Notification title'}
            </Text>
          </View>
          <Text
            style={[styles.previewBody, { color: COLORS.text.muted }]}
            numberOfLines={4}
          >
            {body || 'Broadcast message will appear here...'}
          </Text>
        </View>

        {/* Send Button */}
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: canSend && !sending ? accentColor : COLORS.text.muted + '40' },
          ]}
          onPress={handleSendPress}
          disabled={!canSend || sending}
          activeOpacity={0.7}
        >
          {sending ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <>
              <Ionicons name="send" size={18} color={COLORS.white} />
              <Text style={styles.sendButtonText}>Send to All Users</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Confirmation Modal — type "SEND" to confirm */}
      <Modal
        visible={confirmModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Ionicons name="warning" size={32} color={COLORS.warning} style={{ alignSelf: 'center' }} />
            <Text style={[styles.modalTitle, { color: COLORS.text.primary }]}>
              Confirm Broadcast
            </Text>
            <Text style={[styles.modalMessage, { color: COLORS.text.muted }]}>
              Type <Text style={{ fontWeight: '700', color: COLORS.text.primary }}>SEND</Text> to confirm sending this broadcast to all users.
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  backgroundColor: theme.background,
                  color: COLORS.text.primary,
                  borderColor: confirmText === 'SEND' ? COLORS.success : COLORS.border.default,
                },
              ]}
              placeholder='Type "SEND"'
              placeholderTextColor={COLORS.text.muted}
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { borderColor: COLORS.border.default }]}
                onPress={() => setConfirmModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: COLORS.text.secondary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: confirmText === 'SEND' ? accentColor : COLORS.text.muted + '40',
                  },
                ]}
                onPress={handleConfirmSend}
                disabled={confirmText !== 'SEND'}
              >
                <Text style={[styles.modalButtonText, { color: COLORS.white }]}>
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
  label: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  counter: {
    fontSize: FONTS.sizes.xs,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  priorityButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.md,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginTop: SPACING.md,
  },
  toggleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  toggleText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
  },
  previewCard: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  previewIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: {
    flex: 1,
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
  },
  previewBody: {
    fontSize: FONTS.sizes.sm,
    lineHeight: 20,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.lg,
  },
  sendButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  modalTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: FONTS.sizes.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  modalButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  modalCancelButton: {
    borderWidth: 1,
  },
  modalButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
  },
});
