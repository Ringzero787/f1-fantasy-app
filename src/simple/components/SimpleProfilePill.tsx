import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONTS } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';

interface Props {
  onPress: () => void;
}

export const SimpleProfilePill = React.memo(function SimpleProfilePill({ onPress }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, fonts, spacing } = useSimpleTheme();

  const styles = useMemo(() => ({
    wrapper: {
      position: 'absolute' as const,
      bottom: 0,
      left: 0,
      right: 0,
      alignItems: 'center' as const,
    },
    pill: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: S_RADIUS.lg,
      borderTopRightRadius: S_RADIUS.lg,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.border,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      paddingHorizontal: spacing.xxl,
      alignItems: 'center' as const,
      minHeight: 48,
      minWidth: 120,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: spacing.xs,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
    },
    label: {
      fontSize: fonts.sm,
      color: colors.text.muted,
      fontWeight: S_FONTS.weights.medium,
    },
  }), [colors, fonts, spacing]);

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <TouchableOpacity style={styles.pill} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.handle} />
        <View style={styles.row}>
          <Ionicons name="person-circle-outline" size={20} color={colors.text.muted} />
          <Text style={styles.label}>Profile</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
});
