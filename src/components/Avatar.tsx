import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getInitials, getAvatarGradient, getAvatarColors } from '../utils/avatarColors';
import { FONTS, BORDER_RADIUS, COLORS } from '../config/constants';

export type AvatarVariant = 'league' | 'team' | 'user';
export type AvatarSize = 'small' | 'medium' | 'large' | 'xlarge';

interface AvatarProps {
  name: string;
  size?: AvatarSize | number;
  variant?: AvatarVariant;
  useGradient?: boolean;
  imageUrl?: string | null;
  isGenerating?: boolean;
  onGeneratePress?: () => void;
  showGenerateButton?: boolean;
  style?: object;
}

const SIZE_MAP: Record<AvatarSize, number> = {
  small: 32,
  medium: 40,
  large: 48,
  xlarge: 56,
};

const FONT_SIZE_MAP: Record<AvatarSize, number> = {
  small: FONTS.sizes.sm,
  medium: FONTS.sizes.md,
  large: FONTS.sizes.lg,
  xlarge: FONTS.sizes.xl,
};

export function Avatar({
  name,
  size = 'medium',
  variant = 'team',
  useGradient = true,
  imageUrl,
  isGenerating = false,
  onGeneratePress,
  showGenerateButton = false,
  style,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  const initials = getInitials(name);
  const gradient = getAvatarGradient(name);
  const colors = getAvatarColors(name);

  const avatarSize = typeof size === 'number' ? size : SIZE_MAP[size];
  const fontSize = typeof size === 'number'
    ? size * 0.4
    : FONT_SIZE_MAP[size];

  const borderRadius = variant === 'league'
    ? BORDER_RADIUS.md
    : variant === 'user'
      ? BORDER_RADIUS.full
      : BORDER_RADIUS.md;

  const containerStyle = {
    width: avatarSize,
    height: avatarSize,
    borderRadius: borderRadius,
  };

  // If we have a valid image URL and no error, show the image
  if (imageUrl && !imageError) {
    return (
      <View style={[styles.imageContainer, containerStyle, style]}>
        <Image
          source={{ uri: imageUrl }}
          style={[styles.image, { borderRadius }]}
          onError={() => setImageError(true)}
          resizeMode="cover"
        />
        {showGenerateButton && onGeneratePress && (
          <TouchableOpacity
            style={styles.regenerateButton}
            onPress={onGeneratePress}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Ionicons name="refresh" size={12} color={COLORS.white} />
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Show generating state
  if (isGenerating) {
    return (
      <LinearGradient
        colors={gradient}
        style={[styles.container, containerStyle, style]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <ActivityIndicator size="small" color={COLORS.white} />
      </LinearGradient>
    );
  }

  // Fallback to initials
  const content = (
    <>
      <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
      {showGenerateButton && onGeneratePress && (
        <TouchableOpacity
          style={styles.generateButton}
          onPress={onGeneratePress}
        >
          <Ionicons name="sparkles" size={10} color={COLORS.white} />
        </TouchableOpacity>
      )}
    </>
  );

  if (useGradient) {
    return (
      <LinearGradient
        colors={gradient}
        style={[styles.container, containerStyle, style]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {content}
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.container, containerStyle, { backgroundColor: colors.bg }, style]}>
      <Text style={[styles.initials, { fontSize, color: colors.text }]}>{initials}</Text>
      {showGenerateButton && onGeneratePress && (
        <TouchableOpacity
          style={styles.generateButton}
          onPress={onGeneratePress}
        >
          <Ionicons name="sparkles" size={10} color={COLORS.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  imageContainer: {
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  generateButton: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    padding: 4,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  regenerateButton: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    padding: 4,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
});
