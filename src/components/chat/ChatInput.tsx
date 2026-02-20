import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../config/constants';
import { useChatStore } from '../../store/chat.store';
import { chatService } from '../../services/chat.service';
import { useAuthStore } from '../../store/auth.store';
import { ReplyPreview } from './ReplyPreview';
import { useScale } from '../../hooks/useScale';

interface ChatInputProps {
  leagueId: string;
}

export function ChatInput({ leagueId }: ChatInputProps) {
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const isSending = useChatStore((s) => s.isSending);
  const replyingTo = useChatStore((s) => s.replyingTo);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const { scaledFonts, scaledIcon } = useScale();
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const userId = useAuthStore((s) => s.user?.id);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    await sendMessage(leagueId, trimmed);
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        base64: true,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (result.canceled || !result.assets?.[0]?.base64) return;

      const asset = result.assets[0];
      const base64 = asset.base64!;

      if (isDemoMode) {
        // In demo mode, just show a placeholder text
        await sendMessage(leagueId, '[Image shared]');
        return;
      }

      setIsUploading(true);
      try {
        const imageUrl = await chatService.uploadChatImage(
          leagueId,
          userId ?? '',
          base64,
          asset.mimeType || 'image/jpeg'
        );
        await sendMessage(leagueId, text.trim() || '', imageUrl);
        setText('');
      } catch (e) {
        Alert.alert('Upload Failed', 'Could not upload the image. Please try again.');
        console.error('Image upload error:', e);
      } finally {
        setIsUploading(false);
      }
    } catch (e) {
      console.error('Image picker error:', e);
    }
  };

  const sending = isSending || isUploading;

  return (
    <View style={styles.wrapper}>
      {replyingTo && (
        <ReplyPreview
          message={replyingTo}
          onClose={() => setReplyingTo(null)}
        />
      )}
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.imageButton}
          onPress={handlePickImage}
          disabled={sending}
        >
          <Ionicons
            name="image-outline"
            size={scaledIcon(24)}
            color={sending ? COLORS.text.muted : COLORS.text.secondary}
          />
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { fontSize: scaledFonts.md }]}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor={COLORS.text.muted}
          multiline
          maxLength={2000}
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendButton, text.trim() && styles.sendButtonActive]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons
              name="send"
              size={scaledIcon(20)}
              color={text.trim() ? COLORS.primary : COLORS.text.muted}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  imageButton: {
    padding: SPACING.sm,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.md,
    color: COLORS.text.primary,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  sendButton: {
    padding: SPACING.sm,
    justifyContent: 'center',
  },
  sendButtonActive: {
    opacity: 1,
  },
});
