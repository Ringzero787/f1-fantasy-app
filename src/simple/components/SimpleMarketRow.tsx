import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONT_FAMILY, teamAccent } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
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
  const { colors, fonts, spacing, scaled, display } = useSimpleTheme();

  const constructorId =
    type === 'driver' ? (item as Driver).constructorId : item.id;
  const teamColor = teamAccent(constructorId);

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
      backgroundColor: onTeam ? colors.primaryFaint + '55' : 'transparent',
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      paddingVertical: scaled(14),
      paddingRight: spacing.lg,
      paddingLeft: scaled(20),
      gap: 12,
    },
    stripe: {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      bottom: 0,
      width: 5,
      backgroundColor: teamColor,
    },
    dimmed: {
      opacity: 0.62,
    },
    info: {
      flex: 1,
      minWidth: 0,
    },
    nameRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    name: {
      fontSize: scaled(15.5),
      fontFamily: S_FONT_FAMILY.body.semibold,
      letterSpacing: -0.2,
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
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.primary,
    },
    sub: {
      fontSize: scaled(12.5),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
      marginTop: 2,
    },
    pointsWrap: {
      alignItems: 'center' as const,
      minWidth: 38,
    },
    pointsValue: {
      ...display,
      fontSize: scaled(16),
      lineHeight: scaled(17),
    },
    pointsLabel: {
      fontSize: scaled(11),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
      marginTop: 2,
    },
    priceWrap: {
      alignItems: 'flex-end' as const,
      minWidth: 56,
    },
    price: {
      ...display,
      fontSize: scaled(17),
      letterSpacing: -0.3,
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
      fontFamily: S_FONT_FAMILY.body.medium,
    },
    addBtn: {
      width: scaled(36),
      height: scaled(36),
      borderRadius: scaled(18),
      borderWidth: 1.5,
      borderColor: colors.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    addBtnDisabled: {
      borderColor: colors.border,
    },
    ownedBtn: {
      backgroundColor: colors.positive,
      borderColor: colors.positive,
    },
  }), [colors, fonts, spacing, scaled, display, teamColor, onTeam]);

  return (
    <View style={[styles.container, dimmed && styles.dimmed]}>
      <View style={styles.stripe} />

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
        <Text
          style={[
            styles.pointsValue,
            { color: seasonPts > 0 ? colors.positive : seasonPts < 0 ? colors.negative : colors.text.muted },
          ]}
        >
          {seasonPts}
        </Text>
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
