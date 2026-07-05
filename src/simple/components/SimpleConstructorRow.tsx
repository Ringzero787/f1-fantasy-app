import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONT_FAMILY, teamAccent } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { PRICING_CONFIG } from '../../config/pricing.config';
import { ConstructorTile } from './RaceDayBits';
import type { FantasyConstructor } from '../../types';

interface Props {
  constructor: FantasyConstructor;
  isAce: boolean;
  locked: boolean;
  aceLocked?: boolean;
  lastRacePoints?: number | null;
  onRemove?: () => void;
  onToggleAce?: () => void;
}

export const SimpleConstructorRow = React.memo(function SimpleConstructorRow({
  constructor: ctor,
  isAce,
  locked,
  aceLocked = locked,
  lastRacePoints,
  onRemove,
  onToggleAce,
}: Props) {
  const { colors, scaled, display } = useSimpleTheme();
  const accent = teamAccent(ctor.constructorId);
  const contractRemaining = (ctor.contractLength ?? 3) - (ctor.racesHeld ?? 0);
  const price = ctor.currentPrice ?? ctor.purchasePrice;
  const aceEligible = price <= PRICING_CONFIG.ACE_MAX_PRICE;
  const priceChange = (ctor.currentPrice && ctor.purchasePrice) ? ctor.currentPrice - ctor.purchasePrice : 0;

  const hasScoring = lastRacePoints != null || (ctor.pointsScored ?? 0) !== 0;
  const big = lastRacePoints ?? 0;
  const bigColor = big > 0 ? colors.positive : big < 0 ? colors.negative : colors.text.muted;

  const styles = useMemo(() => ({
    container: {
      backgroundColor: colors.card,
      borderRadius: S_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: scaled(16),
      paddingRight: scaled(16),
      paddingLeft: scaled(20),
      gap: scaled(14),
      overflow: 'hidden' as const,
    },
    stripe: {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      bottom: 0,
      width: 5,
      backgroundColor: accent,
    },
    aceTap: {
      width: scaled(34),
      height: scaled(34),
      borderRadius: scaled(17),
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginLeft: -6,
    },
    aceActive: {
      backgroundColor: colors.aceBg,
    },
    info: {
      flex: 1,
      minWidth: 0,
    },
    nameRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
    },
    name: {
      fontSize: scaled(16.5),
      fontFamily: S_FONT_FAMILY.body.semibold,
      letterSpacing: -0.2,
      color: colors.text.primary,
      flexShrink: 1,
    },
    autoFillBadge: {
      backgroundColor: colors.warning + '20',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: S_RADIUS.sm,
    },
    autoFillText: {
      fontSize: scaled(9),
      fontFamily: S_FONT_FAMILY.body.bold,
      color: colors.warning,
      letterSpacing: 0.5,
    },
    meta: {
      fontSize: scaled(13),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
      marginTop: 3,
    },
    numbersRow: {
      flexDirection: 'row' as const,
      alignItems: 'baseline' as const,
      gap: scaled(14),
      marginTop: scaled(8),
    },
    bigDelta: {
      ...display,
      fontSize: scaled(22),
      lineHeight: scaled(23),
      letterSpacing: -0.4,
    },
    totalText: {
      fontSize: scaled(13),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
    },
    priceText: {
      fontSize: scaled(14),
      fontFamily: S_FONT_FAMILY.body.semibold,
      color: colors.text.secondary,
    },
    removeBtn: {
      width: scaled(32),
      height: scaled(32),
      borderRadius: scaled(16),
      backgroundColor: colors.negative,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
  }), [colors, scaled, display, accent]);

  return (
    <View style={styles.container}>
      <View style={styles.stripe} />

      <ConstructorTile constructorId={ctor.constructorId} />

      {!locked && aceEligible && (
        <TouchableOpacity
          style={[styles.aceTap, isAce && styles.aceActive]}
          onPress={onToggleAce}
          disabled={aceLocked}
          activeOpacity={0.6}
          accessibilityLabel="Set ace"
        >
          <Ionicons
            name={isAce ? 'star' : 'star-outline'}
            size={17}
            color={isAce ? colors.ace : colors.text.muted}
          />
        </TouchableOpacity>
      )}

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{ctor.name}</Text>
          {ctor.isReservePick && (
            <View style={styles.autoFillBadge}>
              <Text style={styles.autoFillText}>AUTO</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta}>
          Constructor · {contractRemaining <= 0 ? 'Final race' : `${contractRemaining} race${contractRemaining !== 1 ? 's' : ''} left`}
        </Text>

        <View style={styles.numbersRow}>
          <Text style={[styles.bigDelta, { color: bigColor }]}>
            {big > 0 ? '+' : ''}{big}
          </Text>
          <Text style={styles.totalText}>
            {hasScoring ? `${ctor.pointsScored ?? 0} total` : 'no races yet'}
          </Text>
          <Text style={styles.priceText}>
            ${price}
            {priceChange !== 0 && (
              <Text style={{ color: priceChange > 0 ? colors.positive : colors.negative }}>
                {' '}{priceChange > 0 ? '▴' : '▾'}{Math.abs(priceChange)}
              </Text>
            )}
          </Text>
        </View>
      </View>

      {!locked && onRemove && (
        <TouchableOpacity style={styles.removeBtn} onPress={onRemove} activeOpacity={0.6} accessibilityLabel="Remove">
          <Ionicons name="remove" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
});
