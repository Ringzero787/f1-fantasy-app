import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, SHADOWS, TEAM_COLORS } from '../config/constants';
import { useTheme } from '../hooks/useTheme';
import { formatPoints, formatDollars } from '../utils/formatters';
import type { Driver } from '../types';

interface DriverCardProps {
  driver: Driver;
  onPress?: () => void;
  onSelect?: () => void;
  onAdd?: () => void;
  isSelected?: boolean;
  isOnTeam?: boolean;
  showPrice?: boolean;
  showPoints?: boolean;
  showPriceChange?: boolean;
  compact?: boolean;
  isTopTen?: boolean;
}

export const DriverCard = React.memo(function DriverCard({
  driver,
  onPress,
  onSelect,
  onAdd,
  isSelected = false,
  isOnTeam = false,
  showPrice = true,
  showPoints = false,
  showPriceChange = false,
  compact = false,
  isTopTen = false,
}: DriverCardProps) {
  const theme = useTheme();
  const priceChange = driver.price - driver.previousPrice;
  const priceDirection = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'neutral';
  const canBeAce = driver.price <= 200;
  const teamColor = TEAM_COLORS[driver.constructorId]?.primary || '#4B5563';

  if (compact) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.compactContainer, { backgroundColor: theme.card },
          isSelected && [styles.selected, { borderColor: theme.primary, ...theme.shadows.glow }],
          { transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
        onPress={onPress || onSelect}
      >
        <View style={[styles.compactTeamColor, { backgroundColor: teamColor }]} />
        <View style={styles.compactLeft}>
          <View style={styles.compactNameRow}>
            <Text style={styles.shortName}>{driver.shortName}</Text>
            <Text style={styles.compactFullName} numberOfLines={1}>{driver.name}</Text>
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
              <Text style={[styles.compactPointsValue, { color: theme.primary }]}>{formatPoints(driver.currentSeasonPoints || 0)}</Text>
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
        styles.container, { backgroundColor: theme.card },
        isSelected && [styles.selected, { borderColor: theme.primary, ...theme.shadows.glow }],
        isOnTeam && !isSelected && styles.onTeamContainer,
        { transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}
      onPress={onPress || onSelect}
    >
      {/* Team color accent */}
      <View style={[styles.teamColorBar, { backgroundColor: teamColor }]} />

      <View style={styles.content}>
        {/* Main row: number + info left, stats right */}
        <View style={styles.mainRow}>
          {/* Left: number badge + name */}
          <LinearGradient
            colors={[
              teamColor,
              TEAM_COLORS[driver.constructorId]?.secondary || '#374151'
            ]}
            style={styles.numberBadge}
          >
            <Text style={styles.number}>{driver.number}</Text>
          </LinearGradient>

          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{driver.name}</Text>
              {driver.tier === 'A' && !isTopTen && (
                <Ionicons name="star" size={11} color={COLORS.gold} />
              )}
              {canBeAce && !isTopTen && (
                <View style={[styles.aceBadge, { backgroundColor: theme.primary + '20' }]}>
                  <Text style={[styles.aceText, { color: theme.primary }]}>ACE</Text>
                </View>
              )}
            </View>
            <View style={styles.subtitleRow}>
              <Text style={styles.nationality}>{driver.nationality}</Text>
            </View>
          </View>

          {/* Right: price + points stacked */}
          <View style={styles.statsBlock}>
            {showPrice && (
              <View style={styles.priceRow}>
                <Text style={styles.priceValue}>{formatDollars(driver.price)}</Text>
                {showPriceChange && priceDirection !== 'neutral' && (
                  <View style={[styles.priceBadge, priceDirection === 'up' ? styles.priceUp : styles.priceDown]}>
                    <Ionicons
                      name={priceDirection === 'up' ? 'caret-up' : 'caret-down'}
                      size={9}
                      color={COLORS.white}
                    />
                    <Text style={styles.priceChangeText}>{Math.abs(priceChange)}</Text>
                  </View>
                )}
              </View>
            )}
            {showPoints && (
              <View style={styles.pointsRow}>
                <Text style={[styles.pointsValue, { color: theme.primary }]}>{formatPoints(driver.currentSeasonPoints || 0)}</Text>
                <Text style={styles.pointsLabel}>pts</Text>
              </View>
            )}
          </View>

          {/* Select button if in selection mode */}
          {onSelect && (
            <Pressable
              onPress={onSelect}
              style={({ pressed }) => [styles.selectButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.selectCircle, { backgroundColor: theme.surface }, isSelected && styles.selectCircleActive]}>
                {isSelected ? (
                  <Ionicons name="checkmark" size={16} color={COLORS.white} />
                ) : (
                  <Ionicons name="add" size={16} color={COLORS.text.muted} />
                )}
              </View>
            </Pressable>
          )}

          {/* Quick-add button (market mode) */}
          {onAdd && !onSelect && (
            <Pressable
              onPress={onAdd}
              style={({ pressed }) => [styles.selectButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.selectCircle, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
                <Ionicons name="add" size={16} color={theme.primary} />
              </View>
            </Pressable>
          )}
        </View>

        {/* Bottom badges row */}
        <View style={styles.badgesRow}>
          <View style={[styles.tierBadge, driver.tier === 'A' ? styles.tierA : driver.tier === 'C' ? styles.tierC : [styles.tierB, { backgroundColor: theme.surface }]]}>
            <Text style={[styles.tierText, driver.tier === 'A' && styles.tierAText, driver.tier === 'C' && styles.tierCText]}>
              Tier {driver.tier}
            </Text>
          </View>
          <View style={[styles.constructorBadge, { backgroundColor: teamColor + '20' }]}>
            <View style={[styles.constructorDot, { backgroundColor: teamColor }]} />
            <Text style={[styles.constructorBadgeText, { color: teamColor }]} numberOfLines={1}>
              {driver.constructorName}
            </Text>
          </View>
          {driver.fantasyPoints > 0 && (
            <View style={styles.fantasyBadge}>
              <Ionicons name="trophy-outline" size={10} color={theme.primary} />
              <Text style={[styles.fantasyText, { color: theme.primary }]}>{driver.fantasyPoints} FP</Text>
            </View>
          )}
          {isOnTeam && (
            <View style={styles.onTeamBadge}>
              <Text style={styles.onTeamText}>ON TEAM</Text>
            </View>
          )}
          <Text style={styles.shortCode}>{driver.shortName}</Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  teamColorBar: {
    width: 4,
  },

  content: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
  },

  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  numberBadge: {
    width: 38,
    height: 38,
    borderRadius: BORDER_RADIUS.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },

  number: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.white,
  },

  nameBlock: {
    flex: 1,
    marginRight: SPACING.sm,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  name: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
    letterSpacing: -0.3,
    flexShrink: 1,
  },

  aceBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.sm,
  },

  aceText: {
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },

  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },

  team: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    flexShrink: 1,
  },

  nationality: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    opacity: 0.7,
  },

  statsBlock: {
    alignItems: 'flex-end',
    minWidth: 80,
  },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  priceValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
  },

  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    gap: 1,
  },

  priceUp: {
    backgroundColor: COLORS.priceUp,
  },

  priceDown: {
    backgroundColor: COLORS.priceDown,
  },

  priceChangeText: {
    fontSize: 9,
    color: COLORS.white,
    fontWeight: '700',
  },

  pointsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    marginTop: 1,
  },

  pointsValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.primary,
  },

  pointsLabel: {
    fontSize: 9,
    color: COLORS.text.muted,
    fontWeight: '500',
  },

  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs + 2,
    paddingTop: SPACING.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border.default,
  },

  tierBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },

  tierA: {
    backgroundColor: COLORS.purple[600] + '30',
  },

  tierB: {},

  tierC: {
    backgroundColor: COLORS.success + '20',
  },

  tierText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.text.muted,
  },

  tierAText: {
    color: COLORS.purple[400],
  },

  tierCText: {
    color: COLORS.success,
  },

  constructorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    gap: 4,
    flexShrink: 1,
  },

  constructorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  constructorBadgeText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    flexShrink: 1,
  },

  fantasyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  fantasyText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.primary,
  },

  shortCode: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.text.muted,
    opacity: 0.5,
    marginLeft: 'auto',
  },

  // Select mode
  selectButton: {
    paddingLeft: SPACING.sm,
  },

  selectCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.border.default,
  },

  selectCircleActive: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },

  selected: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    ...SHADOWS.glow,
  },

  onTeamContainer: {
    borderColor: COLORS.success + '60',
  },

  onTeamBadge: {
    backgroundColor: COLORS.success + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },

  onTeamText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.success,
    letterSpacing: 0.5,
  },

  // Compact (unchanged)
  compactContainer: {
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border.default,
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

  compactFullName: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    flexShrink: 1,
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

  miniPriceBadge: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },

  checkContainer: {
    marginLeft: SPACING.sm,
  },
});
