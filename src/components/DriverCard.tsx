import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, SHADOWS } from '../config/constants';
import { formatPoints } from '../utils/formatters';
import type { Driver } from '../types';

interface DriverCardProps {
  driver: Driver;
  onPress?: () => void;
  onSelect?: () => void;
  isSelected?: boolean;
  showPrice?: boolean;
  showPoints?: boolean;
  showPriceChange?: boolean;
  compact?: boolean;
}

export function DriverCard({
  driver,
  onPress,
  onSelect,
  isSelected = false,
  showPrice = true,
  showPoints = false,
  showPriceChange = false,
  compact = false,
}: DriverCardProps) {
  const priceChange = driver.price - driver.previousPrice;
  const priceDirection = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'neutral';

  if (compact) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.compactContainer,
          isSelected && styles.selected,
          { transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
        onPress={onPress || onSelect}
      >
        <View style={styles.compactLeft}>
          <View style={styles.compactNameRow}>
            <Text style={styles.shortName}>{driver.shortName}</Text>
            {driver.tier === 'A' && (
              <View style={styles.compactTierBadge}>
                <Text style={styles.compactTierText}>A</Text>
              </View>
            )}
          </View>
          <Text style={styles.compactTeam} numberOfLines={1}>{driver.constructorName}</Text>
        </View>
        {showPrice && (
          <View style={styles.compactPriceContainer}>
            <Text style={styles.compactPrice}>{formatPoints(driver.price)}</Text>
            {showPriceChange && priceDirection !== 'neutral' && (
              <View style={[styles.miniPriceBadge, priceDirection === 'up' ? styles.priceUp : styles.priceDown]}>
                <Ionicons
                  name={priceDirection === 'up' ? 'caret-up' : 'caret-down'}
                  size={10}
                  color={COLORS.white}
                />
              </View>
            )}
          </View>
        )}
        {isSelected && (
          <View style={styles.checkContainer}>
            <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        isSelected && styles.selected,
        { transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}
      onPress={onPress || onSelect}
    >
      {/* Driver number badge with gradient */}
      <View style={styles.header}>
        <View style={styles.driverInfo}>
          <LinearGradient
            colors={driver.tier === 'A' ? [COLORS.purple[600], COLORS.purple[800]] : [COLORS.gray[400], COLORS.gray[600]]}
            style={styles.numberBadge}
          >
            <Text style={styles.number}>{driver.number}</Text>
          </LinearGradient>
          <View style={styles.nameContainer}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{driver.name}</Text>
              {driver.tier === 'A' && (
                <View style={styles.tierIndicator}>
                  <Ionicons name="star" size={12} color={COLORS.gold} />
                </View>
              )}
            </View>
            <Text style={styles.team} numberOfLines={1}>{driver.constructorName}</Text>
          </View>
        </View>
        {onSelect && (
          <Pressable
            onPress={onSelect}
            style={({ pressed }) => [styles.selectButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.selectCircle, isSelected && styles.selectCircleActive]}>
              {isSelected ? (
                <Ionicons name="checkmark" size={18} color={COLORS.white} />
              ) : (
                <Ionicons name="add" size={18} color={COLORS.gray[400]} />
              )}
            </View>
          </Pressable>
        )}
      </View>

      {/* Stats row */}
      <View style={styles.stats}>
        {showPrice && (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>PRICE</Text>
            <View style={styles.priceRow}>
              <Text style={styles.statValue}>{formatPoints(driver.price)}</Text>
              {showPriceChange && priceDirection !== 'neutral' && (
                <View style={[styles.priceBadge, priceDirection === 'up' ? styles.priceUp : styles.priceDown]}>
                  <Ionicons
                    name={priceDirection === 'up' ? 'trending-up' : 'trending-down'}
                    size={12}
                    color={COLORS.white}
                  />
                  <Text style={styles.priceChangeText}>{Math.abs(priceChange)}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {showPoints && (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>POINTS</Text>
            <Text style={styles.statValue}>{formatPoints(driver.fantasyPoints)}</Text>
          </View>
        )}

        <View style={styles.stat}>
          <Text style={styles.statLabel}>TIER</Text>
          <View style={[styles.tierBadge, driver.tier === 'A' ? styles.tierA : styles.tierB]}>
            <Text style={[styles.tierText, driver.tier === 'A' && styles.tierAText]}>
              {driver.tier === 'A' ? 'Premium' : 'Standard'}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },

  compactContainer: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.xs,
  },

  selected: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    ...SHADOWS.glow,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },

  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  numberBadge: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },

  number: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.white,
  },

  nameContainer: {
    flex: 1,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  name: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
    letterSpacing: -0.3,
  },

  tierIndicator: {
    marginLeft: SPACING.xs,
  },

  team: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  selectButton: {
    padding: SPACING.xs,
  },

  selectCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.gray[200],
  },

  selectCircleActive: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },

  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[100],
  },

  stat: {
    alignItems: 'flex-start',
  },

  statLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.text.muted,
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },

  statValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
  },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: 3,
  },

  miniPriceBadge: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },

  priceUp: {
    backgroundColor: COLORS.priceUp,
  },

  priceDown: {
    backgroundColor: COLORS.priceDown,
  },

  priceChangeText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.white,
    fontWeight: '700',
  },

  tierBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },

  tierA: {
    backgroundColor: COLORS.purple[100],
  },

  tierB: {
    backgroundColor: COLORS.gray[100],
  },

  tierText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.gray[600],
  },

  tierAText: {
    color: COLORS.purple[700],
  },

  compactLeft: {
    flex: 1,
  },

  compactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  shortName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.text.primary,
  },

  compactTierBadge: {
    backgroundColor: COLORS.purple[100],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },

  compactTierText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.purple[700],
  },

  compactTeam: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  compactPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  compactPrice: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.text.secondary,
  },

  checkContainer: {
    marginLeft: SPACING.sm,
  },
});
