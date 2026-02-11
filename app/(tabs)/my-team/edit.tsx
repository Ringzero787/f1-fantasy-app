import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTeamStore, calculateEarlyTerminationFee } from '../../../src/store/team.store';
import { useDrivers } from '../../../src/hooks/useDrivers';
import { Card, Loading, BudgetBar, Button } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, BUDGET, TEAM_SIZE } from '../../../src/config/constants';
import { PRICING_CONFIG } from '../../../src/config/pricing.config';
import { formatPoints, calculateSaleValue, formatProfitLoss } from '../../../src/utils/formatters';
import type { Driver } from '../../../src/types';

export default function EditTeamScreen() {
  const {
    currentTeam,
    isLoading,
    removeDriver,
    setCaptain,
    deleteTeam,
  } = useTeamStore();

  const [removingDriverId, setRemovingDriverId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get all drivers for swap recommendations
  const { data: allDrivers = [] } = useDrivers();

  // Calculate value (points per price unit) and find better swap options
  const getSwapRecommendation = useMemo(() => {
    if (!currentTeam || allDrivers.length === 0) return () => null;

    const teamDriverIds = currentTeam.drivers.map(d => d.driverId);

    return (driverId: string, driverPrice: number): { driver: Driver; valueDiff: number; isStretch?: boolean; extraCost?: number } | null => {
      const currentDriver = allDrivers.find(d => d.id === driverId);
      if (!currentDriver) return null;

      const currentValue = currentDriver.fantasyPoints / currentDriver.price;
      const maxAffordable = driverPrice + currentTeam.budget;

      // Find drivers not on team, within budget, with better value
      const betterOptions = allDrivers
        .filter(d =>
          !teamDriverIds.includes(d.id) &&
          d.price <= maxAffordable &&
          d.isActive
        )
        .map(d => ({
          driver: d,
          value: d.fantasyPoints / d.price,
          valueDiff: (d.fantasyPoints / d.price) - currentValue,
          // Calculate percentage improvement
          percentImprovement: currentValue > 0 ? ((d.fantasyPoints / d.price) - currentValue) / currentValue * 100 : 0,
        }))
        .filter(d => d.valueDiff > 0.01) // At least 1% better value (lowered from 5%)
        .sort((a, b) => b.valueDiff - a.valueDiff);

      // If no affordable better options, look for slightly more expensive but significantly better value
      if (betterOptions.length === 0) {
        const stretchOptions = allDrivers
          .filter(d =>
            !teamDriverIds.includes(d.id) &&
            d.price > maxAffordable &&
            d.price <= maxAffordable + 100 && // Up to 100 more than affordable
            d.isActive
          )
          .map(d => ({
            driver: d,
            value: d.fantasyPoints / d.price,
            valueDiff: (d.fantasyPoints / d.price) - currentValue,
            percentImprovement: currentValue > 0 ? ((d.fantasyPoints / d.price) - currentValue) / currentValue * 100 : 0,
            extraCost: d.price - maxAffordable,
          }))
          .filter(d => d.percentImprovement >= 5) // Need at least 5% better for stretch recommendation
          .sort((a, b) => b.percentImprovement - a.percentImprovement);

        if (stretchOptions.length > 0) {
          return {
            driver: stretchOptions[0].driver,
            valueDiff: stretchOptions[0].valueDiff,
            isStretch: true,
            extraCost: stretchOptions[0].extraCost,
          };
        }
        return null;
      }

      return {
        driver: betterOptions[0].driver,
        valueDiff: betterOptions[0].valueDiff,
        isStretch: false,
      };
    };
  }, [currentTeam, allDrivers]);

  const handleRemoveDriver = async (driverId: string, driverName: string) => {
    // V6: Show early termination fee in confirmation
    const driver = currentTeam?.drivers.find(d => d.driverId === driverId);
    const contractLen = driver?.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
    const fee = driver ? calculateEarlyTerminationFee(driver.purchasePrice, contractLen, driver.racesHeld || 0) : 0;
    const saleProceeds = driver ? Math.max(0, driver.currentPrice - fee) : 0;
    const feeMessage = fee > 0
      ? `\n\nEarly termination fee: $${fee}\nYou'll receive: $${saleProceeds}`
      : '';

    Alert.alert(
      'Remove Driver',
      `Are you sure you want to remove ${driverName} from your team?${feeMessage}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingDriverId(driverId);
            try {
              await removeDriver(driverId);
            } catch (error) {
              Alert.alert('Error', 'Failed to remove driver');
            } finally {
              setRemovingDriverId(null);
            }
          },
        },
      ]
    );
  };

  // V3: Set captain driver (any driver can be captain, gets 2x points)
  const handleSetCaptain = async (driverId: string) => {
    try {
      await setCaptain(driverId);
    } catch (error) {
      Alert.alert('Error', 'Failed to set captain');
    }
  };

  const handleDeleteTeam = () => {
    Alert.alert(
      'Delete Team',
      `Are you sure you want to delete "${currentTeam?.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteTeam();
              router.replace('/my-team');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete team');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (isLoading || !currentTeam) {
    return <Loading fullScreen message="Loading team..." />;
  }

  const driversCount = currentTeam.drivers.length;
  const hasConstructor = !!currentTeam.constructor;

  return (
    <View style={styles.wrapper}>
      {/* Background Banner Image */}
      <Image
        source={require('../../../assets/header-banner.png')}
        style={styles.backgroundBanner}
        resizeMode="cover"
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Budget */}
        <BudgetBar remaining={currentTeam.budget} />

      {/* Team Status */}
      {currentTeam.isLocked && (
        <View style={styles.lockWarning}>
          <Ionicons name="lock-closed" size={20} color={COLORS.error} />
          <Text style={styles.lockWarningText}>
            Team is locked - {currentTeam.lockStatus.lockReason}
          </Text>
        </View>
      )}

      {/* Drivers Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Drivers ({driversCount}/{TEAM_SIZE})
          </Text>
          {driversCount < TEAM_SIZE && currentTeam.lockStatus.canModify && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/my-team/select-driver')}
            >
              <Ionicons name="add" size={20} color={COLORS.primary} />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {currentTeam.drivers.map((driver) => {
          const recommendation = getSwapRecommendation(driver.driverId, driver.currentPrice);
          const profitLoss = formatProfitLoss(driver.purchasePrice, driver.currentPrice);
          // V6: Calculate early termination fee
          const contractLen = driver.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
          const earlyTermFee = calculateEarlyTerminationFee(driver.purchasePrice, contractLen, driver.racesHeld || 0);
          const saleValue = Math.max(0, driver.currentPrice - earlyTermFee);
          const isCaptain = currentTeam.captainDriverId === driver.driverId;

          return (
            <Card key={driver.driverId} variant="outlined" style={styles.driverCard}>
              <View style={styles.driverHeader}>
                <View>
                  <Text style={styles.driverName}>{driver.name}</Text>
                  <Text style={styles.driverTeam}>{driver.shortName}</Text>
                </View>
                <View style={styles.priceColumn}>
                  <Text style={styles.driverPrice}>
                    {formatPoints(driver.currentPrice)}
                  </Text>
                  <Text style={styles.purchasePrice}>
                    Bought: {formatPoints(driver.purchasePrice)}
                  </Text>
                </View>
              </View>

              {/* Trading Info */}
              <View style={styles.tradingInfo}>
                <View style={styles.tradingItem}>
                  <Text style={styles.tradingLabel}>Sale Value</Text>
                  <Text style={styles.tradingValue}>{formatPoints(saleValue)}</Text>
                  {earlyTermFee > 0 ? (
                    <Text style={[styles.tradingHint, { color: COLORS.error }]}>(-${earlyTermFee} early exit fee)</Text>
                  ) : (
                    <Text style={styles.tradingHint}>No early exit fee</Text>
                  )}
                </View>
                <View style={styles.tradingItem}>
                  <Text style={styles.tradingLabel}>Profit/Loss</Text>
                  <Text style={[
                    styles.tradingValue,
                    profitLoss.isProfit && styles.profitText,
                    profitLoss.isLoss && styles.lossText,
                  ]}>
                    {profitLoss.text}
                  </Text>
                </View>
              </View>

              <View style={styles.driverActions}>
                {/* V3: Captain button - any driver can be captain */}
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    isCaptain && styles.captainActive,
                  ]}
                  onPress={() => handleSetCaptain(driver.driverId)}
                  disabled={!currentTeam.lockStatus.canModify || isLoading}
                >
                  <Ionicons
                    name={isCaptain ? 'diamond' : 'diamond-outline'}
                    size={16}
                    color={isCaptain ? COLORS.white : COLORS.gold}
                  />
                  <Text style={[
                    styles.actionButtonText,
                    isCaptain ? styles.captainActiveText : styles.aceText,
                  ]}>
                    {isCaptain ? 'Ace (2x)' : 'Set Ace (2x)'}
                  </Text>
                </TouchableOpacity>

                {/* Swap button */}
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push(`/my-team/select-driver?swapDriverId=${driver.driverId}&swapDriverPrice=${driver.currentPrice}`)}
                  disabled={!currentTeam.lockStatus.canModify}
                >
                  <Ionicons name="swap-horizontal" size={16} color={COLORS.primary} />
                  <Text style={styles.actionButtonText}>Swap</Text>
                </TouchableOpacity>

                {/* Remove button */}
                <TouchableOpacity
                  style={[styles.actionButton, styles.removeButton]}
                  onPress={() => handleRemoveDriver(driver.driverId, driver.name)}
                  disabled={!currentTeam.lockStatus.canModify || removingDriverId === driver.driverId}
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                  <Text style={[styles.actionButtonText, styles.removeText]}>
                    Remove
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Swap Recommendation */}
              {recommendation && currentTeam.lockStatus.canModify && (
                <View style={[
                  styles.recommendationContainer,
                  recommendation.isStretch && styles.stretchRecommendation
                ]}>
                  <Ionicons
                    name={recommendation.isStretch ? "trending-up" : "bulb"}
                    size={14}
                    color={recommendation.isStretch ? COLORS.warning : COLORS.success}
                  />
                  <Text style={styles.recommendationText}>
                    {recommendation.isStretch ? (
                      <>
                        Upgrade: <Text style={styles.stretchDriver}>{recommendation.driver.name}</Text>
                        {' '}({formatPoints(recommendation.driver.price)}) needs {recommendation.extraCost} more pts
                      </>
                    ) : (
                      <>
                        Better value: <Text style={styles.recommendationDriver}>{recommendation.driver.name}</Text>
                        {' '}({formatPoints(recommendation.driver.price)}) +{Math.round(recommendation.valueDiff * 100)}% value
                      </>
                    )}
                  </Text>
                </View>
              )}

              {driver.racesHeld > 0 && (
                <View style={styles.lockBonusContainer}>
                  <Ionicons name="lock-closed" size={12} color={COLORS.accent} />
                  <Text style={styles.lockBonusText}>
                    Lock bonus: {driver.racesHeld} race(s)
                  </Text>
                </View>
              )}
            </Card>
          );
        })}

        {driversCount === 0 && (
          <Card variant="outlined" padding="large">
            <Text style={styles.emptyText}>
              No drivers selected. Add drivers to your team.
            </Text>
          </Card>
        )}
      </View>

      {/* Constructor Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Constructor ({hasConstructor ? '1/1' : '0/1'})
          </Text>
          {currentTeam.lockStatus.canModify && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/my-team/select-constructor')}
            >
              <Ionicons name={hasConstructor ? 'swap-horizontal' : 'add'} size={20} color={COLORS.primary} />
              <Text style={styles.addButtonText}>
                {hasConstructor ? 'Change' : 'Add'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {currentTeam.constructor ? (
          <Card variant="outlined" style={styles.constructorCard}>
            {(() => {
              const constructorProfitLoss = formatProfitLoss(
                currentTeam.constructor.purchasePrice,
                currentTeam.constructor.currentPrice
              );
              // V8: Calculate early termination fee for constructor
              const cContractLen = currentTeam.constructor.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
              const cEarlyTermFee = calculateEarlyTerminationFee(currentTeam.constructor.purchasePrice, cContractLen, currentTeam.constructor.racesHeld || 0);
              const constructorSaleValue = Math.max(0, currentTeam.constructor.currentPrice - cEarlyTermFee);

              return (
                <>
                  <View style={styles.constructorHeader}>
                    <View>
                      <Text style={styles.constructorName}>
                        {currentTeam.constructor.name}
                      </Text>
                      <Text style={styles.constructorPoints}>
                        {formatPoints(currentTeam.constructor.pointsScored)} pts
                      </Text>
                    </View>
                    <View style={styles.priceColumn}>
                      <Text style={styles.constructorPrice}>
                        {formatPoints(currentTeam.constructor.currentPrice)}
                      </Text>
                      <Text style={styles.purchasePrice}>
                        Bought: {formatPoints(currentTeam.constructor.purchasePrice)}
                      </Text>
                    </View>
                  </View>

                  {/* Trading Info */}
                  <View style={styles.tradingInfo}>
                    <View style={styles.tradingItem}>
                      <Text style={styles.tradingLabel}>Sale Value</Text>
                      <Text style={styles.tradingValue}>{formatPoints(constructorSaleValue)}</Text>
                      {cEarlyTermFee > 0 ? (
                        <Text style={[styles.tradingHint, { color: COLORS.error }]}>(-${cEarlyTermFee} early exit fee)</Text>
                      ) : (
                        <Text style={styles.tradingHint}>No early exit fee</Text>
                      )}
                    </View>
                    <View style={styles.tradingItem}>
                      <Text style={styles.tradingLabel}>Profit/Loss</Text>
                      <Text style={[
                        styles.tradingValue,
                        constructorProfitLoss.isProfit && styles.profitText,
                        constructorProfitLoss.isLoss && styles.lossText,
                      ]}>
                        {constructorProfitLoss.text}
                      </Text>
                    </View>
                  </View>

                  {/* V8: Contract progress */}
                  <View style={styles.tradingInfo}>
                    <View style={styles.tradingItem}>
                      <Text style={styles.tradingLabel}>Contract</Text>
                      <Text style={styles.tradingValue}>{currentTeam.constructor.racesHeld || 0}/{cContractLen} races</Text>
                      {cContractLen - (currentTeam.constructor.racesHeld || 0) === 1 ? (
                        <Text style={[styles.tradingHint, { color: COLORS.warning, fontWeight: '700' }]}>LAST RACE</Text>
                      ) : (
                        <Text style={styles.tradingHint}>{cContractLen - (currentTeam.constructor.racesHeld || 0)} remaining</Text>
                      )}
                    </View>
                  </View>
                </>
              );
            })()}

            {/* V3: No captain option for constructors */}

            {currentTeam.constructor.racesHeld > 0 && (
              <View style={styles.lockBonusContainer}>
                <Ionicons name="lock-closed" size={12} color={COLORS.accent} />
                <Text style={styles.lockBonusText}>
                  Lock bonus: {currentTeam.constructor.racesHeld} race(s)
                </Text>
              </View>
            )}
          </Card>
        ) : (
          <Card variant="outlined" padding="large">
            <Text style={styles.emptyText}>
              No constructor selected. Add a constructor to your team.
            </Text>
          </Card>
        )}
      </View>

      {/* Done Button */}
      <Button
        title="Done"
        onPress={() => router.back()}
        fullWidth
        style={styles.doneButton}
      />

      {/* Delete Team Button */}
      <TouchableOpacity
        style={styles.deleteTeamButton}
        onPress={handleDeleteTeam}
        disabled={isDeleting}
      >
        <Ionicons name="trash-outline" size={18} color={COLORS.error} />
        <Text style={styles.deleteTeamText}>
          {isDeleting ? 'Deleting...' : 'Delete Team'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  backgroundBanner: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '80%',
    height: 150,
    opacity: 0.45,
    zIndex: 0,
  },

  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },

  lockWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.error + '15',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },

  lockWarningText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: COLORS.error,
  },

  section: {
    marginTop: SPACING.lg,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  addButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },

  driverCard: {
    marginBottom: SPACING.sm,
  },

  driverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },

  driverName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  driverTeam: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  driverPrice: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },

  priceColumn: {
    alignItems: 'flex-end',
  },

  purchasePrice: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  tradingInfo: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    gap: SPACING.lg,
  },

  tradingItem: {
    flex: 1,
  },

  tradingLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginBottom: 2,
  },

  tradingValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  tradingHint: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },

  profitText: {
    color: COLORS.success,
  },

  lossText: {
    color: COLORS.error,
  },

  driverActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },

  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    gap: SPACING.xs,
  },

  // V3: Captain styles (replaces star)
  captainActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  actionButtonText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
  },

  captainActiveText: {
    color: COLORS.white,
  },

  aceText: {
    color: COLORS.gold,
  },

  constructorActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },

  removeButton: {
    borderColor: COLORS.error + '40',
  },

  removeText: {
    color: COLORS.error,
  },

  lockBonusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },

  lockBonusText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.accent,
  },

  recommendationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.success + '10',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },

  recommendationText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    flex: 1,
  },

  recommendationDriver: {
    fontWeight: '600',
    color: COLORS.success,
  },

  stretchRecommendation: {
    backgroundColor: COLORS.warning + '10',
  },

  stretchDriver: {
    fontWeight: '600',
    color: COLORS.warning,
  },

  constructorCard: {},

  constructorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  constructorName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  constructorPoints: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  constructorPrice: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
    textAlign: 'center',
  },

  doneButton: {
    marginTop: SPACING.xl,
  },

  deleteTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },

  deleteTeamText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.error,
    fontWeight: '500',
  },
});
