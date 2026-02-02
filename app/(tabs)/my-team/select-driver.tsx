import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDrivers } from '../../../src/hooks';
import { useTeamStore } from '../../../src/store/team.store';
import { Loading, DriverCard, BudgetBar, Button, SmartRecommendations, BudgetInsights } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, BUDGET, TEAM_SIZE, SHADOWS } from '../../../src/config/constants';
import type { Driver } from '../../../src/types';

export default function SelectDriverScreen() {
  const { swapDriverId, swapDriverPrice } = useLocalSearchParams<{
    swapDriverId?: string;
    swapDriverPrice?: string;
  }>();

  const { data: allDrivers, isLoading } = useDrivers();
  const { currentTeam, addDriver, removeDriver, setStarConstructor, getEligibleStarDrivers, isLoading: teamLoading } = useTeamStore();

  const eligibleStarDrivers = getEligibleStarDrivers();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDrivers, setSelectedDrivers] = useState<Driver[]>([]);
  const [showAll, setShowAll] = useState(false);

  // Swap mode: we're replacing a specific driver
  const isSwapMode = !!swapDriverId;
  const swapPrice = swapDriverPrice ? parseInt(swapDriverPrice, 10) : 0;

  const currentDriverIds = useMemo(
    () => currentTeam?.drivers.map((d) => d.driverId).filter(id => id !== swapDriverId) || [],
    [currentTeam, swapDriverId]
  );

  const currentDriverCount = currentTeam?.drivers.length || 0;
  // In swap mode, we're replacing one driver, so we can select 1
  const maxSelectableDrivers = isSwapMode ? 1 : TEAM_SIZE - currentDriverCount;
  // In swap mode, add the swapped driver's price back to budget
  const baseBudget = (currentTeam?.budget || BUDGET) + (isSwapMode ? swapPrice : 0);

  // Calculate effective budget after selected drivers
  const selectedTotal = useMemo(
    () => selectedDrivers.reduce((sum, d) => sum + d.price, 0),
    [selectedDrivers]
  );
  const effectiveBudget = baseBudget - selectedTotal;

  const availableDrivers = useMemo(() => {
    if (!allDrivers) return [];

    return allDrivers
      .filter((driver) => {
        // Exclude already on team
        if (currentDriverIds.includes(driver.id)) return false;
        // Exclude already selected in this session
        if (selectedDrivers.some((d) => d.id === driver.id)) return false;
        // Filter by search
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            driver.name.toLowerCase().includes(query) ||
            driver.shortName.toLowerCase().includes(query) ||
            driver.constructorName.toLowerCase().includes(query)
          );
        }
        return true;
      })
      .sort((a, b) => b.price - a.price);
  }, [allDrivers, currentDriverIds, selectedDrivers, searchQuery]);

  const affordableDrivers = useMemo(
    () => availableDrivers.filter((d) => d.price <= effectiveBudget),
    [availableDrivers, effectiveBudget]
  );

  const displayedDrivers = showAll ? availableDrivers : affordableDrivers;

  const handleToggleDriver = (driver: Driver) => {
    const isSelected = selectedDrivers.some((d) => d.id === driver.id);

    if (isSelected) {
      // Remove from selection
      setSelectedDrivers(selectedDrivers.filter((d) => d.id !== driver.id));
    } else {
      // Check if we can add more
      if (selectedDrivers.length >= maxSelectableDrivers) {
        return; // Can't add more
      }
      // Check if affordable
      if (driver.price > effectiveBudget) {
        return; // Can't afford
      }
      // Add to selection
      setSelectedDrivers([...selectedDrivers, driver]);
    }
  };

  const handleRemoveSelected = (driverId: string) => {
    setSelectedDrivers(selectedDrivers.filter((d) => d.id !== driverId));
  };

  const handleConfirm = async () => {
    if (selectedDrivers.length === 0) return;

    try {
      if (isSwapMode && swapDriverId) {
        // Swap mode: remove old driver first, then add new one
        const newDriver = selectedDrivers[0];

        // Check if the swapped driver was a star driver
        const swappedDriver = currentTeam?.drivers.find(d => d.driverId === swapDriverId);
        const wasStarDriver = swappedDriver?.isStarDriver;

        // Remove the old driver
        await removeDriver(swapDriverId);

        // Add the new driver (make them star if old one was star and new one is eligible)
        const shouldBeStar = wasStarDriver && eligibleStarDrivers.includes(newDriver.id);
        await addDriver(newDriver.id, shouldBeStar);
      } else {
        // Normal add mode
        // Check if team is empty and needs a star
        const needsStar = currentDriverCount === 0;

        // Find first eligible driver for star (if needed)
        const firstEligibleDriver = needsStar
          ? selectedDrivers.find(d => eligibleStarDrivers.includes(d.id))
          : null;

        // Add drivers one by one
        for (let i = 0; i < selectedDrivers.length; i++) {
          const driver = selectedDrivers[i];
          // Only set as star if eligible (bottom 10 by points)
          const isStarDriver = !!(firstEligibleDriver && driver.id === firstEligibleDriver.id);
          await addDriver(driver.id, isStarDriver);
        }

        // If team needed star but no eligible driver found, set constructor as star
        if (needsStar && !firstEligibleDriver && currentTeam?.constructor) {
          await setStarConstructor();
        }
      }

      router.back();
    } catch (error) {
      // Error handled by store
    }
  };

  if (isLoading) {
    return <Loading fullScreen message="Loading drivers..." />;
  }

  // Get the name of driver being swapped for display
  const swappingDriverName = isSwapMode
    ? currentTeam?.drivers.find(d => d.driverId === swapDriverId)?.name
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Swap Mode Banner */}
      {isSwapMode && (
        <View style={styles.swapBanner}>
          <Ionicons name="swap-horizontal" size={18} color={COLORS.primary} />
          <Text style={styles.swapBannerText}>
            Swapping <Text style={styles.swapDriverName}>{swappingDriverName}</Text>
          </Text>
          <Text style={styles.swapBudgetInfo}>+{swapPrice} pts available</Text>
        </View>
      )}

      {/* Budget Header - Fixed at top */}
      <View style={styles.budgetHeader}>
        <View style={styles.budgetRow}>
          <Text style={styles.budgetTitle}>Budget Available</Text>
          <Text style={[
            styles.budgetAmount,
            effectiveBudget < 100 && styles.budgetLow,
            effectiveBudget < 0 && styles.budgetOver,
          ]}>
            {effectiveBudget} pts
          </Text>
        </View>
        <BudgetBar remaining={effectiveBudget} total={BUDGET} />
        {!isSwapMode && (
          <View style={styles.budgetMeta}>
            <Text style={styles.budgetMetaText}>
              Slots: {selectedDrivers.length + currentDriverCount}/{TEAM_SIZE}
            </Text>
            {selectedDrivers.length > 0 && (
              <Text style={styles.budgetMetaText}>
                Selected: {selectedTotal} pts
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Budget Insights */}
      {!isSwapMode && (
        <BudgetInsights
          remainingBudget={effectiveBudget}
          slotsRemaining={maxSelectableDrivers - selectedDrivers.length}
          totalSlots={TEAM_SIZE}
        />
      )}

      {/* Selected Drivers Chips */}
      {selectedDrivers.length > 0 && (
        <View style={styles.selectedSection}>
          <Text style={styles.selectedTitle}>
            Selected ({selectedDrivers.length}) - {selectedTotal} pts
          </Text>
          <View style={styles.selectedChips}>
            {selectedDrivers.map((driver) => (
              <TouchableOpacity
                key={driver.id}
                style={styles.chip}
                onPress={() => handleRemoveSelected(driver.id)}
              >
                <Text style={styles.chipText}>{driver.shortName}</Text>
                <Text style={styles.chipPrice}>{driver.price}</Text>
                <Ionicons name="close" size={14} color={COLORS.white} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.gray[400]} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search drivers..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={COLORS.gray[400]}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={COLORS.gray[400]} />
          </TouchableOpacity>
        )}
      </View>

      {/* Smart Recommendations */}
      {!searchQuery && allDrivers && (
        <SmartRecommendations
          availableDrivers={allDrivers}
          selectedDrivers={selectedDrivers}
          currentTeamDrivers={currentTeam?.drivers.map(d => ({ driverId: d.driverId, tier: d.tier || 'B' })) || []}
          budget={effectiveBudget}
          slotsRemaining={maxSelectableDrivers - selectedDrivers.length}
          onSelectDriver={handleToggleDriver}
        />
      )}

      {/* Filter info */}
      <View style={styles.filterInfo}>
        <Text style={styles.filterText}>
          {affordableDrivers.length} affordable drivers
        </Text>
        <TouchableOpacity onPress={() => setShowAll(!showAll)}>
          <Text style={styles.showAllText}>
            {showAll ? 'Show affordable' : 'Show all'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Driver List */}
      <FlatList
        data={displayedDrivers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isAffordable = item.price <= effectiveBudget;
          const canSelect = isAffordable && selectedDrivers.length < maxSelectableDrivers;

          return (
            <View style={[!isAffordable && styles.unaffordable]}>
              <DriverCard
                driver={item}
                showPrice
                showPoints
                isSelected={false}
                onSelect={() => canSelect && handleToggleDriver(item)}
              />
              {!isAffordable && (
                <View style={styles.unaffordableOverlay}>
                  <Text style={styles.unaffordableText}>Over budget</Text>
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No drivers found</Text>
          </View>
        }
      />

      {/* Confirm Button */}
      {selectedDrivers.length > 0 && (
        <View style={styles.confirmContainer}>
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedName}>
              {isSwapMode
                ? `Swap with ${selectedDrivers[0].name}`
                : `${selectedDrivers.length} driver${selectedDrivers.length > 1 ? 's' : ''} selected`}
            </Text>
            <Text style={styles.selectedPrice}>
              {isSwapMode
                ? `Cost: ${selectedTotal} pts (saves ${swapPrice - selectedTotal} pts)`
                : `Total: ${selectedTotal} pts`}
            </Text>
          </View>
          <Button
            title={isSwapMode ? 'Swap Driver' : `Add ${selectedDrivers.length} Driver${selectedDrivers.length > 1 ? 's' : ''}`}
            onPress={handleConfirm}
            loading={teamLoading}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray[50],
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
    color: COLORS.gray[700],
  },

  swapDriverName: {
    fontWeight: '600',
    color: COLORS.primary,
  },

  swapBudgetInfo: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.success,
  },

  budgetHeader: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },

  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },

  budgetTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[700],
  },

  budgetAmount: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.success,
  },

  budgetLow: {
    color: COLORS.warning,
  },

  budgetOver: {
    color: COLORS.error,
  },

  budgetMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[100],
  },

  budgetMetaText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[600],
    fontWeight: '500',
  },

  selectedSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[200],
    paddingBottom: SPACING.md,
  },

  selectedTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.gray[700],
    marginBottom: SPACING.sm,
  },

  selectedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
  },

  chipText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
  },

  chipPrice: {
    color: COLORS.white,
    fontSize: FONTS.sizes.xs,
    opacity: 0.8,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },

  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[900],
  },

  filterInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },

  filterText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
  },

  showAllText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    fontWeight: '500',
  },

  listContent: {
    padding: SPACING.md,
    paddingBottom: 120,
  },

  unaffordable: {
    opacity: 0.5,
  },

  unaffordableOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: COLORS.error,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderTopRightRadius: BORDER_RADIUS.lg,
    borderBottomLeftRadius: BORDER_RADIUS.md,
  },

  unaffordableText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.white,
    fontWeight: '600',
  },

  emptyContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[500],
  },

  confirmContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[200],
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
    color: COLORS.gray[900],
  },

  selectedPrice: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    marginTop: 2,
  },
});
