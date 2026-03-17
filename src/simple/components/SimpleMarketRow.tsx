import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_COLORS, S_FONTS, S_SPACING, S_RADIUS } from '../theme/simpleTheme';
import { TEAM_COLORS } from '../../config/constants';
import type { Driver, Constructor } from '../../types';

interface DriverRowProps {
  type: 'driver';
  item: Driver;
  onTeam: boolean;
  canAfford: boolean;
  disabled: boolean;
  dimmed: boolean;
  onAdd: () => void;
  onRemove?: () => void;
}

interface ConstructorRowProps {
  type: 'constructor';
  item: Constructor;
  onTeam: boolean;
  canAfford: boolean;
  disabled: boolean;
  dimmed: boolean;
  onAdd: () => void;
  onRemove?: () => void;
}

type Props = DriverRowProps | ConstructorRowProps;

export const SimpleMarketRow = React.memo(function SimpleMarketRow(props: Props) {
  const { type, item, onTeam, canAfford, disabled, dimmed, onAdd, onRemove } = props;

  const constructorId =
    type === 'driver' ? (item as Driver).constructorId : item.id;
  const teamColor = TEAM_COLORS[constructorId]?.primary ?? S_COLORS.primary;

  const priceChange = item.price - item.previousPrice;
  const priceUp = priceChange > 0;
  const priceDown = priceChange < 0;

  const seasonPts = item.currentSeasonPoints ?? 0;
  const subLabel =
    type === 'driver'
      ? (item as Driver).constructorName
      : `${(item as Constructor).drivers?.length ?? 0} drivers`;

  const addDisabled = disabled || onTeam || !canAfford;

  return (
    <View
      style={[
        styles.container,
        { borderLeftColor: teamColor },
        dimmed && styles.dimmed,
      ]}
    >
      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          {onTeam && (
            <View style={styles.onTeamBadge}>
              <Text style={styles.onTeamText}>On Team</Text>
            </View>
          )}
        </View>
        <Text style={styles.sub} numberOfLines={1}>
          {item.shortName} · {subLabel}
        </Text>
      </View>

      {/* Points badge */}
      <View style={styles.pointsWrap}>
        <Text style={styles.pointsValue}>{seasonPts}</Text>
        <Text style={styles.pointsLabel}>pts</Text>
      </View>

      {/* Price */}
      <View style={styles.priceWrap}>
        <Text style={styles.price}>${item.price}</Text>
        {priceChange !== 0 && (
          <View style={styles.changeRow}>
            <Ionicons
              name={priceUp ? 'caret-up' : 'caret-down'}
              size={10}
              color={priceUp ? S_COLORS.positive : S_COLORS.negative}
            />
            <Text
              style={[
                styles.changeText,
                { color: priceUp ? S_COLORS.positive : S_COLORS.negative },
              ]}
            >
              ${Math.abs(priceChange)}
            </Text>
          </View>
        )}
      </View>

      {/* Add/Remove button */}
      {onTeam && onRemove ? (
        <TouchableOpacity
          style={[styles.addBtn, { borderColor: S_COLORS.negative }]}
          onPress={onRemove}
          disabled={disabled}
          activeOpacity={0.6}
        >
          <Ionicons name="remove" size={18} color={S_COLORS.negative} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.addBtn, addDisabled && styles.addBtnDisabled]}
          onPress={onAdd}
          disabled={addDisabled}
          activeOpacity={0.6}
        >
          <Ionicons
            name="add"
            size={18}
            color={addDisabled ? S_COLORS.text.muted : S_COLORS.primary}
          />
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: S_COLORS.background,
    borderLeftWidth: 4,
    borderBottomWidth: 1,
    borderBottomColor: S_COLORS.borderLight,
    paddingVertical: S_SPACING.md,
    paddingHorizontal: S_SPACING.md,
  },
  dimmed: {
    opacity: 0.4,
  },
  info: {
    flex: 1,
    marginRight: S_SPACING.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S_SPACING.sm,
  },
  name: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.primary,
    flexShrink: 1,
  },
  onTeamBadge: {
    backgroundColor: S_COLORS.primaryFaint,
    borderRadius: S_RADIUS.sm,
    paddingHorizontal: S_SPACING.xs + 2,
    paddingVertical: 1,
  },
  onTeamText: {
    fontSize: S_FONTS.sizes.xs,
    fontWeight: S_FONTS.weights.medium,
    color: S_COLORS.primary,
  },
  sub: {
    fontSize: S_FONTS.sizes.sm,
    color: S_COLORS.text.muted,
    marginTop: 1,
  },
  pointsWrap: {
    alignItems: 'center',
    marginRight: S_SPACING.md,
    minWidth: 36,
  },
  pointsValue: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.primary,
  },
  pointsLabel: {
    fontSize: S_FONTS.sizes.xs,
    color: S_COLORS.text.muted,
  },
  priceWrap: {
    alignItems: 'flex-end',
    marginRight: S_SPACING.md,
    minWidth: 48,
  },
  price: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.primary,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
  },
  changeText: {
    fontSize: S_FONTS.sizes.xs,
    fontWeight: S_FONTS.weights.medium,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: S_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    borderColor: S_COLORS.border,
  },
});
