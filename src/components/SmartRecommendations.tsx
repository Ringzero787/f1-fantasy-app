import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, SHADOWS, TEAM_SIZE, BUDGET } from '../config/constants';
import { useTheme } from '../hooks/useTheme';
import type { Driver } from '../types';

interface Recommendation {
  driver: Driver;
  reason: string;
  tag: 'best-value' | 'budget-friendly' | 'top-performer' | 'balanced-pick';
  score: number;
}

interface SmartRecommendationsProps {
  availableDrivers: Driver[];
  selectedDrivers: Driver[];
  currentTeamDrivers: { driverId: string; tier?: string }[];
  budget: number;
  slotsRemaining: number;
  onSelectDriver: (driver: Driver) => void;
}

export function SmartRecommendations({
  availableDrivers,
  selectedDrivers,
  currentTeamDrivers,
  budget,
  slotsRemaining,
  onSelectDriver,
}: SmartRecommendationsProps) {
  const theme = useTheme();
  const recommendations = useMemo(() => {
    if (slotsRemaining <= 0 || budget <= 0) return [];

    // Get already selected/owned driver IDs
    const excludedIds = new Set([
      ...selectedDrivers.map(d => d.id),
      ...currentTeamDrivers.map(d => d.driverId),
    ]);

    // Filter to affordable and not already selected
    const affordableDrivers = availableDrivers.filter(
      d => d.price <= budget && !excludedIds.has(d.id)
    );

    if (affordableDrivers.length === 0) return [];

    // Count current tier composition (default to 'B' if tier not specified)
    const currentTierA = currentTeamDrivers.filter(d => (d.tier || 'B') === 'A').length +
      selectedDrivers.filter(d => d.tier === 'A').length;
    const currentTierB = currentTeamDrivers.filter(d => (d.tier || 'B') === 'B').length +
      selectedDrivers.filter(d => d.tier === 'B').length;

    // Calculate value score (points per cost)
    const driversWithValue = affordableDrivers.map(driver => {
      const valueScore = driver.fantasyPoints / driver.price;
      return { driver, valueScore };
    });

    const recommendations: Recommendation[] = [];
    const usedIds = new Set<string>();

    // Strategy 1: Best Value Pick (highest PPM)
    const sortedByValue = [...driversWithValue].sort((a, b) => b.valueScore - a.valueScore);
    const bestValue = sortedByValue.find(d => !usedIds.has(d.driver.id));
    if (bestValue) {
      usedIds.add(bestValue.driver.id);
      recommendations.push({
        driver: bestValue.driver,
        reason: `${(bestValue.valueScore * 100).toFixed(1)} pts per 100 spent`,
        tag: 'best-value',
        score: bestValue.valueScore,
      });
    }

    // Strategy 2: Budget-Friendly (save money for other slots)
    if (slotsRemaining > 1) {
      const avgBudgetPerSlot = budget / slotsRemaining;
      const budgetFriendly = affordableDrivers
        .filter(d => !usedIds.has(d.id) && d.price <= avgBudgetPerSlot * 0.8)
        .sort((a, b) => b.fantasyPoints - a.fantasyPoints)[0];

      if (budgetFriendly) {
        usedIds.add(budgetFriendly.id);
        const savings = Math.round(avgBudgetPerSlot - budgetFriendly.price);
        recommendations.push({
          driver: budgetFriendly,
          reason: `Saves ~${savings} pts for other picks`,
          tag: 'budget-friendly',
          score: budgetFriendly.fantasyPoints / budgetFriendly.price,
        });
      }
    }

    // Strategy 3: Top Performer (highest points if affordable)
    const topPerformer = affordableDrivers
      .filter(d => !usedIds.has(d.id))
      .sort((a, b) => b.fantasyPoints - a.fantasyPoints)[0];

    if (topPerformer && topPerformer.fantasyPoints > 0) {
      usedIds.add(topPerformer.id);
      recommendations.push({
        driver: topPerformer,
        reason: `${topPerformer.fantasyPoints} pts this season`,
        tag: 'top-performer',
        score: topPerformer.fantasyPoints,
      });
    }

    // Strategy 4: Balanced Pick (based on tier composition)
    const needsMoreTierA = currentTierA < 2 && slotsRemaining >= 2;
    const needsMoreTierB = currentTierB < 2;

    let balancedPick: Driver | undefined;
    if (needsMoreTierA) {
      balancedPick = affordableDrivers
        .filter(d => !usedIds.has(d.id) && d.tier === 'A')
        .sort((a, b) => (b.fantasyPoints / b.price) - (a.fantasyPoints / a.price))[0];
    } else if (needsMoreTierB) {
      balancedPick = affordableDrivers
        .filter(d => !usedIds.has(d.id) && d.tier === 'B')
        .sort((a, b) => (b.fantasyPoints / b.price) - (a.fantasyPoints / a.price))[0];
    }

    if (balancedPick) {
      usedIds.add(balancedPick.id);
      recommendations.push({
        driver: balancedPick,
        reason: `Balances your Tier ${balancedPick.tier} picks`,
        tag: 'balanced-pick',
        score: balancedPick.fantasyPoints / balancedPick.price,
      });
    }

    return recommendations;
  }, [availableDrivers, selectedDrivers, currentTeamDrivers, budget, slotsRemaining]);

  if (recommendations.length === 0) return null;

  const getTagStyle = (tag: Recommendation['tag']) => {
    switch (tag) {
      case 'best-value':
        return { bg: COLORS.success + '20', text: COLORS.success, icon: 'trending-up' as const };
      case 'budget-friendly':
        return { bg: COLORS.info + '20', text: COLORS.info, icon: 'wallet-outline' as const };
      case 'top-performer':
        return { bg: COLORS.gold + '20', text: COLORS.gold, icon: 'star' as const };
      case 'balanced-pick':
        return { bg: COLORS.purple[100], text: COLORS.purple[600], icon: 'scale-outline' as const };
    }
  };

  const getTagLabel = (tag: Recommendation['tag']) => {
    switch (tag) {
      case 'best-value':
        return 'Best Value';
      case 'budget-friendly':
        return 'Budget Pick';
      case 'top-performer':
        return 'Top Scorer';
      case 'balanced-pick':
        return 'Balanced';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="bulb" size={16} color={COLORS.gold} />
          <Text style={styles.title}>Smart Picks</Text>
        </View>
        <Text style={styles.subtitle}>
          {slotsRemaining} slot{slotsRemaining !== 1 ? 's' : ''} • {budget} pts
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {recommendations.map((rec, index) => {
          const tagStyle = getTagStyle(rec.tag);
          return (
            <Pressable
              key={`rec-${rec.driver.id}`}
              style={({ pressed }) => [
                styles.card,
                { transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              onPress={() => onSelectDriver(rec.driver)}
            >
              {/* Tag */}
              <View style={[styles.tag, { backgroundColor: tagStyle.bg }]}>
                <Ionicons name={tagStyle.icon} size={12} color={tagStyle.text} />
                <Text style={[styles.tagText, { color: tagStyle.text }]}>
                  {getTagLabel(rec.tag)}
                </Text>
              </View>

              {/* Driver Info */}
              <View style={styles.driverInfo}>
                <Text style={styles.driverName} numberOfLines={1}>
                  {rec.driver.name}
                </Text>
                <Text style={styles.teamName} numberOfLines={1}>
                  {rec.driver.constructorName}
                </Text>
              </View>

              {/* Reason */}
              <Text style={styles.reason} numberOfLines={1}>
                {rec.reason}
              </Text>

              {/* Price */}
              <View style={styles.priceRow}>
                <Text style={[styles.price, { color: theme.primary }]}>{rec.driver.price}</Text>
                <Text style={styles.priceLabel}>pts</Text>
                <Ionicons name="add-circle" size={20} color={theme.primary} style={styles.addIcon} />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  title: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.text.primary,
  },

  subtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
  },

  scrollContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },

  card: {
    width: 160,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
    gap: 4,
    marginBottom: SPACING.sm,
  },

  tagText: {
    fontSize: 10,
    fontWeight: '700',
  },

  driverInfo: {
    marginBottom: SPACING.xs,
  },

  driverName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.text.primary,
    letterSpacing: -0.2,
  },

  teamName: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 1,
  },

  reason: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.secondary,
    marginBottom: SPACING.sm,
  },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  price: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },

  priceLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginLeft: 2,
  },

  addIcon: {
    marginLeft: 'auto',
  },
});
