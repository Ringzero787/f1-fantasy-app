import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, SHADOWS } from '../config/constants';
import { formatPoints, formatDollars } from '../utils/formatters';
import type { Constructor } from '../types';

interface ConstructorCardProps {
  constructor: Constructor;
  onPress?: () => void;
  onSelect?: () => void;
  isSelected?: boolean;
  showPrice?: boolean;
  showPoints?: boolean;
  showPriceChange?: boolean;
  showPosition?: boolean;
  position?: number;
  compact?: boolean;
}

export const ConstructorCard = React.memo(function ConstructorCard({
  constructor,
  onPress,
  onSelect,
  isSelected = false,
  showPrice = true,
  showPoints = false,
  showPriceChange = false,
  showPosition = false,
  position,
  compact = false,
}: ConstructorCardProps) {
  const priceChange = constructor.price - constructor.previousPrice;
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
        <View style={[styles.teamColorAccent, { backgroundColor: constructor.primaryColor }]} />
        <View style={styles.compactContent}>
          <Text style={styles.compactName} numberOfLines={1}>{constructor.name}</Text>
        </View>
        {showPrice && (
          <Text style={styles.compactPrice}>{formatDollars(constructor.price)}</Text>
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
      {/* Team color accent bar */}
      <View style={[styles.teamColorBar, { backgroundColor: constructor.primaryColor }]} />

      <View style={styles.content}>
        {/* Header with team info */}
        <View style={styles.header}>
          <View style={styles.constructorInfo}>
            <View style={[styles.teamBadge, { backgroundColor: constructor.primaryColor + '15' }]}>
              <View style={[styles.teamColorDot, { backgroundColor: constructor.primaryColor }]} />
            </View>
            <View style={styles.nameContainer}>
              <Text style={styles.name}>{constructor.name}</Text>
              <Text style={styles.nationality}>{constructor.nationality}</Text>
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
                <Text style={styles.statValue}>{formatDollars(constructor.price)}</Text>
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
              <Text style={styles.statValue}>{formatPoints(constructor.currentSeasonPoints || 0)}</Text>
            </View>
          )}

          {showPosition && position && (
            <View style={styles.stat}>
              <Text style={styles.statLabel}>POSITION</Text>
              <View style={styles.positionContainer}>
                {position <= 3 && (
                  <Ionicons
                    name={position === 1 ? 'trophy' : 'medal'}
                    size={16}
                    color={position === 1 ? COLORS.gold : position === 2 ? COLORS.silver : COLORS.bronze}
                    style={styles.positionIcon}
                  />
                )}
                <Text style={[styles.statValue, position <= 3 && styles.topPosition]}>
                  #{position}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  compactContainer: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  selected: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    ...SHADOWS.glow,
  },

  teamColorBar: {
    width: 5,
  },

  teamColorAccent: {
    width: 4,
    alignSelf: 'stretch',
  },

  content: {
    flex: 1,
    padding: SPACING.lg,
  },

  compactContent: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },

  constructorInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  teamBadge: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },

  teamColorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },

  nameContainer: {
    flex: 1,
  },

  name: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
    letterSpacing: -0.3,
  },

  nationality: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  compactName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
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

  topPosition: {
    color: COLORS.gold,
  },

  positionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  positionIcon: {
    marginRight: SPACING.xs,
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

  compactPrice: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.text.secondary,
    paddingRight: SPACING.md,
  },

  checkContainer: {
    paddingRight: SPACING.md,
  },
});
