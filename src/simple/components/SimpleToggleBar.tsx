import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { S_RADIUS, S_FONT_FAMILY } from '../theme/simpleTheme';
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

// Race Day toggle: skewed −10° uppercase tabs; labels counter-skewed +10°
// so the type stays upright while the chip leans.
export const SimpleToggleBar = React.memo(function SimpleToggleBar({ active, onChange, hasLeague }: Props) {
  const { colors, spacing, scaled } = useSimpleTheme();

  const styles = useMemo(() => ({
    container: {
      flexDirection: 'row' as const,
      backgroundColor: colors.surface,
      borderRadius: S_RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 4,
      gap: 4,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    tab: {
      flex: 1,
      height: scaled(40),
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderRadius: S_RADIUS.sm,
      transform: [{ skewX: '-10deg' }],
    },
    tabActive: {
      backgroundColor: colors.primary,
    },
    tabInner: {
      transform: [{ skewX: '10deg' }],
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
    },
    tabText: {
      fontSize: scaled(12.5),
      fontFamily: S_FONT_FAMILY.body.bold,
      letterSpacing: 0.6,
      textTransform: 'uppercase' as const,
      color: colors.text.secondary,
    },
    tabTextActive: {
      color: colors.text.inverse,
    },
    badge: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
  }), [colors, spacing, scaled]);

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
            <View style={styles.tabInner}>
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {tab.key === 'standings' && !hasLeague && !isActive && (
                <View style={styles.badge} />
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});
