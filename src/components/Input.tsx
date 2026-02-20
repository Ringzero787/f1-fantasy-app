import React, { useState, useRef } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, SHADOWS } from '../config/constants';
import { useTheme } from '../hooks/useTheme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helper?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
  variant?: 'default' | 'filled' | 'outlined';
}

export function Input({
  label,
  error,
  helper,
  leftIcon,
  rightIcon,
  onRightIconPress,
  containerStyle,
  secureTextEntry,
  variant = 'default',
  ...props
}: InputProps) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const isPassword = secureTextEntry !== undefined;
  const showPassword = isPassword && isPasswordVisible;

  const inputContainerStyles = [
    styles.inputContainer,
    variant === 'filled' && styles.inputContainerFilled,
    variant === 'outlined' && styles.inputContainerOutlined,
    isFocused && [styles.inputContainerFocused, { borderColor: theme.primary }],
    isFocused && variant === 'filled' && styles.inputContainerFilledFocused,
    error && styles.inputContainerError,
  ];

  const handleContainerPress = () => {
    inputRef.current?.focus();
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <Pressable onPress={handleContainerPress} style={inputContainerStyles}>
        {leftIcon && (
          <Ionicons
            name={leftIcon}
            size={20}
            color={isFocused ? theme.primary : COLORS.gray[400]}
            style={styles.leftIcon}
          />
        )}

        <TextInput
          ref={inputRef}
          style={[styles.input, leftIcon && styles.inputWithLeftIcon]}
          placeholderTextColor={COLORS.gray[400]}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={isPassword && !showPassword}
          selectionColor={theme.primary}
          underlineColorAndroid="transparent"
          {...props}
        />

        {isPassword && (
          <Pressable
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            style={({ pressed }) => [styles.rightIcon, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={COLORS.gray[500]}
            />
          </Pressable>
        )}

        {rightIcon && !isPassword && (
          <Pressable
            onPress={onRightIconPress}
            style={({ pressed }) => [styles.rightIcon, { opacity: pressed ? 0.6 : 1 }]}
            disabled={!onRightIconPress}
          >
            <Ionicons name={rightIcon} size={20} color={COLORS.gray[500]} />
          </Pressable>
        )}
      </Pressable>

      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={14} color={COLORS.error} />
          <Text style={styles.error}>{error}</Text>
        </View>
      )}
      {helper && !error && <Text style={styles.helper}>{helper}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },

  label: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.sm,
    letterSpacing: 0.2,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray[50],
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.gray[200],
    minHeight: 52,
  },

  inputContainerFilled: {
    backgroundColor: COLORS.gray[100],
    borderColor: 'transparent',
  },

  inputContainerOutlined: {
    backgroundColor: 'transparent',
    borderColor: COLORS.gray[300],
  },

  inputContainerFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    ...SHADOWS.xs,
  },

  inputContainerFilledFocused: {
    backgroundColor: COLORS.white,
  },

  inputContainerError: {
    borderColor: COLORS.error,
    backgroundColor: COLORS.errorLight,
  },

  input: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[900],
    textAlignVertical: 'center',
  },

  inputWithLeftIcon: {
    paddingLeft: 0,
  },

  leftIcon: {
    marginLeft: SPACING.lg,
    marginRight: SPACING.sm,
  },

  rightIcon: {
    padding: SPACING.md,
    paddingRight: SPACING.lg,
  },

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },

  error: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.error,
    fontWeight: '500',
  },

  helper: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: SPACING.sm,
  },
});
