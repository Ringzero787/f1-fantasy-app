import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONTS } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
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
  const { colors, fonts, spacing } = useSimpleTheme();

  const constructorId =
    type === 'driver' ? (item as Driver).constructorId : item.id;
  const teamColor = TEAM_COLORS[constructorId]?.primary ?? colors.primary;

  const priceChange = item.price - item.previousPrice;
  const priceUp = priceChange > 0;
  const priceDown = priceChange < 0;

  const seasonPts = item.currentSeasonPoints ?? 0;
  const subLabel =
    type === 'driver'
      ? (item as Driver).constructorName
      : `${(item as Constructor).drivers?.length ?? 0} drivers`;

  const addDisabled = disabled || onTeam || !canAfford;

  const styles = useMemo(() => ({
    container: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.background,
      borderLeftWidth: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
    },
    dimmed: {
      opacity: 0.4,
    },
    info: {
      flex: 1,
      marginRight: spacing.sm,
    },
    nameRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    name: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.primary,
      flexShrink: 1,
    },
    onTeamBadge: {
      backgroundColor: colors.primaryFaint,
      borderRadius: S_RADIUS.sm,
      paddingHorizontal: spacing.xs + 2,
      paddingVertical: 1,
    },
    onTeamText: {
      fontSize: fonts.xs,
      fontWeight: S_FONTS.weights.medium,
      color: colors.primary,
    },
    sub: {
      fontSize: fonts.sm,
      color: colors.text.muted,
      marginTop: 1,
    },
    pointsWrap: {
      alignItems: 'center' as const,
      marginRight: spacing.md,
      minWidth: 36,
    },
    pointsValue: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.bold,
      color: colors.primary,
    },
    pointsLabel: {
      fontSize: fonts.xs,
      color: colors.text.muted,
    },
    priceWrap: {
      alignItems: 'flex-end' as const,
      marginRight: spacing.md,
      minWidth: 48,
    },
    price: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.primary,
    },
    changeRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 2,
      marginTop: 1,
    },
    changeText: {
      fontSize: fonts.xs,
      fontWeight: S_FONTS.weights.medium,
    },
    addBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    addBtnDisabled: {
      borderColor: colors.border,
    },
  }), [colors, fonts, spacing]);

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
              color={priceUp ? colors.positive : colors.negative}
            />
            <Text
              style={[
                styles.changeText,
                { color: priceUp ? colors.positive : colors.negative },
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
          style={[styles.addBtn, { borderColor: colors.negative }]}
          onPress={onRemove}
          disabled={disabled}
          activeOpacity={0.6}
        >
          <Ionicons name="remove" size={18} color={colors.negative} />
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
            color={addDisabled ? colors.text.muted : colors.primary}
          />
        </TouchableOpacity>
      )}
    </View>
  );
});
