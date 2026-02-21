import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getInitials, getAvatarGradient, getAvatarColors } from '../utils/avatarColors';
import { FONTS, BORDER_RADIUS, COLORS } from '../config/constants';
import { useTheme } from '../hooks/useTheme';

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
  onPress?: () => void;
  editable?: boolean;
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
  onPress,
  editable = false,
  style,
}: AvatarProps) {
  const theme = useTheme();
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
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

  const isClickable = onPress || editable;

  // Render the edit badge
  const renderEditBadge = () => {
    if (!editable) return null;
    return (
      <View style={styles.editBadge}>
        <Ionicons name="pencil" size={10} color={COLORS.white} />
      </View>
    );
  };

  // Render the generate button
  const renderGenerateButton = () => {
    if (!showGenerateButton || !onGeneratePress) return null;
    return (
      <TouchableOpacity
        style={[styles.generateButton, { backgroundColor: theme.primary }]}
        onPress={(e) => {
          e.stopPropagation?.();
          onGeneratePress();
        }}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Ionicons name="sparkles" size={10} color={COLORS.white} />
        )}
      </TouchableOpacity>
    );
  };

  // Render the regenerate button (for when image exists)
  const renderRegenerateButton = () => {
    if (!showGenerateButton || !onGeneratePress) return null;
    return (
      <TouchableOpacity
        style={[styles.regenerateButton, { backgroundColor: theme.primary }]}
        onPress={(e) => {
          e.stopPropagation?.();
          onGeneratePress();
        }}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Ionicons name="refresh" size={12} color={COLORS.white} />
        )}
      </TouchableOpacity>
    );
  };

  // Wrapper component - TouchableOpacity if clickable, View otherwise
  const Wrapper = isClickable ? TouchableOpacity : View;
  const wrapperProps = isClickable
    ? { onPress, activeOpacity: 0.7 }
    : {};

  // If we have a valid image URL and no error, show the image
  if (imageUrl && !imageError) {
    return (
      <Wrapper {...wrapperProps} style={[styles.imageContainer, containerStyle, style]}>
        <Image
          source={{ uri: imageUrl }}
          style={[styles.image, { borderRadius }]}
          onError={() => setImageError(true)}
          onLoad={() => setImageLoading(false)}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
        {imageLoading && (
          <View style={[styles.imagePlaceholder, { backgroundColor: theme.card, borderRadius }]}>
            <ActivityIndicator size="small" color={COLORS.text.muted} />
          </View>
        )}
        {renderEditBadge()}
        {renderRegenerateButton()}
      </Wrapper>
    );
  }

  // Show generating state
  if (isGenerating) {
    return (
      <Wrapper {...wrapperProps} style={style}>
        <LinearGradient
          colors={gradient}
          style={[styles.container, containerStyle]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <ActivityIndicator size="small" color={COLORS.white} />
        </LinearGradient>
        {renderEditBadge()}
      </Wrapper>
    );
  }

  // Fallback to initials with gradient
  if (useGradient) {
    return (
      <Wrapper {...wrapperProps} style={style}>
        <LinearGradient
          colors={gradient}
          style={[styles.container, containerStyle]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
        </LinearGradient>
        {renderEditBadge()}
        {renderGenerateButton()}
      </Wrapper>
    );
  }

  // Fallback to initials without gradient
  return (
    <Wrapper {...wrapperProps} style={style}>
      <View style={[styles.container, containerStyle, { backgroundColor: colors.bg }]}>
        <Text style={[styles.initials, { fontSize, color: colors.text }]}>{initials}</Text>
      </View>
      {renderEditBadge()}
      {renderGenerateButton()}
    </Wrapper>
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
  imagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
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
  editBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: COLORS.gray[600],
    borderRadius: BORDER_RADIUS.full,
    padding: 4,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
});
