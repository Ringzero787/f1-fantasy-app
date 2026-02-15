import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useConstructors, useLockoutStatus } from '../../../src/hooks';
import { useTeamStore, calculateEarlyTerminationFee } from '../../../src/store/team.store';
import { useAdminStore } from '../../../src/store/admin.store';
import { Loading, ConstructorCard, Button } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, BUDGET } from '../../../src/config/constants';
import { PRICING_CONFIG } from '../../../src/config/pricing.config';
import type { Constructor, FantasyConstructor, FantasyTeam } from '../../../src/types';

export default function SelectConstructorScreen() {
  const { data: allConstructors, isLoading } = useConstructors();
  const currentTeam = useTeamStore(s => s.currentTeam);
  const lockoutInfo = useLockoutStatus();

  // Contract length picker state
  const [pendingConstructor, setPendingConstructor] = useState<Constructor | null>(null);
  const [pendingContractLength, setPendingContractLength] = useState<number>(PRICING_CONFIG.CONTRACT_LENGTH);

  // Account for current constructor value if swapping (use sale value after early term fee)
  const currentConstructorSaleValue = useMemo(() => {
    if (!currentTeam?.constructor) return 0;
    const c = currentTeam.constructor;
    const contractLen = c.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
    const earlyTermFee = calculateEarlyTerminationFee(c.purchasePrice, contractLen, c.racesHeld || 0);
    return Math.max(0, c.currentPrice - earlyTermFee);
  }, [currentTeam?.constructor]);

  const remainingBudget = (currentTeam?.budget ?? BUDGET) + currentConstructorSaleValue;

  const availableConstructors = useMemo(() => {
    if (!allConstructors) return [];
    const currentId = currentTeam?.constructor?.constructorId;
    return allConstructors
      .filter((c) => c.id !== currentId)
      // Sort affordable first (by price desc), then unaffordable (by price desc)
      .sort((a, b) => {
        const aAffordable = a.price <= remainingBudget;
        const bAffordable = b.price <= remainingBudget;
        if (aAffordable && !bAffordable) return -1;
        if (!aAffordable && bAffordable) return 1;
        return b.price - a.price;
      });
  }, [allConstructors, remainingBudget, currentTeam?.constructor?.constructorId]);

  const affordableCount = useMemo(() =>
    availableConstructors.filter(c => c.price <= remainingBudget).length,
    [availableConstructors, remainingBudget]
  );

  const handleSelectConstructor = (item: Constructor) => {
    if (item.price > remainingBudget) return;
    // Show contract length picker instead of immediately selecting
    setPendingConstructor(item);
    setPendingContractLength(PRICING_CONFIG.CONTRACT_LENGTH);
  };

  const handleConfirmContract = () => {
    if (!pendingConstructor) return;
    const item = pendingConstructor;
    const team = useTeamStore.getState().currentTeam;
    if (!team) return;

    const completedRaceCount = Object.values(useAdminStore.getState().raceResults)
      .filter(r => r.isComplete).length;

    // Calculate budget adjustment: sell old constructor (with early term fee), buy new one
    const oldConstructor = team.constructor;
    let saleReturn = 0;
    let bankedPoints = 0;
    if (oldConstructor) {
      const oldContractLen = oldConstructor.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
      const oldEarlyTermFee = calculateEarlyTerminationFee(oldConstructor.purchasePrice, oldContractLen, oldConstructor.racesHeld || 0);
      saleReturn = Math.max(0, oldConstructor.currentPrice - oldEarlyTermFee);
      bankedPoints = oldConstructor.pointsScored || 0;
    }

    const fantasyConstructor: FantasyConstructor = {
      constructorId: item.id,
      name: item.name,
      purchasePrice: item.price,
      currentPrice: item.price,
      pointsScored: 0,
      racesHeld: 0,
      contractLength: pendingContractLength,
      addedAtRace: completedRaceCount,
    };

    const updatedTeam: FantasyTeam = {
      ...team,
      constructor: fantasyConstructor,
      totalSpent: team.totalSpent - (oldConstructor?.purchasePrice || 0) + item.price,
      budget: team.budget + saleReturn - item.price,
      lockedPoints: (team.lockedPoints || 0) + bankedPoints,
      updatedAt: new Date(),
    };
    useTeamStore.getState().setCurrentTeam(updatedTeam);
    setPendingConstructor(null);
    router.back();
  };

  // V5: Lockout guard
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
    return <Loading fullScreen message="Loading constructors..." />;
  }

  const swappingName = currentTeam?.constructor?.name;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Budget bar */}
      <View style={styles.budgetBar}>
        <Text style={styles.budgetLabel}>${remainingBudget}</Text>
        <Text style={styles.budgetMeta}>
          {swappingName ? `Swapping ${swappingName}` : 'Select constructor'}
        </Text>
      </View>

      {/* No budget warning */}
      {affordableCount === 0 && availableConstructors.length > 0 && (
        <View style={styles.noBudgetBanner}>
          <Ionicons name="wallet-outline" size={16} color={COLORS.warning} />
          <Text style={styles.noBudgetText}>
            You can't afford any constructors with ${remainingBudget} remaining
          </Text>
        </View>
      )}

      {/* Constructor List */}
      <FlatList
        data={availableConstructors}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isAffordable = item.price <= remainingBudget;
          return (
            <View style={[styles.constructorItem, !isAffordable && styles.unaffordableItem]}>
              <ConstructorCard
                constructorData={item}
                showPrice
                showPoints
                onSelect={isAffordable ? () => handleSelectConstructor(item) : undefined}
              />
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No constructors available</Text>
          </View>
        }
      />

      {/* Contract Length Picker */}
      {pendingConstructor && (
        <View style={styles.contractOverlay}>
          <View style={styles.contractModal}>
            <Text style={styles.contractTitle}>{pendingConstructor.name}</Text>
            <Text style={styles.contractSubtitle}>${pendingConstructor.price}</Text>
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
                onPress={() => setPendingConstructor(null)}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  budgetBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  budgetLabel: {
    fontSize: FONTS.sizes.lg,
    fontWeight: 'bold',
    color: COLORS.success,
  },

  budgetMeta: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },

  constructorItem: {
    marginHorizontal: SPACING.md,
  },

  unaffordableItem: {
    opacity: 0.45,
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

  listContent: {
    paddingTop: SPACING.md,
    paddingBottom: 40,
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

  // Contract length picker (mirrors select-driver.tsx)
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
