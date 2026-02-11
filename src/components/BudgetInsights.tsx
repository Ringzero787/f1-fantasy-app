import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, TEAM_SIZE, BUDGET } from '../config/constants';

interface BudgetInsightsProps {
  remainingBudget: number;
  slotsRemaining: number;
  totalSlots?: number;
}

interface Insight {
  type: 'info' | 'warning' | 'success' | 'tip';
  message: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export function BudgetInsights({
  remainingBudget,
  slotsRemaining,
  totalSlots = TEAM_SIZE,
}: BudgetInsightsProps) {
  const insight = useMemo((): Insight | null => {
    if (slotsRemaining <= 0) {
      return null;
    }

    const avgPerSlot = remainingBudget / slotsRemaining;
    const filledSlots = totalSlots - slotsRemaining;

    // Over budget
    if (remainingBudget < 0) {
      return {
        type: 'warning',
        message: `Over budget! Remove ${Math.abs(remainingBudget)} pts worth of picks.`,
        icon: 'warning',
      };
    }

    // Very low budget warning
    if (slotsRemaining > 0 && avgPerSlot < 75) {
      return {
        type: 'warning',
        message: `Low budget! Only ~${Math.round(avgPerSlot)} pts per remaining driver.`,
        icon: 'alert-circle',
      };
    }

    // Good budget per slot
    if (slotsRemaining > 0 && avgPerSlot >= 150 && avgPerSlot <= 250) {
      return {
        type: 'success',
        message: `Well balanced! ~${Math.round(avgPerSlot)} pts per slot available.`,
        icon: 'checkmark-circle',
      };
    }

    // High budget remaining - can afford Tier A
    if (slotsRemaining > 0 && avgPerSlot > 250) {
      return {
        type: 'tip',
        message: `Room for a Tier A pick! You have ~${Math.round(avgPerSlot)} pts per slot.`,
        icon: 'star',
      };
    }

    // Moderate budget - suggest balance
    if (slotsRemaining >= 3 && avgPerSlot >= 100 && avgPerSlot < 150) {
      return {
        type: 'info',
        message: `Consider mixing 1-2 Tier A drivers with Tier C picks.`,
        icon: 'bulb',
      };
    }

    // Last pick with decent budget
    if (slotsRemaining === 1 && remainingBudget >= 100) {
      return {
        type: 'tip',
        message: `Final pick! You can afford drivers up to ${remainingBudget} pts.`,
        icon: 'flag',
      };
    }

    // Default - show average
    if (slotsRemaining > 0) {
      return {
        type: 'info',
        message: `~${Math.round(avgPerSlot)} pts available per remaining slot.`,
        icon: 'information-circle',
      };
    }

    return null;
  }, [remainingBudget, slotsRemaining, totalSlots]);

  if (!insight) return null;

  const getColors = () => {
    switch (insight.type) {
      case 'warning':
        return { bg: COLORS.warningLight, text: COLORS.warning, iconColor: COLORS.warning };
      case 'success':
        return { bg: COLORS.successLight, text: COLORS.success, iconColor: COLORS.success };
      case 'tip':
        return { bg: COLORS.purple[100], text: COLORS.purple[700], iconColor: COLORS.purple[600] };
      default:
        return { bg: COLORS.infoLight, text: COLORS.info, iconColor: COLORS.info };
    }
  };

  const colors = getColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Ionicons name={insight.icon} size={16} color={colors.iconColor} />
      <Text style={[styles.message, { color: colors.text }]}>{insight.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },

  message: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
  },
});
