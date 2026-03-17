import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_COLORS, S_FONTS, S_SPACING, S_RADIUS } from '../theme/simpleTheme';

interface Props {
  onPress: () => void;
}

export const SimpleProfilePill = React.memo(function SimpleProfilePill({ onPress }: Props) {
  return (
    <View style={styles.wrapper}>
      <TouchableOpacity style={styles.pill} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.handle} />
        <View style={styles.row}>
          <Ionicons name="person-circle-outline" size={16} color={S_COLORS.text.muted} />
          <Text style={styles.label}>Profile</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: S_SPACING.sm,
  },
  pill: {
    backgroundColor: S_COLORS.surface,
    borderTopLeftRadius: S_RADIUS.lg,
    borderTopRightRadius: S_RADIUS.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: S_COLORS.border,
    paddingTop: S_SPACING.xs,
    paddingBottom: S_SPACING.sm,
    paddingHorizontal: S_SPACING.xl,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: S_COLORS.border,
    marginBottom: S_SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: S_FONTS.sizes.xs,
    color: S_COLORS.text.muted,
    fontWeight: S_FONTS.weights.medium,
  },
});
