import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, SHADOWS } from '../config/constants';
import { PRICING_CONFIG } from '../config/pricing.config';
import { useTheme } from '../hooks/useTheme';
import { formatPoints, formatDollars } from '../utils/formatters';
import { TooltipText } from './TooltipText';
import { GLOSSARY } from '../config/glossary';
import type { Constructor } from '../types';

interface ConstructorCardProps {
  constructorData: Constructor;
  onPress?: () => void;
  onSelect?: () => void;
  onAdd?: () => void;
  onSell?: () => void;
  isSelected?: boolean;
  isOnTeam?: boolean;
  teamName?: string;
  showPrice?: boolean;
  showPoints?: boolean;
  showPriceChange?: boolean;
  showPosition?: boolean;
  position?: number;
  compact?: boolean;
  dimmed?: boolean;
}

export const ConstructorCard = React.memo(function ConstructorCard({
  constructorData: constructor,
  onPress,
  onSelect,
  onAdd,
  onSell,
  isSelected = false,
  isOnTeam = false,
  teamName,
  showPrice = true,
  showPoints = false,
  showPriceChange = false,
  showPosition = false,
  position,
  compact = false,
  dimmed = false,
}: ConstructorCardProps) {
  const theme = useTheme();
  const priceChange = constructor.price - constructor.previousPrice;
  const priceDirection = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'neutral';
  const canBeAce = constructor.price <= PRICING_CONFIG.ACE_MAX_PRICE;

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
        styles.container, { backgroundColor: theme.card },
        isSelected && [styles.selected, { borderColor: theme.primary, ...theme.shadows.glow }],
        isOnTeam && !isSelected && styles.onTeamContainer,
        dimmed && { opacity: 0.4 },
        { transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}
      onPress={onPress || onSelect}
    >
      {/* On-team banner */}
      {isOnTeam && !isSelected && (
        <View style={styles.onTeamBanner}>
          <Ionicons name="checkmark-circle" size={12} color={COLORS.white} />
          <Text style={styles.onTeamBannerText}>{teamName ? teamName.toUpperCase() : 'ON YOUR TEAM'}</Text>
        </View>
      )}
      {/* Team color accent bar */}
      <View style={[styles.teamColorBar, { backgroundColor: constructor.primaryColor }]} />

      <View style={[styles.content, isOnTeam && !isSelected && { paddingTop: SPACING.md + 4 }]}>
        {/* Main row: badge + name left, stats right */}
        <View style={styles.mainRow}>
          {/* Team color badge */}
          <View style={[styles.teamBadge, { backgroundColor: constructor.primaryColor + '20' }]}>
            <View style={[styles.teamColorDot, { backgroundColor: constructor.primaryColor }]} />
          </View>

          {/* Name + nationality + principal */}
          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{constructor.name}</Text>
              {canBeAce && (
                <View style={[styles.aceBadge, { backgroundColor: theme.primary + '20' }]}>
                  <TooltipText term="ACE" definition={GLOSSARY.ace} style={[styles.aceText, { color: theme.primary }]} />
                </View>
              )}
            </View>
            <Text style={styles.nationality}>{constructor.nationality}</Text>
            {constructor.teamPrincipal && (
              <Text style={styles.teamPrincipal}>{constructor.teamPrincipal}</Text>
            )}
          </View>

          {/* Right: price + points stacked */}
          <View style={styles.statsBlock}>
            {showPoints && (constructor.currentSeasonPoints || 0) > 0 && (
              <View style={styles.pointsRow}>
                <Ionicons name="trophy" size={12} color={theme.primary} />
                <Text style={[styles.pointsValue, { color: theme.primary }]}>{formatPoints(constructor.currentSeasonPoints || 0)}</Text>
                <Text style={styles.pointsLabel}>pts</Text>
              </View>
            )}
            {showPrice && (
              <View style={styles.priceRow}>
                <Text style={styles.priceValue}>{formatDollars(constructor.price)}</Text>
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

          {/* Sell button (market mode) */}
          {onSell && !onSelect && !onAdd && (
            <Pressable
              onPress={onSell}
              style={({ pressed }) => [styles.selectButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.selectCircle, { backgroundColor: COLORS.error + '15', borderColor: COLORS.error }]}>
                <Ionicons name="remove" size={16} color={COLORS.error} />
              </View>
            </Pressable>
          )}
        </View>

        {/* Bottom badges row */}
        <View style={styles.badgesRow}>
          <View style={[styles.constructorBadge, { backgroundColor: theme.surface }]}>
            <Text style={styles.constructorBadgeText}>Constructor</Text>
          </View>
          {false && isOnTeam && (
            <View style={styles.onTeamBadge}>
              <Text style={styles.onTeamText} numberOfLines={1}>{teamName || 'ON TEAM'}</Text>
            </View>
          )}
          {showPosition && position && (
            <View style={styles.positionBadge}>
              {position <= 3 && (
                <Ionicons
                  name={position === 1 ? 'trophy' : 'medal'}
                  size={10}
                  color={position === 1 ? COLORS.gold : position === 2 ? COLORS.silver : COLORS.bronze}
                />
              )}
              <Text style={[styles.positionText, position <= 3 && styles.topPositionText]}>#{position}</Text>
            </View>
          )}
          {(constructor.currentSeasonPoints ?? 0) > 0 && !showPoints && (
            <View style={styles.fantasyBadge}>
              <Ionicons name="trophy-outline" size={10} color={theme.primary} />
              <Text style={[styles.fantasyText, { color: theme.primary }]}>{formatPoints(constructor.currentSeasonPoints ?? 0)} pts</Text>
            </View>
          )}
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

  teamBadge: {
    width: 38,
    height: 38,
    borderRadius: BORDER_RADIUS.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },

  teamColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
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
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.text.primary,
    letterSpacing: -0.3,
    flexShrink: 1,
  },

  aceBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.full,
  },

  aceText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  nationality: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 1,
  },

  teamPrincipal: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 1,
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
    fontSize: FONTS.sizes.md,
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
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },

  pointsValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },

  pointsLabel: {
    fontSize: 10,
    color: COLORS.text.muted,
    fontWeight: '600',
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

  constructorBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },

  constructorBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.text.muted,
  },

  positionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  positionText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.text.muted,
  },

  topPositionText: {
    color: COLORS.gold,
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
    borderColor: COLORS.success,
    borderWidth: 1.5,
  },

  onTeamBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 3,
    zIndex: 1,
    borderTopLeftRadius: BORDER_RADIUS.md,
    borderTopRightRadius: BORDER_RADIUS.md,
  },

  onTeamBannerText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 1,
  },

  onTeamBadge: {
    backgroundColor: COLORS.success + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    maxWidth: 80,
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
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  teamColorAccent: {
    width: 4,
    alignSelf: 'stretch',
  },

  compactContent: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },

  compactName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
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
