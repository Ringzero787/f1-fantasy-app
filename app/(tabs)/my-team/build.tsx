import React, { useState, useMemo, useEffect } from 'react';
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
import { useDrivers, useConstructors } from '../../../src/hooks';
import { useTeamStore } from '../../../src/store/team.store';
import { Loading, DriverCard, ConstructorCard, BudgetBar, Button } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, BUDGET, TEAM_SIZE } from '../../../src/config/constants';
import type { Driver, Constructor } from '../../../src/types';

type TabType = 'drivers' | 'constructor';

export default function BuildTeamScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId?: string }>();
  const { data: allDrivers, isLoading: driversLoading } = useDrivers();
  const { data: allConstructors, isLoading: constructorsLoading } = useConstructors();
  const selectedDrivers = useTeamStore(s => s.selectedDrivers);
  const selectedConstructor = useTeamStore(s => s.selectedConstructor);
  const selectionState = useTeamStore(s => s.selectionState);
  const addDriverToSelection = useTeamStore(s => s.addDriverToSelection);
  const removeDriverFromSelection = useTeamStore(s => s.removeDriverFromSelection);
  const setSelectedConstructor = useTeamStore(s => s.setSelectedConstructor);
  const clearSelection = useTeamStore(s => s.clearSelection);
  const confirmSelection = useTeamStore(s => s.confirmSelection);
  const teamLoading = useTeamStore(s => s.isLoading);
  const error = useTeamStore(s => s.error);
  const clearError = useTeamStore(s => s.clearError);

  // Clear selection on mount to start fresh
  useEffect(() => {
    clearSelection();
  }, []);

  const [activeTab, setActiveTab] = useState<TabType>('drivers');
  const [searchQuery, setSearchQuery] = useState('');

  const remainingBudget = selectionState.remainingBudget;

  // Calculate top 10 driver IDs by 2026 season points (highest points = top positions)
  const topTenDriverIds = useMemo(() => {
    if (!allDrivers) return new Set<string>();
    const sorted = [...allDrivers].sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0));
    return new Set(sorted.slice(0, 10).map(d => d.id));
  }, [allDrivers]);

  // Filter drivers
  const availableDrivers = useMemo(() => {
    if (!allDrivers) return [];

    return allDrivers
      .filter((driver) => {
        // Exclude already selected drivers
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
  }, [allDrivers, selectedDrivers, searchQuery]);

  // Filter constructors
  const availableConstructors = useMemo(() => {
    if (!allConstructors) return [];

    return allConstructors
      .filter((constructor) => {
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            constructor.name.toLowerCase().includes(query) ||
            constructor.shortName.toLowerCase().includes(query)
          );
        }
        return true;
      })
      .sort((a, b) => b.price - a.price);
  }, [allConstructors, searchQuery]);

  const handleDriverSelect = (driver: Driver) => {
    const isSelected = selectedDrivers.some((d) => d.id === driver.id);
    if (isSelected) {
      removeDriverFromSelection(driver.id);
    } else if (selectedDrivers.length < TEAM_SIZE) {
      addDriverToSelection(driver);
    }
  };

  const handleConstructorSelect = (constructor: Constructor) => {
    const isSelected = selectedConstructor?.id === constructor.id;
    setSelectedConstructor(isSelected ? null : constructor);
  };

  const handleConfirm = async () => {
    clearError();
    try {
      await confirmSelection();
      // Navigate to league page if we came from league creation, otherwise go back
      if (leagueId) {
        router.replace(`/leagues/${leagueId}`);
      } else {
        router.back();
      }
    } catch (err) {
      // Error handled by store
    }
  };

  if (driversLoading || constructorsLoading) {
    return <Loading fullScreen message="Loading..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Fixed Budget Header */}
      <View style={styles.budgetHeader}>
        <View style={styles.budgetRow}>
          <Text style={styles.budgetLabel}>Dollars Remaining</Text>
          <Text style={[
            styles.budgetAmount,
            remainingBudget < 100 && styles.budgetLow,
            remainingBudget < 0 && styles.budgetOver,
          ]}>
            ${remainingBudget} / ${BUDGET}
          </Text>
        </View>
        <BudgetBar remaining={remainingBudget} total={BUDGET} />
        <View style={styles.selectionSummary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Drivers</Text>
            <Text style={[
              styles.summaryValue,
              selectedDrivers.length === TEAM_SIZE && styles.summaryComplete
            ]}>
              {selectedDrivers.length}/{TEAM_SIZE}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Constructor</Text>
            <Text style={[
              styles.summaryValue,
              selectedConstructor && styles.summaryComplete
            ]}>
              {selectedConstructor ? '1/1' : '0/1'}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Spent</Text>
            <Text style={styles.summaryValue}>{selectionState.totalCost} pts</Text>
          </View>
        </View>
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'drivers' && styles.activeTab]}
          onPress={() => { setActiveTab('drivers'); setSearchQuery(''); }}
        >
          <Text style={[styles.tabText, activeTab === 'drivers' && styles.activeTabText]}>
            Drivers ({selectedDrivers.length}/{TEAM_SIZE})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'constructor' && styles.activeTab]}
          onPress={() => { setActiveTab('constructor'); setSearchQuery(''); }}
        >
          <Text style={[styles.tabText, activeTab === 'constructor' && styles.activeTabText]}>
            Constructor ({selectedConstructor ? 1 : 0}/1)
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.text.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder={activeTab === 'drivers' ? 'Search drivers...' : 'Search constructors...'}
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

      {/* Selected Items */}
      {activeTab === 'drivers' && selectedDrivers.length > 0 && (
        <View style={styles.selectedSection}>
          <Text style={styles.selectedTitle}>Selected Drivers</Text>
          <View style={styles.selectedChips}>
            {selectedDrivers.map((driver) => (
              <TouchableOpacity
                key={driver.id}
                style={styles.chip}
                onPress={() => removeDriverFromSelection(driver.id)}
              >
                <Text style={styles.chipText}>{driver.shortName}</Text>
                <Text style={styles.chipPrice}>{driver.price}</Text>
                <Ionicons name="close" size={14} color={COLORS.white} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {activeTab === 'constructor' && selectedConstructor && (
        <View style={styles.selectedSection}>
          <Text style={styles.selectedTitle}>Selected Constructor</Text>
          <View style={styles.selectedChips}>
            <TouchableOpacity
              style={styles.chip}
              onPress={() => setSelectedConstructor(null)}
            >
              <Text style={styles.chipText}>{selectedConstructor.shortName}</Text>
              <Text style={styles.chipPrice}>{selectedConstructor.price}</Text>
              <Ionicons name="close" size={14} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* List */}
      {activeTab === 'drivers' ? (
        <FlatList
          data={availableDrivers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isAffordable = item.price <= remainingBudget;
            const canSelect = selectedDrivers.length < TEAM_SIZE && isAffordable;

            return (
              <View style={[!isAffordable && styles.unaffordable]}>
                <DriverCard
                  driver={item}
                  showPrice
                  showPoints
                  isSelected={false}
                  isTopTen={topTenDriverIds.has(item.id)}
                  onSelect={() => canSelect && handleDriverSelect(item)}
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
      ) : (
        <FlatList
          data={availableConstructors}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const constructorBudget = remainingBudget + (selectedConstructor?.price || 0);
            const isAffordable = item.price <= constructorBudget;
            const isSelected = selectedConstructor?.id === item.id;

            return (
              <View style={[!isAffordable && !isSelected && styles.unaffordable]}>
                <ConstructorCard
                  constructorData={item}
                  showPrice
                  showPoints
                  isSelected={isSelected}
                  onSelect={() => isAffordable && handleConstructorSelect(item)}
                />
                {!isAffordable && !isSelected && (
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
              <Text style={styles.emptyText}>No constructors found</Text>
            </View>
          }
        />
      )}

      {/* Confirm Button */}
      <View style={styles.confirmContainer}>
        <View style={styles.validationInfo}>
          {!selectionState.isValid && selectionState.validationErrors.length > 0 && (
            <Text style={styles.validationText}>
              {selectionState.validationErrors[0]}
            </Text>
          )}
        </View>
        <Button
          title="Confirm Team"
          onPress={handleConfirm}
          loading={teamLoading}
          disabled={!selectionState.isValid}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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

  budgetLabel: {
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

  selectionSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
  },

  summaryItem: {
    alignItems: 'center',
  },

  summaryLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginBottom: 2,
  },

  summaryValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  summaryComplete: {
    color: COLORS.success,
  },

  errorContainer: {
    backgroundColor: COLORS.error + '15',
    padding: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    borderRadius: 8,
  },

  errorText: {
    color: COLORS.error,
    fontSize: FONTS.sizes.sm,
    textAlign: 'center',
  },

  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    backgroundColor: COLORS.border.default,
    borderRadius: BORDER_RADIUS.md,
    padding: 4,
  },

  tab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
  },

  activeTab: {
    backgroundColor: COLORS.card,
  },

  tabText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },

  activeTabText: {
    color: COLORS.primary,
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

  selectedSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },

  selectedTitle: {
    fontSize: FONTS.sizes.sm,
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

  validationInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },

  validationText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },
});
