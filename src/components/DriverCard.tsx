import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, SHADOWS, TEAM_COLORS } from '../config/constants';
import { formatPoints, formatDollars } from '../utils/formatters';
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
  isTopTen?: boolean; // If true, hides star icon (top 10 drivers can't be starred)
}

export const DriverCard = React.memo(function DriverCard({
  driver,
  onPress,
  onSelect,
  isSelected = false,
  showPrice = true,
  showPoints = false,
  showPriceChange = false,
  compact = false,
  isTopTen = false,
}: DriverCardProps) {
  const priceChange = driver.price - driver.previousPrice;
  const priceDirection = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'neutral';

  if (compact) {
    const teamColor = TEAM_COLORS[driver.constructorId]?.primary || '#4B5563';
    return (
      <Pressable
        style={({ pressed }) => [
          styles.compactContainer,
          isSelected && styles.selected,
          { transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
        onPress={onPress || onSelect}
      >
        {/* Team color indicator */}
        <View style={[styles.compactTeamColor, { backgroundColor: teamColor }]} />
        <View style={styles.compactLeft}>
          <View style={styles.compactNameRow}>
            <Text style={styles.shortName}>{driver.shortName}</Text>
            {driver.tier === 'A' && !isTopTen && (
              <View style={styles.compactTierBadge}>
                <Text style={styles.compactTierText}>A</Text>
              </View>
            )}
          </View>
          <Text style={styles.compactTeam} numberOfLines={1}>{driver.constructorName}</Text>
        </View>
        <View style={styles.compactRight}>
          {showPoints && (
            <View style={styles.compactPointsContainer}>
              <Text style={styles.compactPointsValue}>{formatPoints(driver.currentSeasonPoints || 0)}</Text>
              <Text style={styles.compactPointsLabel}>pts</Text>
            </View>
          )}
          {showPrice && (
            <View style={styles.compactPriceContainer}>
              <Text style={styles.compactPrice}>{formatDollars(driver.price)}</Text>
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
        </View>
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
      {/* Driver number badge with team color gradient */}
      <View style={styles.header}>
        <View style={styles.driverInfo}>
          <LinearGradient
            colors={[
              TEAM_COLORS[driver.constructorId]?.primary || '#4B5563',
              TEAM_COLORS[driver.constructorId]?.secondary || '#374151'
            ]}
            style={styles.numberBadge}
          >
            <Text style={styles.number}>{driver.number}</Text>
          </LinearGradient>
          <View style={styles.nameContainer}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{driver.name}</Text>
              {driver.tier === 'A' && !isTopTen && (
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
                <Ionicons name="add" size={18} color={COLORS.text.muted} />
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
              <Text style={styles.statValue}>{formatDollars(driver.price)}</Text>
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
            <Text style={styles.statLabel}>2026 PTS</Text>
            <Text style={styles.statValue}>{formatPoints(driver.currentSeasonPoints || 0)}</Text>
          </View>
        )}

        <View style={styles.stat}>
          <Text style={styles.statLabel}>TIER</Text>
          <View style={[styles.tierBadge, driver.tier === 'A' ? styles.tierA : driver.tier === 'C' ? styles.tierC : styles.tierB]}>
            <Text style={[styles.tierText, driver.tier === 'A' && styles.tierAText, driver.tier === 'C' && styles.tierCText]}>
              Tier {driver.tier}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  compactContainer: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border.default,
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
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.border.default,
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
    borderTopColor: COLORS.border.default,
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
    backgroundColor: COLORS.purple[600] + '30',
  },

  tierB: {
    backgroundColor: COLORS.surface,
  },

  tierC: {
    backgroundColor: COLORS.success + '20',
  },

  tierText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.text.muted,
  },

  tierAText: {
    color: COLORS.purple[400],
  },

  tierCText: {
    color: COLORS.success,
  },

  compactTeamColor: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    marginRight: SPACING.sm,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },

  compactLeft: {
    flex: 1,
    marginLeft: SPACING.sm,
  },

  compactRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },

  compactPointsContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },

  compactPointsValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.primary,
  },

  compactPointsLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    fontWeight: '500',
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
    backgroundColor: COLORS.purple[600] + '30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },

  compactTierText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.purple[400],
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
