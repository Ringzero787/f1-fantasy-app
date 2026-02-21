import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../config/constants';
import { useScale } from '../../hooks/useScale';
import { formatPoints } from '../../utils/formatters';
import type { FantasyDriver } from '../../types';

export type EnrichedDriver = FantasyDriver & {
  livePrice: number;
  driverNumber?: number;
  resolvedConstructorId: string;
  cInfo: { shortName: string; primaryColor: string } | undefined;
  isAce: boolean;
  canBeAce: boolean;
  priceDiff: number;
  nextRate: number;
  contractLen: number;
  contractRemaining: number;
  isLastRace: boolean;
  isReserve: boolean | undefined;
  inGracePeriod: boolean;
  earlyTermFee: number;
  effectiveSaleValue: number;
  saleProfit: number;
  accentColor: string;
};

interface LastRaceBreakdownEntry {
  base: number;
  aceBonus: number;
}

interface DriverTeamCardProps {
  driver: EnrichedDriver;
  lastRaceEntry?: LastRaceBreakdownEntry | null;
  canModify: boolean;
  canChangeAce: boolean;
  onSetAce: (driverId: string) => void;
  onClearAce: () => void;
  onRemoveDriver: (driverId: string, name: string) => void;
}

export const DriverTeamCard = React.memo(function DriverTeamCard({
  driver,
  lastRaceEntry,
  canModify,
  canChangeAce,
  onSetAce,
  onClearAce,
  onRemoveDriver,
}: DriverTeamCardProps) {
  const { scaledFonts } = useScale();

  return (
    <View style={[styles.card, driver.isReserve && styles.cardReserve]}>
      <View style={[styles.cardAccent, { backgroundColor: driver.accentColor }]} />
      <View style={styles.cardBody}>
        {/* Row 1: Identity + Price */}
        <View style={styles.cardTopRow}>
          <View style={styles.cardIdentity}>
            {driver.driverNumber != null && (
              <View style={[styles.cardNumberBadge, { backgroundColor: driver.accentColor }]}>
                <Text style={styles.cardNumberText}>
                  {driver.driverNumber}
                </Text>
              </View>
            )}
            <Text style={[styles.cardName, { fontSize: scaledFonts.lg }, driver.isReserve && { color: COLORS.text.muted }]} numberOfLines={1}>
              {driver.name}
            </Text>
            {driver.isAce && (
              <TouchableOpacity testID="ace-active-badge" onPress={onClearAce} hitSlop={8}>
                <View style={styles.aceActive}>
                  <Ionicons name="diamond" size={12} color={COLORS.white} />
                </View>
              </TouchableOpacity>
            )}
            {!driver.isAce && !driver.isReserve && driver.canBeAce && canChangeAce && (
              <TouchableOpacity testID="set-ace-btn" onPress={() => onSetAce(driver.driverId)} hitSlop={8}>
                <Ionicons name="diamond-outline" size={15} color={COLORS.gold} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
          </View>
          {!driver.isReserve ? (
            <View style={styles.cardPriceBlock}>
              <Text style={[styles.cardPrice, { fontSize: scaledFonts.lg }]}>${driver.livePrice}</Text>
              {driver.priceDiff !== 0 && (
                <View style={[styles.cardPriceDiff, driver.priceDiff > 0 ? styles.priceUp : styles.priceDown]}>
                  <Ionicons name={driver.priceDiff > 0 ? 'caret-up' : 'caret-down'} size={10} color={COLORS.white} />
                  <Text style={styles.cardPriceDiffText}>${Math.abs(driver.priceDiff)}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.reserveTag}>
              <Text style={styles.reserveTagText}>AUTO-FILL</Text>
            </View>
          )}
        </View>
        {/* Row 2: Meta badges */}
        <View style={styles.cardMetaRow}>
          {driver.cInfo && (
            <View style={[styles.metaChip, { backgroundColor: driver.accentColor + '18' }]}>
              <Text style={[styles.metaChipText, { color: driver.accentColor }]}>{driver.cInfo.shortName}</Text>
            </View>
          )}
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>{formatPoints(driver.pointsScored)} pts</Text>
          </View>
          {lastRaceEntry != null && (
            <View style={[styles.metaChip, { backgroundColor: lastRaceEntry.base > 0 ? '#16a34a18' : undefined }]}>
              <Text style={[styles.metaChipText, lastRaceEntry.base > 0 && { color: '#16a34a' }]}>
                +{lastRaceEntry.base}
                {lastRaceEntry.aceBonus > 0 ? ` (+${lastRaceEntry.aceBonus})` : ''}
                {' last'}
              </Text>
            </View>
          )}
          {!driver.isReserve ? (
            <>
              <View style={[styles.metaChip, driver.isLastRace && { backgroundColor: COLORS.warning + '18' }]}>
                <Ionicons name="document-text-outline" size={10} color={driver.isLastRace ? COLORS.warning : COLORS.text.muted} />
                <Text style={[styles.metaChipText, driver.isLastRace && { color: COLORS.warning, fontWeight: '700' }]}>
                  {driver.isLastRace ? 'LAST' : `${driver.racesHeld || 0}/${driver.contractLen}`}
                </Text>
              </View>
              <View style={styles.metaChip}>
                <Ionicons name="flame" size={10} color={driver.nextRate > 1 ? COLORS.gold : COLORS.text.muted} />
                <Text style={[styles.metaChipText, driver.nextRate > 1 && { color: COLORS.gold }]}>+{driver.nextRate}/r</Text>
              </View>
            </>
          ) : (
            <View style={[styles.metaChip, { backgroundColor: COLORS.warning + '18' }]}>
              <Ionicons name="timer-outline" size={10} color={COLORS.warning} />
              <Text style={[styles.metaChipText, { color: COLORS.warning }]}>
                Expires in {driver.contractRemaining} race{driver.contractRemaining !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {canModify && !driver.isReserve && (
            <TouchableOpacity
              testID="sell-driver-btn"
              onPress={() => onRemoveDriver(driver.driverId, driver.name)}
              hitSlop={6}
              style={[styles.sellChip, driver.inGracePeriod ? styles.sellChipNeutral : driver.saleProfit >= 0 ? styles.sellChipProfit : styles.sellChipLoss]}
            >
              <Text style={[styles.sellChipText, driver.inGracePeriod ? styles.sellChipTextNeutral : driver.saleProfit >= 0 ? styles.sellChipTextProfit : styles.sellChipTextLoss]}>
                {driver.inGracePeriod ? `Sell $${driver.livePrice}` : `Sell ${driver.saleProfit >= 0 ? '+' : '-'}$${Math.abs(driver.saleProfit)}`}
              </Text>
            </TouchableOpacity>
          )}
          {canModify && driver.isReserve && (
            <TouchableOpacity
              onPress={() => onRemoveDriver(driver.driverId, driver.name)}
              hitSlop={6}
              style={styles.swapChip}
            >
              <Text style={styles.swapChipText}>Swap</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    overflow: 'hidden',
  },
  cardReserve: {
    opacity: 0.7,
    borderStyle: 'dashed',
  },
  cardAccent: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: SPACING.md,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  cardIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flex: 1,
  },
  cardNumberBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    minWidth: 26,
    alignItems: 'center',
  },
  cardNumberText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.white,
  },
  cardName: {
    fontWeight: '700',
    color: COLORS.text.primary,
    flexShrink: 1,
  },
  aceActive: {
    backgroundColor: COLORS.gold,
    borderRadius: BORDER_RADIUS.full,
    padding: 3,
  },
  cardPriceBlock: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 4,
  },
  cardPrice: {
    fontWeight: '800',
    color: COLORS.text.primary,
  },
  cardPriceDiff: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    gap: 1,
  },
  priceUp: {
    backgroundColor: '#16a34a',
  },
  priceDown: {
    backgroundColor: COLORS.error,
  },
  cardPriceDiffText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
  },
  reserveTag: {
    backgroundColor: COLORS.text.muted + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  reserveTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.text.muted,
    letterSpacing: 0.5,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metaChipText: {
    fontSize: 11,
    color: COLORS.text.muted,
    fontWeight: '500',
  },
  sellChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  sellChipProfit: {
    backgroundColor: '#16a34a12',
    borderColor: '#16a34a25',
  },
  sellChipLoss: {
    backgroundColor: COLORS.error + '12',
    borderColor: COLORS.error + '25',
  },
  sellChipNeutral: {
    backgroundColor: COLORS.text.muted + '12',
    borderColor: COLORS.text.muted + '25',
  },
  sellChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sellChipTextProfit: {
    color: '#16a34a',
  },
  sellChipTextLoss: {
    color: COLORS.error,
  },
  sellChipTextNeutral: {
    color: COLORS.text.muted,
  },
  swapChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: COLORS.primary + '12',
    borderColor: COLORS.primary + '25',
  },
  swapChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
