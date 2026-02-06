import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import type { FlatList as FlatListType } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useConstructors } from '../../../src/hooks';
import { useTeamStore } from '../../../src/store/team.store';
import { Loading, ConstructorCard, BudgetBar, Button, BudgetInsights } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, BUDGET, SHADOWS } from '../../../src/config/constants';
import type { Constructor } from '../../../src/types';

export default function SelectConstructorScreen() {
  const { data: allConstructors, isLoading } = useConstructors();
  const { currentTeam, setConstructor, isLoading: teamLoading } = useTeamStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConstructor, setSelectedConstructor] = useState<Constructor | null>(null);
  const flatListRef = useRef<FlatListType<Constructor>>(null);
  const hasScrolledRef = useRef(false);

  // Account for current constructor value if swapping
  const currentConstructorPrice = currentTeam?.constructor?.currentPrice || 0;
  const remainingBudget = (currentTeam?.budget || BUDGET) + currentConstructorPrice;

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

  const affordableConstructors = useMemo(
    () => availableConstructors.filter((c) => c.price <= remainingBudget),
    [availableConstructors, remainingBudget]
  );

  // Calculate constructor positions based on 2026 points (highest points = #1)
  const constructorPositions = useMemo(() => {
    if (!allConstructors) return new Map<string, number>();

    const sorted = [...allConstructors].sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0));
    const positions = new Map<string, number>();
    sorted.forEach((c, index) => {
      positions.set(c.id, index + 1);
    });
    return positions;
  }, [allConstructors]);

  // Smart constructor recommendations
  const recommendations = useMemo(() => {
    if (!affordableConstructors.length) return [];

    const currentId = currentTeam?.constructor?.constructorId;
    const available = affordableConstructors.filter(c => c.id !== currentId);

    if (available.length === 0) return [];

    const recs: { constructor: Constructor; tag: string; reason: string; tagColor: string }[] = [];
    const usedIds = new Set<string>();

    // Best Value - highest points per cost
    const sortedByValue = [...available].sort((a, b) =>
      ((b.currentSeasonPoints || 0) / b.price) - ((a.currentSeasonPoints || 0) / a.price)
    );
    const bestValue = sortedByValue[0];
    if (bestValue) {
      usedIds.add(bestValue.id);
      const ppm = (((bestValue.currentSeasonPoints || 0) / bestValue.price) * 100).toFixed(1);
      recs.push({
        constructor: bestValue,
        tag: 'Best Value',
        reason: `${ppm} pts per 100 spent`,
        tagColor: COLORS.success,
      });
    }

    // Top Performer - highest points overall
    const topPerformer = available
      .filter(c => !usedIds.has(c.id))
      .sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0))[0];
    if (topPerformer && (topPerformer.currentSeasonPoints || 0) > 0) {
      usedIds.add(topPerformer.id);
      recs.push({
        constructor: topPerformer,
        tag: 'Top Performer',
        reason: `${topPerformer.currentSeasonPoints || 0} pts this season`,
        tagColor: COLORS.gold || COLORS.warning,
      });
    }

    // Budget Pick - leaves more for drivers
    const budgetPick = available
      .filter(c => !usedIds.has(c.id) && c.price <= remainingBudget * 0.7)
      .sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0))[0];
    if (budgetPick) {
      const savings = Math.round(remainingBudget - budgetPick.price);
      recs.push({
        constructor: budgetPick,
        tag: 'Budget Pick',
        reason: `Saves ${savings} pts for drivers`,
        tagColor: COLORS.info,
      });
    }

    return recs;
  }, [affordableConstructors, currentTeam?.constructor?.constructorId, remainingBudget]);

  // Auto-scroll to highest affordable constructor on load
  useEffect(() => {
    if (hasScrolledRef.current || !availableConstructors.length) return;

    // Find the index of the first affordable constructor (highest priced since sorted desc)
    const firstAffordableIndex = availableConstructors.findIndex(
      (c) => c.price <= remainingBudget && c.id !== currentTeam?.constructor?.constructorId
    );

    if (firstAffordableIndex > 0 && flatListRef.current) {
      // Small delay to ensure FlatList is ready
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: firstAffordableIndex,
          animated: true,
          viewPosition: 0.1, // Position near top with some padding
        });
        hasScrolledRef.current = true;
      }, 300);
    } else {
      hasScrolledRef.current = true;
    }
  }, [availableConstructors, remainingBudget, currentTeam?.constructor?.constructorId]);

  const handleSelectConstructor = async () => {
    if (!selectedConstructor) return;

    try {
      await setConstructor(selectedConstructor.id);
      router.back();
    } catch (error) {
      // Error handled by store
    }
  };

  if (isLoading) {
    return <Loading fullScreen message="Loading constructors..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Budget Header - Fixed at top */}
      <View style={styles.budgetHeader}>
        <View style={styles.budgetRow}>
          <Text style={styles.budgetTitle}>Dollars Available</Text>
          <Text style={[
            styles.budgetAmount,
            remainingBudget < 100 && styles.budgetLow,
            remainingBudget < 0 && styles.budgetOver,
          ]}>
            ${remainingBudget}
          </Text>
        </View>
        <BudgetBar remaining={remainingBudget} total={BUDGET} />
        {currentTeam?.constructor && (
          <Text style={styles.swapNote}>
            Swapping {currentTeam.constructor.name} (+${currentConstructorPrice} returned)
          </Text>
        )}
      </View>

      {/* Budget Insights */}
      <BudgetInsights
        remainingBudget={remainingBudget}
        slotsRemaining={1}
        totalSlots={1}
      />

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.text.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search constructors..."
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

      {/* Filter info */}
      <View style={styles.filterInfo}>
        <Text style={styles.filterText}>
          {affordableConstructors.length} affordable constructors
        </Text>
      </View>

      {/* Smart Recommendations */}
      {!searchQuery && recommendations.length > 0 && (
        <View style={styles.recsContainer}>
          <View style={styles.recsHeader}>
            <View style={styles.recsHeaderLeft}>
              <Ionicons name="bulb" size={16} color={COLORS.gold || COLORS.warning} />
              <Text style={styles.recsTitle}>Smart Picks</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recsScroll}
          >
            {recommendations.map((rec) => (
              <Pressable
                key={rec.constructor.id}
                style={({ pressed }) => [
                  styles.recCard,
                  { transform: [{ scale: pressed ? 0.98 : 1 }] },
                ]}
                onPress={() => setSelectedConstructor(rec.constructor)}
              >
                <View style={[styles.recTag, { backgroundColor: rec.tagColor + '20' }]}>
                  <Text style={[styles.recTagText, { color: rec.tagColor }]}>
                    {rec.tag}
                  </Text>
                </View>
                <Text style={styles.recName} numberOfLines={1}>
                  {rec.constructor.name}
                </Text>
                <Text style={styles.recReason} numberOfLines={1}>
                  {rec.reason}
                </Text>
                <View style={styles.recPriceRow}>
                  <Text style={styles.recPrice}>{rec.constructor.price}</Text>
                  <Text style={styles.recPriceLabel}>pts</Text>
                  <Ionicons name="add-circle" size={18} color={COLORS.primary} style={styles.recAddIcon} />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Constructor List */}
      <FlatList
        ref={flatListRef}
        data={availableConstructors}
        keyExtractor={(item) => item.id}
        onScrollToIndexFailed={(info) => {
          // Fallback: scroll to approximate position if item not yet rendered
          setTimeout(() => {
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }, 100);
        }}
        renderItem={({ item }) => {
          const isAffordable = item.price <= remainingBudget;
          const isSelected = selectedConstructor?.id === item.id;
          const isCurrent = currentTeam?.constructor?.constructorId === item.id;

          return (
            <View style={[!isAffordable && styles.unaffordable]}>
              <ConstructorCard
                constructor={item}
                showPrice
                showPoints
                showPosition
                position={constructorPositions.get(item.id)}
                isSelected={isSelected || isCurrent}
                onSelect={() => {
                  if (isAffordable && !isCurrent) {
                    setSelectedConstructor(isSelected ? null : item);
                  }
                }}
              />
              {!isAffordable && (
                <View style={styles.unaffordableOverlay}>
                  <Text style={styles.unaffordableText}>Over budget</Text>
                </View>
              )}
              {isCurrent && (
                <View style={styles.currentOverlay}>
                  <Text style={styles.currentText}>Current</Text>
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

      {/* Confirm Button */}
      {selectedConstructor && (
        <View style={styles.confirmContainer}>
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedName}>{selectedConstructor.name}</Text>
            <Text style={styles.selectedPrice}>{selectedConstructor.price} pts</Text>
          </View>
          <Button
            title={currentTeam?.constructor ? 'Swap Constructor' : 'Add Constructor'}
            onPress={handleSelectConstructor}
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

  swapNote: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.accent,
    marginTop: SPACING.sm,
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

  recsContainer: {
    backgroundColor: COLORS.card,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  recsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },

  recsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  recsTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.text.primary,
  },

  recsScroll: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },

  recCard: {
    width: 150,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    marginRight: SPACING.sm,
  },

  recTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.sm,
  },

  recTagText: {
    fontSize: 10,
    fontWeight: '700',
  },

  recName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.text.primary,
    marginBottom: 2,
  },

  recReason: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginBottom: SPACING.sm,
  },

  recPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  recPrice: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },

  recPriceLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginLeft: 2,
  },

  recAddIcon: {
    marginLeft: 'auto',
  },

  listContent: {
    padding: SPACING.md,
    paddingBottom: 100,
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

  currentOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderTopRightRadius: BORDER_RADIUS.lg,
    borderBottomLeftRadius: BORDER_RADIUS.md,
  },

  currentText: {
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
