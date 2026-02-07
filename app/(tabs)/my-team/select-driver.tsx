import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDrivers } from '../../../src/hooks';
import { useTeamStore } from '../../../src/store/team.store';
import { Loading, DriverCard, Button, SmartRecommendations } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, BUDGET, TEAM_SIZE } from '../../../src/config/constants';
import type { Driver } from '../../../src/types';

export default function SelectDriverScreen() {
  const { swapDriverId, swapDriverPrice } = useLocalSearchParams<{
    swapDriverId?: string;
    swapDriverPrice?: string;
  }>();

  const { data: allDrivers, isLoading } = useDrivers();
  const { currentTeam, addDriver, removeDriver, isLoading: teamLoading } = useTeamStore();

  const topTenDriverIds = useMemo(() => {
    if (!allDrivers) return new Set<string>();
    const sorted = [...allDrivers].sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0));
    return new Set(sorted.slice(0, 10).map(d => d.id));
  }, [allDrivers]);

  const [selectedDrivers, setSelectedDrivers] = useState<Driver[]>([]);

  // Refs for auto-save on unmount
  const selectedDriversRef = useRef<Driver[]>([]);
  const confirmedRef = useRef(false);

  useEffect(() => {
    selectedDriversRef.current = selectedDrivers;
  }, [selectedDrivers]);

  useEffect(() => {
    return () => {
      if (confirmedRef.current) return;
      const pending = selectedDriversRef.current;
      if (pending.length === 0) return;

      (async () => {
        try {
          if (isSwapMode && swapDriverId && pending.length > 0) {
            await removeDriver(swapDriverId);
            await addDriver(pending[0].id);
          } else {
            for (const driver of pending) {
              await addDriver(driver.id);
            }
          }
        } catch {
          // Best effort
        }
      })();
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
      .sort((a, b) => b.price - a.price);
  }, [allDrivers, currentDriverIds, selectedDrivers]);

  const affordableDrivers = useMemo(
    () => availableDrivers.filter((d) => d.price <= effectiveBudget),
    [availableDrivers, effectiveBudget]
  );

  const handleToggleDriver = (driver: Driver) => {
    const isSelected = selectedDrivers.some((d) => d.id === driver.id);

    if (isSelected) {
      setSelectedDrivers(selectedDrivers.filter((d) => d.id !== driver.id));
    } else {
      if (selectedDrivers.length >= maxSelectableDrivers) return;
      if (driver.price > effectiveBudget) return;
      setSelectedDrivers([...selectedDrivers, driver]);
    }
  };

  const handleRemoveSelected = (driverId: string) => {
    setSelectedDrivers(selectedDrivers.filter((d) => d.id !== driverId));
  };

  const handleConfirm = async () => {
    if (selectedDrivers.length === 0) return;

    confirmedRef.current = true;

    try {
      if (isSwapMode && swapDriverId) {
        const newDriver = selectedDrivers[0];
        await removeDriver(swapDriverId);
        await addDriver(newDriver.id);
      } else {
        for (const driver of selectedDrivers) {
          await addDriver(driver.id);
        }
      }

      router.back();
    } catch (error) {
      confirmedRef.current = false;
    }
  };

  if (isLoading) {
    return <Loading fullScreen message="Loading drivers..." />;
  }

  const swappingDriverName = isSwapMode
    ? currentTeam?.drivers.find(d => d.driverId === swapDriverId)?.name
    : null;

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

      {/* Selected Drivers Chips */}
      {selectedDrivers.length > 0 && (
        <View style={styles.selectedSection}>
          {selectedDrivers.map((driver) => (
            <TouchableOpacity
              key={driver.id}
              style={styles.chip}
              onPress={() => handleRemoveSelected(driver.id)}
            >
              <Text style={styles.chipText}>{driver.shortName}</Text>
              <Text style={styles.chipPrice}>${driver.price}</Text>
              <Ionicons name="close" size={14} color={COLORS.white} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Smart Recommendations */}
      {allDrivers && slotsLeft > 0 && (
        <SmartRecommendations
          availableDrivers={allDrivers}
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
      {/* Sticky budget counter */}
      <View style={styles.budgetBar}>
        <Text style={styles.budgetLabel}>
          ${effectiveBudget}
        </Text>
        <Text style={styles.budgetMeta}>
          {slotsLeft} slot{slotsLeft !== 1 ? 's' : ''} left
        </Text>
      </View>

      {/* Driver list with header */}
      <FlatList
        data={affordableDrivers}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => {
          const canSelect = selectedDrivers.length < maxSelectableDrivers && item.price <= effectiveBudget;

          return (
            <View style={styles.driverItem}>
              <DriverCard
                driver={item}
                showPrice
                showPoints
                isSelected={false}
                isTopTen={topTenDriverIds.has(item.id)}
                onSelect={() => canSelect && handleToggleDriver(item)}
              />
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No affordable drivers</Text>
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
                ? `$${selectedTotal} (saves $${swapPrice - selectedTotal})`
                : `$${selectedTotal}`}
            </Text>
          </View>
          <Button
            title={isSwapMode ? 'Swap' : `Add ${selectedDrivers.length}`}
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

  selectedSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
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

  driverItem: {
    marginHorizontal: SPACING.md,
  },

  listContent: {
    paddingBottom: 120,
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
