import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { S_COLORS, S_FONTS, S_SPACING, S_RADIUS } from '../theme/simpleTheme';

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

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: S_COLORS.surface,
    borderRadius: S_RADIUS.lg,
    padding: 3,
    marginHorizontal: S_SPACING.lg,
    marginBottom: S_SPACING.md,
  },
  tab: {
    flex: 1,
    paddingVertical: S_SPACING.sm + 2,
    alignItems: 'center',
    borderRadius: S_RADIUS.md,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  tabActive: {
    backgroundColor: S_COLORS.primary,
  },
  tabText: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.medium,
    color: S_COLORS.text.muted,
  },
  tabTextActive: {
    color: S_COLORS.text.inverse,
    fontWeight: S_FONTS.weights.semibold,
  },
  badge: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: S_COLORS.warning,
  },
});
