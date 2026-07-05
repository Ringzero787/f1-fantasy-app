import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { S_RADIUS, S_FONT_FAMILY } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { useAuthStore } from '../../store/auth.store';

interface Props {
  onPress: () => void;
}

function initialsOf(name?: string | null): string {
  if (!name) return '·';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

// Race Day profile entry — the "sliver": a slim full-width bar pinned above
// the toggle row (replaces the old floating bottom pill).
export const SimpleProfilePill = React.memo(function SimpleProfilePill({ onPress }: Props) {
  const { colors, scaled } = useSimpleTheme();
  const user = useAuthStore((s) => s.user);
  const initials = initialsOf(user?.displayName);

  const styles = useMemo(() => ({
    bar: {
      height: scaled(30),
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingLeft: 12,
      paddingRight: 10,
      gap: 10,
    },
    chip: {
      width: scaled(22),
      height: scaled(22),
      borderRadius: S_RADIUS.sm,
      backgroundColor: colors.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    chipText: {
      fontSize: scaled(10),
      fontFamily: S_FONT_FAMILY.display.bold,
      letterSpacing: 0.3,
      color: colors.text.inverse,
    },
    label: {
      flex: 1,
      fontSize: scaled(11),
      fontFamily: S_FONT_FAMILY.body.bold,
      letterSpacing: 4,
      textTransform: 'uppercase' as const,
      color: colors.text.primary,
    },
    arrow: {
      fontSize: scaled(14),
      fontFamily: S_FONT_FAMILY.body.bold,
      color: colors.text.primary,
    },
  }), [colors, scaled]);

  return (
    <TouchableOpacity style={styles.bar} onPress={onPress} activeOpacity={0.7} accessibilityLabel="Profile">
      <View style={styles.chip}>
        <Text style={styles.chipText}>{initials}</Text>
      </View>
      <Text style={styles.label}>Profile</Text>
      <Text style={styles.arrow}>→</Text>
    </TouchableOpacity>
  );
});
