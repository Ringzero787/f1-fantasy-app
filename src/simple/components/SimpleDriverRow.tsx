import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_COLORS, S_FONTS, S_SPACING, S_RADIUS } from '../theme/simpleTheme';
import { TEAM_COLORS } from '../../config/constants';
import { PRICING_CONFIG } from '../../config/pricing.config';
import type { FantasyDriver } from '../../types';

interface Props {
  driver: FantasyDriver;
  isAce: boolean;
  locked: boolean;
  onRemove?: () => void;
  onToggleAce?: () => void;
}

export const SimpleDriverRow = React.memo(function SimpleDriverRow({
  driver,
  isAce,
  locked,
  onRemove,
  onToggleAce,
}: Props) {
  const teamColor = TEAM_COLORS[driver.constructorId]?.primary ?? S_COLORS.primary;
  const contractRemaining = (driver.contractLength ?? 3) - (driver.racesHeld ?? 0);
  const price = driver.currentPrice ?? driver.purchasePrice;
  const aceEligible = price <= PRICING_CONFIG.ACE_MAX_PRICE;

  return (
    <View style={[styles.container, { borderLeftColor: teamColor }]}>
      {aceEligible ? (
        <TouchableOpacity
          style={[styles.aceTap, isAce && styles.aceActive]}
          onPress={onToggleAce}
          disabled={locked}
          activeOpacity={0.6}
        >
          <Ionicons
            name={isAce ? 'star' : 'star-outline'}
            size={14}
            color={isAce ? S_COLORS.ace : S_COLORS.text.muted}
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.aceTap} />
      )}

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{driver.name}</Text>
          {driver.isReservePick && (
            <View style={styles.autoFillBadge}>
              <Text style={styles.autoFillText}>AUTO</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta}>
          {driver.shortName} · {contractRemaining} race{contractRemaining !== 1 ? 's' : ''} left
        </Text>
      </View>

      <View style={styles.stats}>
        <Text style={styles.points}>{driver.pointsScored ?? 0} pts</Text>
        <Text style={styles.price}>${driver.currentPrice ?? driver.purchasePrice}</Text>
      </View>

      {!locked && onRemove && (
        <TouchableOpacity style={styles.removeBtn} onPress={onRemove} activeOpacity={0.6}>
          <Ionicons name="remove-circle" size={22} color={S_COLORS.negative} />
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: S_COLORS.card,
    borderRadius: S_RADIUS.md,
    borderLeftWidth: 4,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: S_COLORS.borderLight,
    borderRightColor: S_COLORS.borderLight,
    borderBottomColor: S_COLORS.borderLight,
    padding: S_SPACING.md,
    marginBottom: S_SPACING.sm,
  },
  aceTap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: S_SPACING.sm,
  },
  aceActive: {
    backgroundColor: S_COLORS.aceBg,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S_SPACING.xs,
  },
  name: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.primary,
  },
  autoFillBadge: {
    backgroundColor: S_COLORS.warning + '20',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: S_RADIUS.sm,
  },
  autoFillText: {
    fontSize: 9,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.warning,
    letterSpacing: 0.5,
  },
  meta: {
    fontSize: S_FONTS.sizes.sm,
    color: S_COLORS.text.muted,
    marginTop: 2,
  },
  stats: {
    alignItems: 'flex-end',
    marginRight: S_SPACING.sm,
  },
  points: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.primary,
  },
  price: {
    fontSize: S_FONTS.sizes.sm,
    color: S_COLORS.text.secondary,
    marginTop: 2,
  },
  removeBtn: {
    padding: S_SPACING.xs,
  },
});
