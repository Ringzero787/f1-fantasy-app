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
  const { currentTeam, addDriver, removeDriver, isLoading: teamLoading } = useTeamStore();

  // Calculate top 10 driver IDs by 2026 season points (highest points = top positions)
  const topTenDriverIds = useMemo(() => {
    if (!allDrivers) return new Set<string>();
    const sorted = [...allDrivers].sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0));
    return new Set(sorted.slice(0, 10).map(d => d.id));
  }, [allDrivers]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDrivers, setSelectedDrivers] = useState<Driver[]>([]);
  const [showAll, setShowAll] = useState(false);

  // Debug: log when selectedDrivers changes
  React.useEffect(() => {
    console.log('selectedDrivers state updated:', selectedDrivers.map(d => d.name));
  }, [selectedDrivers]);

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

    console.log('handleToggleDriver:', {
      driver: driver.name,
      driverPrice: driver.price,
      isSelected,
      selectedCount: selectedDrivers.length,
      maxSelectable: maxSelectableDrivers,
      effectiveBudget,
      currentDriverCount,
      teamBudget: currentTeam?.budget,
    });

    if (isSelected) {
      // Remove from selection
      console.log('Removing driver from selection:', driver.name);
      setSelectedDrivers(selectedDrivers.filter((d) => d.id !== driver.id));
    } else {
      // Check if we can add more
      if (selectedDrivers.length >= maxSelectableDrivers) {
        console.log('Cannot add: slots full');
        return; // Can't add more
      }
      // Check if affordable
      if (driver.price > effectiveBudget) {
        console.log('Cannot add: over budget', driver.price, '>', effectiveBudget);
        return; // Can't afford
      }
      // Add to selection
      const newSelection = [...selectedDrivers, driver];
      console.log('Adding driver to selection:', driver.name, 'New selection count:', newSelection.length);
      setSelectedDrivers(newSelection);
    }
  };

  const handleRemoveSelected = (driverId: string) => {
    setSelectedDrivers(selectedDrivers.filter((d) => d.id !== driverId));
  };

  const handleConfirm = async () => {
    console.log('handleConfirm called:', {
      selectedCount: selectedDrivers.length,
      isSwapMode,
      swapDriverId
    });

    if (selectedDrivers.length === 0) {
      console.log('No drivers selected, returning');
      return;
    }

    try {
      if (isSwapMode && swapDriverId) {
        // Swap mode: remove old driver first, then add new one
        const newDriver = selectedDrivers[0];
        console.log('Swap mode: removing', swapDriverId, 'adding', newDriver.id);

        // Remove the old driver
        await removeDriver(swapDriverId);

        // V3: Add new driver (captain selection is done separately)
        await addDriver(newDriver.id);
      } else {
        // Normal add mode - V3: no star driver logic, user selects captain separately
        for (const driver of selectedDrivers) {
          console.log('Adding driver:', driver.id, driver.name);
          await addDriver(driver.id);
        }
      }

      console.log('All drivers added, navigating back');
      router.back();
    } catch (error) {
      console.log('handleConfirm error:', error);
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
          <Text style={styles.swapBudgetInfo}>+${swapPrice} available</Text>
        </View>
      )}

      {/* Budget Header - Fixed at top */}
      <View style={styles.budgetHeader}>
        <View style={styles.budgetRow}>
          <Text style={styles.budgetTitle}>Dollars Available</Text>
          <Text style={[
            styles.budgetAmount,
            effectiveBudget < 100 && styles.budgetLow,
            effectiveBudget < 0 && styles.budgetOver,
          ]}>
            ${effectiveBudget}
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
                Selected: ${selectedTotal}
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
        <Ionicons name="search" size={20} color={COLORS.text.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search drivers..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={COLORS.text.muted}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={COLORS.text.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Smart Recommendations */}
      {!searchQuery && allDrivers && (
        <SmartRecommendations
          availableDrivers={allDrivers}
          selectedDrivers={selectedDrivers}
          currentTeamDrivers={currentTeam?.drivers.map(d => ({ driverId: d.driverId })) || []}
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
                isTopTen={topTenDriverIds.has(item.id)}
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
          {console.log('Rendering Confirm button, teamLoading:', teamLoading)}
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

  swapBudgetInfo: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.success,
  },

  budgetHeader: {
    backgroundColor: COLORS.card,
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
    color: COLORS.text.secondary,
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
    borderTopColor: COLORS.border.default,
  },

  budgetMetaText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },

  selectedSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
    paddingBottom: SPACING.md,
  },

  selectedTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.secondary,
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
    backgroundColor: COLORS.card,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    fontSize: FONTS.sizes.md,
    color: COLORS.text.primary,
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
    color: COLORS.text.muted,
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
    color: COLORS.text.muted,
  },

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
});
