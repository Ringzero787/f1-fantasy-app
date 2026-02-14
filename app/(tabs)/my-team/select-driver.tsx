import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDrivers, useLockoutStatus } from '../../../src/hooks';
import { useTeamStore, getLockedOutDriverIds, isDriverLockedOut, calculateEarlyTerminationFee } from '../../../src/store/team.store';
import { useAdminStore } from '../../../src/store/admin.store';
import { Loading, DriverCard, Button, SmartRecommendations } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, BUDGET, TEAM_SIZE, TEAM_COLORS } from '../../../src/config/constants';
import { PRICING_CONFIG } from '../../../src/config/pricing.config';
import type { Driver, FantasyDriver, FantasyTeam } from '../../../src/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CART_HORIZONTAL_PADDING = SPACING.md * 2;
const SLOT_GAP = 6;
const SLOT_WIDTH = (SCREEN_WIDTH - CART_HORIZONTAL_PADDING - SLOT_GAP * 4) / 5;

export default function SelectDriverScreen() {
  const { swapDriverId, swapDriverPrice } = useLocalSearchParams<{
    swapDriverId?: string;
    swapDriverPrice?: string;
  }>();

  const { data: allDrivers, isLoading } = useDrivers();
  const currentTeam = useTeamStore(s => s.currentTeam);
  const lockoutInfo = useLockoutStatus();

  const topTenDriverIds = useMemo(() => {
    if (!allDrivers) return new Set<string>();
    const sorted = [...allDrivers].sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0));
    return new Set(sorted.slice(0, 10).map(d => d.id));
  }, [allDrivers]);

  // V5: Compute locked-out driver IDs for this team (active lockouts only)
  const raceResults = useAdminStore(s => s.raceResults);
  const lockedOutIds = useMemo(() => {
    const completedRaceCount = useAdminStore.getState().getCompletedRaceCount();
    return new Set(getLockedOutDriverIds(currentTeam?.driverLockouts, completedRaceCount));
  }, [currentTeam?.driverLockouts, raceResults]);

  const [selectedDrivers, setSelectedDrivers] = useState<Driver[]>([]);
  const [contractLengths, setContractLengths] = useState<Record<string, number>>({});
  const [pendingDriver, setPendingDriver] = useState<Driver | null>(null);
  const [pendingContractLength, setPendingContractLength] = useState<number>(PRICING_CONFIG.CONTRACT_LENGTH);

  // Refs for auto-save on unmount
  const selectedDriversRef = useRef<Driver[]>([]);
  const confirmedRef = useRef(false);

  useEffect(() => {
    selectedDriversRef.current = selectedDrivers;
  }, [selectedDrivers]);

  const contractLengthsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    contractLengthsRef.current = contractLengths;
  }, [contractLengths]);

  // Atomic helper: apply selected drivers to the team in one shot
  const applyDriversToTeam = (pending: Driver[], lengths: Record<string, number>) => {
    const team = useTeamStore.getState().currentTeam;
    if (!team || pending.length === 0) return;

    // Filter out any actively locked-out drivers
    const completedRaceCount = Object.values(useAdminStore.getState().raceResults)
      .filter(r => r.isComplete).length;
    pending = pending.filter(d => !isDriverLockedOut(team.driverLockouts, d.id, completedRaceCount));
    if (pending.length === 0) return;

    if (isSwapMode && swapDriverId && pending.length > 0) {
      // Swap: remove old driver, add new one
      const oldDriver = team.drivers.find(d => d.driverId === swapDriverId);
      const newDriver = pending[0];
      // V6: Early termination fee — waived for reserve picks and grace period
      const oldContractLen = oldDriver?.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
      const oldInGracePeriod = (oldDriver?.racesHeld || 0) === 0;
      const oldEarlyTermFee = (oldDriver && !oldDriver.isReservePick && !oldInGracePeriod) ? calculateEarlyTerminationFee(oldDriver.currentPrice, oldContractLen, oldDriver.racesHeld || 0) : 0;
      const saleValue = oldDriver ? Math.max(0, oldDriver.currentPrice - oldEarlyTermFee) : 0;
      const newFantasyDriver: FantasyDriver = {
        driverId: newDriver.id,
        name: newDriver.name,
        shortName: newDriver.shortName,
        constructorId: newDriver.constructorId,
        purchasePrice: newDriver.price,
        currentPrice: newDriver.price,
        pointsScored: 0,
        racesHeld: 0,
        contractLength: lengths[newDriver.id] || PRICING_CONFIG.CONTRACT_LENGTH,
        addedAtRace: completedRaceCount,
      };
      const updatedTeam: FantasyTeam = {
        ...team,
        drivers: team.drivers.map(d =>
          d.driverId === swapDriverId ? newFantasyDriver : d
        ),
        totalSpent: team.totalSpent - (oldDriver?.purchasePrice || 0) + newDriver.price,
        budget: team.budget + saleValue - newDriver.price,
        racesSinceTransfer: 0,
        // V7: Bank departing driver's points
        lockedPoints: (team.lockedPoints || 0) + (oldDriver?.pointsScored || 0),
        updatedAt: new Date(),
      };
      useTeamStore.getState().setCurrentTeam(updatedTeam);
    } else {
      // Add all drivers atomically
      const newFantasyDrivers: FantasyDriver[] = pending.map(driver => ({
        driverId: driver.id,
        name: driver.name,
        shortName: driver.shortName,
        constructorId: driver.constructorId,
        purchasePrice: driver.price,
        currentPrice: driver.price,
        pointsScored: 0,
        racesHeld: 0,
        contractLength: lengths[driver.id] || PRICING_CONFIG.CONTRACT_LENGTH,
        addedAtRace: completedRaceCount,
      }));
      const totalCost = pending.reduce((sum, d) => sum + d.price, 0);
      const updatedTeam: FantasyTeam = {
        ...team,
        drivers: [...team.drivers, ...newFantasyDrivers],
        totalSpent: team.totalSpent + totalCost,
        budget: team.budget - totalCost,
        racesSinceTransfer: 0,
        updatedAt: new Date(),
      };
      useTeamStore.getState().setCurrentTeam(updatedTeam);
    }
  };

  useEffect(() => {
    return () => {
      if (confirmedRef.current) return;
      const pending = selectedDriversRef.current;
      if (pending.length === 0) return;
      applyDriversToTeam(pending, contractLengthsRef.current);
    };
  }, []);

  const isSwapMode = !!swapDriverId;
  const swapPrice = swapDriverPrice ? parseInt(swapDriverPrice, 10) : 0;

  const currentDriverIds = useMemo(
    () => currentTeam?.drivers.map((d) => d.driverId).filter(id => id !== swapDriverId) || [],
    [currentTeam, swapDriverId]
  );

  const currentDriverCount = currentTeam?.drivers.length || 0;
  const maxSelectableDrivers = isSwapMode ? 1 : TEAM_SIZE - currentDriverCount;
  const baseBudget = (currentTeam?.budget || BUDGET) + (isSwapMode ? swapPrice : 0);

  const selectedTotal = useMemo(
    () => selectedDrivers.reduce((sum, d) => sum + d.price, 0),
    [selectedDrivers]
  );
  const effectiveBudget = baseBudget - selectedTotal;
  const slotsLeft = maxSelectableDrivers - selectedDrivers.length;

  const availableDrivers = useMemo(() => {
    if (!allDrivers) return [];

    return allDrivers
      .filter((driver) => {
        if (currentDriverIds.includes(driver.id)) return false;
        if (selectedDrivers.some((d) => d.id === driver.id)) return false;
        return true;
      })
      // Sort affordable first (by price desc), then unaffordable (by price desc)
      .sort((a, b) => {
        const aAffordable = a.price <= effectiveBudget;
        const bAffordable = b.price <= effectiveBudget;
        if (aAffordable && !bAffordable) return -1;
        if (!aAffordable && bAffordable) return 1;
        return b.price - a.price;
      });
  }, [allDrivers, currentDriverIds, selectedDrivers, effectiveBudget]);

  const handleToggleDriver = (driver: Driver) => {
    const isSelected = selectedDrivers.some((d) => d.id === driver.id);

    if (isSelected) {
      setSelectedDrivers(selectedDrivers.filter((d) => d.id !== driver.id));
      const { [driver.id]: _, ...rest } = contractLengths;
      setContractLengths(rest);
    } else {
      if (selectedDrivers.length >= maxSelectableDrivers) return;
      if (driver.price > effectiveBudget) return;

      // Show contract length picker
      setPendingDriver(driver);
      setPendingContractLength(PRICING_CONFIG.CONTRACT_LENGTH);
    }
  };

  const handleConfirmContract = () => {
    if (!pendingDriver) return;
    const driver = pendingDriver;
    const length = pendingContractLength;

    const updatedLengths = { ...contractLengths, [driver.id]: length };
    setContractLengths(updatedLengths);

    // If adding/swapping a single driver from My Team, add immediately and go back
    if (maxSelectableDrivers === 1) {
      confirmedRef.current = true;
      applyDriversToTeam([driver], updatedLengths);
      router.back();
      setPendingDriver(null);
      return;
    }

    setSelectedDrivers([...selectedDrivers, driver]);
    setPendingDriver(null);
  };

  const handleRemoveSelected = (driverId: string) => {
    setSelectedDrivers(selectedDrivers.filter((d) => d.id !== driverId));
    const { [driverId]: _, ...rest } = contractLengths;
    setContractLengths(rest);
  };

  const handleConfirm = () => {
    if (selectedDrivers.length === 0) return;

    confirmedRef.current = true;
    applyDriversToTeam(selectedDrivers, contractLengths);
    router.back();
  };

  // V5: Lockout guard - prevent team changes during race weekend
  if (lockoutInfo.isLocked) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.lockedContainer}>
          <Ionicons name="lock-closed" size={48} color={COLORS.error} />
          <Text style={styles.lockedTitle}>Teams Locked</Text>
          <Text style={styles.lockedMessage}>{lockoutInfo.lockReason || 'Team changes are locked during race weekend'}</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="outline" />
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return <Loading fullScreen message="Loading drivers..." />;
  }

  const swappingDriverName = isSwapMode
    ? currentTeam?.drivers.find(d => d.driverId === swapDriverId)?.name
    : null;

  // Build array of 5 slots for the cart (only used in non-swap mode)
  const cartSlots: (Driver | null)[] = [];
  for (let i = 0; i < maxSelectableDrivers; i++) {
    cartSlots.push(selectedDrivers[i] || null);
  }

  const affordableCount = availableDrivers.filter(d => d.price <= effectiveBudget).length;

  const listHeader = (
    <>
      {/* Swap Mode Banner */}
      {isSwapMode && (
        <View style={styles.swapBanner}>
          <Ionicons name="swap-horizontal" size={16} color={COLORS.primary} />
          <Text style={styles.swapBannerText}>
            Swapping <Text style={styles.swapDriverName}>{swappingDriverName}</Text> (+${swapPrice})
          </Text>
        </View>
      )}

      {/* No budget warning */}
      {affordableCount === 0 && availableDrivers.length > 0 && (
        <View style={styles.noBudgetBanner}>
          <Ionicons name="wallet-outline" size={16} color={COLORS.warning} />
          <Text style={styles.noBudgetText}>
            You can't afford any drivers with ${effectiveBudget} remaining
          </Text>
        </View>
      )}

      {/* Smart Recommendations */}
      {allDrivers && slotsLeft > 0 && affordableCount > 0 && (
        <SmartRecommendations
          availableDrivers={allDrivers.filter(d => !lockedOutIds.has(d.id))}
          selectedDrivers={selectedDrivers}
          currentTeamDrivers={currentTeam?.drivers.map(d => ({ driverId: d.driverId })) || []}
          budget={effectiveBudget}
          slotsRemaining={slotsLeft}
          onSelectDriver={handleToggleDriver}
        />
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Driver list with header */}
      <FlatList
        data={availableDrivers}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => {
          const isLockedOut = lockedOutIds.has(item.id);
          const isAffordable = item.price <= effectiveBudget;
          const canSelect = !isLockedOut && isAffordable && selectedDrivers.length < maxSelectableDrivers;

          return (
            <View style={[styles.driverItem, (isLockedOut || !isAffordable) && styles.lockedOutItem]}>
              <DriverCard
                driver={item}
                compact
                showPrice
                showPoints
                isSelected={false}
                isTopTen={topTenDriverIds.has(item.id)}
                onSelect={() => canSelect && handleToggleDriver(item)}
              />
              {isLockedOut && (
                <View style={styles.lockedOutBadge}>
                  <Ionicons name="lock-closed" size={10} color={COLORS.white} />
                  <Text style={styles.lockedOutBadgeText}>Locked 1 race</Text>
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No drivers available</Text>
          </View>
        }
      />

      {/* Contract Length Picker */}
      {pendingDriver && (
        <View style={styles.contractOverlay}>
          <View style={styles.contractModal}>
            <Text style={styles.contractTitle}>{pendingDriver.name}</Text>
            <Text style={styles.contractSubtitle}>${pendingDriver.price}</Text>
            <Text style={styles.contractLabel}>Contract Length</Text>
            <View style={styles.contractButtons}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.contractButton,
                    pendingContractLength === n && styles.contractButtonActive,
                  ]}
                  onPress={() => setPendingContractLength(n)}
                >
                  <Text
                    style={[
                      styles.contractButtonText,
                      pendingContractLength === n && styles.contractButtonTextActive,
                    ]}
                  >
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.contractHint}>
              {pendingContractLength} race{pendingContractLength !== 1 ? 's' : ''}
            </Text>
            <View style={styles.contractActions}>
              <TouchableOpacity
                style={styles.contractCancelBtn}
                onPress={() => setPendingDriver(null)}
              >
                <Text style={styles.contractCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.contractConfirmBtn}
                onPress={handleConfirmContract}
              >
                <Text style={styles.contractConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Bottom Cart Panel (non-swap mode) */}
      {!isSwapMode && !pendingDriver && (
        <View style={styles.cartPanel}>
          {/* Budget row */}
          <View style={styles.cartBudgetRow}>
            <Text style={styles.cartBudgetLabel}>
              <Text style={styles.cartBudgetValue}>${effectiveBudget}</Text> remaining
            </Text>
            <Text style={styles.cartSlotsLeftText}>
              {slotsLeft} slot{slotsLeft !== 1 ? 's' : ''} left
            </Text>
          </View>

          {/* 5 mini slots */}
          <View style={styles.cartSlotsRow}>
            {cartSlots.map((driver, index) => {
              if (driver) {
                const teamColor = TEAM_COLORS[driver.constructorId]?.primary || '#4B5563';
                const contractLen = contractLengths[driver.id] || PRICING_CONFIG.CONTRACT_LENGTH;
                return (
                  <TouchableOpacity
                    key={driver.id}
                    style={styles.cartSlotFilled}
                    onPress={() => handleRemoveSelected(driver.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.cartSlotTeamStripe, { backgroundColor: teamColor }]} />
                    <Text style={styles.cartSlotName} numberOfLines={1}>{driver.shortName}</Text>
                    <Text style={styles.cartSlotPrice}>${driver.price}</Text>
                    <Text style={styles.cartSlotContract}>{contractLen}R</Text>
                    <View style={styles.cartSlotRemoveHint}>
                      <Ionicons name="close" size={10} color={COLORS.text.muted} />
                    </View>
                  </TouchableOpacity>
                );
              }
              return (
                <View key={`empty-${index}`} style={styles.cartSlotEmpty}>
                  <Ionicons name="add" size={18} color={COLORS.text.muted} />
                </View>
              );
            })}
          </View>

          {/* Confirm button */}
          {selectedDrivers.length > 0 && (
            <View style={styles.cartConfirmRow}>
              <Button
                title={`Add ${selectedDrivers.length} Driver${selectedDrivers.length > 1 ? 's' : ''}`}
                onPress={handleConfirm}
              />
            </View>
          )}
        </View>
      )}

      {/* Swap mode confirm (original behavior) */}
      {isSwapMode && selectedDrivers.length > 0 && !pendingDriver && (
        <View style={styles.confirmContainer}>
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedName}>
              Swap with {selectedDrivers[0].name}
            </Text>
            <Text style={styles.selectedPrice}>
              ${selectedTotal} (saves ${swapPrice - selectedTotal})
            </Text>
          </View>
          <Button
            title="Swap"
            onPress={handleConfirm}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  swapBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '15',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },

  swapBannerText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
  },

  swapDriverName: {
    fontWeight: '600',
    color: COLORS.primary,
  },

  noBudgetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '15',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },

  noBudgetText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: COLORS.warning,
    fontWeight: '500',
  },

  driverItem: {
    marginHorizontal: SPACING.md,
  },
  lockedOutItem: {
    opacity: 0.45,
  },
  lockedOutBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.error,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  lockedOutBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
  },

  listContent: {
    paddingBottom: 200,
  },

  lockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
  },

  lockedTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  lockedMessage: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },

  emptyContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
  },

  // ==============================
  // Bottom Cart Panel
  // ==============================
  cartPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },

  cartBudgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },

  cartBudgetLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },

  cartBudgetValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.success,
  },

  cartSlotsLeftText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },

  cartSlotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SLOT_GAP,
  },

  cartSlotFilled: {
    width: SLOT_WIDTH,
    height: 58,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 5,
    paddingHorizontal: 2,
    overflow: 'hidden',
  },

  cartSlotTeamStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: BORDER_RADIUS.sm,
    borderTopRightRadius: BORDER_RADIUS.sm,
  },

  cartSlotName: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.text.primary,
    textAlign: 'center',
  },

  cartSlotPrice: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 1,
  },

  cartSlotContract: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 1,
  },

  cartSlotRemoveHint: {
    position: 'absolute',
    top: 4,
    right: 4,
  },

  cartSlotEmpty: {
    width: SLOT_WIDTH,
    height: 58,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border.light,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cartConfirmRow: {
    marginTop: SPACING.sm,
  },

  // ==============================
  // Swap mode confirm (kept for swap)
  // ==============================
  confirmContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  selectedInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },

  selectedName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  selectedPrice: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    marginTop: 2,
  },

  // Contract length picker
  contractOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  contractModal: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  contractTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
    textAlign: 'center',
  },
  contractSubtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.primary,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  contractLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  contractButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  contractButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: COLORS.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  contractButtonText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.secondary,
  },
  contractButtonTextActive: {
    color: COLORS.white,
  },
  contractHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  contractActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  contractCancelBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    backgroundColor: COLORS.card,
  },
  contractCancelText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },
  contractConfirmBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.button,
    backgroundColor: COLORS.primary,
  },
  contractConfirmText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.white,
    fontWeight: '600',
  },
});
