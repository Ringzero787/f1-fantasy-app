import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { S_RADIUS, S_FONTS } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';

export type SimplePanel = 'standings' | 'team' | 'market';

interface Props {
  active: SimplePanel;
  onChange: (panel: SimplePanel) => void;
  hasLeague: boolean;
}

const TABS: { key: SimplePanel; label: string }[] = [
  { key: 'standings', label: 'Standings' },
  { key: 'team', label: 'My Team' },
  { key: 'market', label: 'Market' },
];

export const SimpleToggleBar = React.memo(function SimpleToggleBar({ active, onChange, hasLeague }: Props) {
  const { colors, fonts, spacing } = useSimpleTheme();

  const styles = useMemo(() => ({
    container: {
      flexDirection: 'row' as const,
      backgroundColor: colors.surface,
      borderRadius: S_RADIUS.lg,
      padding: 3,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    tab: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      alignItems: 'center' as const,
      borderRadius: S_RADIUS.md,
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
      gap: 4,
    },
    tabActive: {
      backgroundColor: colors.primary,
    },
    tabText: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.medium,
      color: colors.text.muted,
    },
    tabTextActive: {
      color: colors.text.inverse,
      fontWeight: S_FONTS.weights.semibold,
    },
    badge: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.warning,
    },
  }), [colors, fonts, spacing]);

  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onChange(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.key === 'standings' && !hasLeague && (
              <View style={styles.badge} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
});
