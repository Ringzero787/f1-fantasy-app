import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONTS } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { TEAM_COLORS } from '../../config/constants';
import { PRICING_CONFIG } from '../../config/pricing.config';
import type { FantasyConstructor } from '../../types';

interface Props {
  constructor: FantasyConstructor;
  isAce: boolean;
  locked: boolean;
  aceLocked?: boolean;
  onRemove?: () => void;
  onToggleAce?: () => void;
}

export const SimpleConstructorRow = React.memo(function SimpleConstructorRow({
  constructor: ctor,
  isAce,
  locked,
  aceLocked = locked,
  onRemove,
  onToggleAce,
}: Props) {
  const { colors, fonts, spacing } = useSimpleTheme();
  const teamColor = TEAM_COLORS[ctor.constructorId]?.primary ?? colors.primary;
  const contractRemaining = (ctor.contractLength ?? 3) - (ctor.racesHeld ?? 0);
  const price = ctor.currentPrice ?? ctor.purchasePrice;
  const aceEligible = price <= PRICING_CONFIG.ACE_MAX_PRICE;

  const styles = useMemo(() => ({
    container: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.card,
      borderRadius: S_RADIUS.md,
      borderLeftWidth: 4,
      borderTopWidth: 1,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderTopColor: colors.borderLight,
      borderRightColor: colors.borderLight,
      borderBottomColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    aceTap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: spacing.sm,
    },
    aceActive: {
      backgroundColor: colors.aceBg,
    },
    info: {
      flex: 1,
    },
    nameRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
    },
    name: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.primary,
    },
    autoFillBadge: {
      backgroundColor: colors.warning + '20',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: S_RADIUS.sm,
    },
    autoFillText: {
      fontSize: 9,
      fontWeight: S_FONTS.weights.bold,
      color: colors.warning,
      letterSpacing: 0.5,
    },
    meta: {
      fontSize: fonts.sm,
      color: colors.text.muted,
      marginTop: 2,
    },
    stats: {
      alignItems: 'flex-end' as const,
      marginRight: spacing.sm,
    },
    points: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.primary,
    },
    price: {
      fontSize: fonts.sm,
      color: colors.text.secondary,
      marginTop: 2,
    },
    removeBtn: {
      padding: spacing.xs,
    },
  }), [colors, fonts, spacing]);

  return (
    <View style={[styles.container, { borderLeftColor: teamColor }]}>
      {aceEligible ? (
        <TouchableOpacity
          style={[styles.aceTap, isAce && styles.aceActive]}
          onPress={onToggleAce}
          disabled={aceLocked}
          activeOpacity={0.6}
        >
          <Ionicons
            name={isAce ? 'star' : 'star-outline'}
            size={14}
            color={isAce ? colors.ace : colors.text.muted}
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.aceTap} />
      )}

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{ctor.name}</Text>
          {ctor.isReservePick && (
            <View style={styles.autoFillBadge}>
              <Text style={styles.autoFillText}>AUTO</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta}>
          Constructor · {contractRemaining} race{contractRemaining !== 1 ? 's' : ''} left
        </Text>
      </View>

      <View style={styles.stats}>
        <Text style={styles.points}>{ctor.pointsScored ?? 0} pts</Text>
        <Text style={styles.price}>${ctor.currentPrice ?? ctor.purchasePrice}</Text>
      </View>

      {!locked && onRemove && (
        <TouchableOpacity style={styles.removeBtn} onPress={onRemove} activeOpacity={0.6}>
          <Ionicons name="remove-circle" size={22} color={colors.negative} />
        </TouchableOpacity>
      )}
    </View>
  );
});
