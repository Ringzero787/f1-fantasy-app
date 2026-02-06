import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, BUDGET, SHADOWS } from '../config/constants';
import { formatDollars } from '../utils/formatters';

interface BudgetBarProps {
  remaining: number;
  total?: number;
  showPercentage?: boolean;
  compact?: boolean;
}

export function BudgetBar({
  remaining,
  total = BUDGET,
  showPercentage = false,
  compact = false,
}: BudgetBarProps) {
  const spent = total - remaining;
  const spentPercentage = (spent / total) * 100;
  const remainingPercentage = (remaining / total) * 100;
  const isOverBudget = remaining < 0;

  // Get gradient colors based on spending
  const getBarColors = (): readonly [string, string] => {
    if (isOverBudget) return [COLORS.error, '#7C3AED'] as const;
    if (remaining >= total) return [COLORS.success, '#059669'] as const;

    if (spentPercentage >= 90) {
      return [COLORS.success, '#059669'] as const;
    } else if (spentPercentage >= 75) {
      return ['#84CC16', '#65A30D'] as const;
    } else if (spentPercentage >= 50) {
      return [COLORS.warning, '#D97706'] as const;
    } else if (spentPercentage >= 25) {
      return ['#F97316', '#EA580C'] as const;
    } else {
      return [COLORS.error, '#7C3AED'] as const;
    }
  };

  const getTextColor = () => {
    if (isOverBudget) return COLORS.error;
    if (remaining >= total) return COLORS.success;
    if (spentPercentage >= 90) return COLORS.success;
    if (spentPercentage >= 75) return '#65A30D';
    if (spentPercentage >= 50) return COLORS.warning;
    if (spentPercentage >= 25) return '#EA580C';
    return COLORS.error;
  };

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactBarContainer}>
          <LinearGradient
            colors={getBarColors()}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.compactBar,
              {
                width: remaining >= total ? '100%' : `${Math.max(Math.min(spentPercentage, 100), 0)}%`,
              },
            ]}
          />
        </View>
        <Text style={[styles.compactValue, { color: getTextColor() }]}>
          {formatDollars(remaining)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.labelContainer}>
          <Text style={styles.label}>Dollars</Text>
          {showPercentage && (
            <View style={[styles.percentBadge, { backgroundColor: getTextColor() + '15' }]}>
              <Text style={[styles.percentText, { color: getTextColor() }]}>
                {Math.max(remainingPercentage, 0).toFixed(0)}% left
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.value, { color: getTextColor() }]}>
          {formatDollars(remaining)} / {formatDollars(total)}
        </Text>
      </View>

      <View style={styles.barContainer}>
        <LinearGradient
          colors={getBarColors()}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.bar,
            {
              width: remaining >= total ? '100%' : `${Math.max(Math.min(spentPercentage, 100), 0)}%`,
            },
          ]}
        />
      </View>

      {isOverBudget && (
        <View style={styles.warningContainer}>
          <Text style={styles.warning}>
            Over budget by {formatDollars(Math.abs(remaining))}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },

  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  label: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  percentBadge: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.full,
  },

  percentText: {
    fontSize: 9,
    fontWeight: '600',
  },

  value: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },

  barContainer: {
    height: 6,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },

  compactBarContainer: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },

  bar: {
    height: '100%',
    borderRadius: BORDER_RADIUS.full,
  },

  compactBar: {
    height: '100%',
    borderRadius: BORDER_RADIUS.full,
  },

  compactValue: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'right',
  },

  warningContainer: {
    marginTop: SPACING.xs,
    padding: SPACING.xs,
    backgroundColor: COLORS.errorLight,
    borderRadius: BORDER_RADIUS.sm,
  },

  warning: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.error,
    fontWeight: '500',
    textAlign: 'center',
  },
});
