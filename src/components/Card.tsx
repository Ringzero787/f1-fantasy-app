import React from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../config/constants';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'default' | 'elevated' | 'outlined' | 'glass' | 'gradient';
  padding?: 'none' | 'small' | 'medium' | 'large';
  shadow?: 'none' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

export function Card({
  children,
  onPress,
  variant = 'default',
  padding = 'medium',
  shadow,
  style,
}: CardProps) {
  // Determine shadow based on variant if not explicitly set
  const shadowStyle = shadow
    ? SHADOWS[shadow]
    : variant === 'elevated'
      ? SHADOWS.md
      : variant === 'default'
        ? SHADOWS.sm
        : SHADOWS.none;

  const cardStyles = [
    styles.base,
    styles[variant],
    styles[`padding_${padding}`],
    shadowStyle,
    style,
  ];

  // Glass variant with gradient background
  if (variant === 'glass') {
    const content = (
      <View style={[styles.base, styles.glass, styles[`padding_${padding}`], style]}>
        {children}
      </View>
    );

    if (onPress) {
      return (
        <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}>
          {content}
        </Pressable>
      );
    }
    return content;
  }

  // Gradient variant
  if (variant === 'gradient') {
    const content = (
      <LinearGradient
        colors={[COLORS.purple[600], COLORS.purple[800]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.base, styles[`padding_${padding}`], SHADOWS.md, style]}
      >
        {children}
      </LinearGradient>
    );

    if (onPress) {
      return (
        <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}>
          {content}
        </Pressable>
      );
    }
    return content;
  }

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          ...cardStyles,
          { opacity: pressed ? 0.97 : 1, transform: [{ scale: pressed ? 0.995 : 1 }] }
        ]}
        onPress={onPress}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyles}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
  },

  // Variants
  default: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray[100],
  },
  elevated: {
    backgroundColor: COLORS.white,
  },
  outlined: {
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.gray[200],
  },
  glass: {
    backgroundColor: COLORS.glass.white,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  gradient: {
    // Styles applied via LinearGradient
  },

  // Padding
  padding_none: {
    padding: 0,
  },
  padding_small: {
    padding: SPACING.sm,
  },
  padding_medium: {
    padding: SPACING.lg,
  },
  padding_large: {
    padding: SPACING.xl,
  },
});
