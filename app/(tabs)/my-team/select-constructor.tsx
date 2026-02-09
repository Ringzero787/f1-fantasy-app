import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConstructors } from '../../../src/hooks';
import { useTeamStore } from '../../../src/store/team.store';
import { Loading, ConstructorCard } from '../../../src/components';
import { COLORS, SPACING, FONTS, BUDGET } from '../../../src/config/constants';
import type { Constructor, FantasyConstructor, FantasyTeam } from '../../../src/types';

export default function SelectConstructorScreen() {
  const { data: allConstructors, isLoading } = useConstructors();
  const { currentTeam } = useTeamStore();

  // Account for current constructor value if swapping
  const currentConstructorPrice = currentTeam?.constructor?.currentPrice || 0;
  const remainingBudget = (currentTeam?.budget || BUDGET) + currentConstructorPrice;

  const affordableConstructors = useMemo(() => {
    if (!allConstructors) return [];
    const currentId = currentTeam?.constructor?.constructorId;
    return allConstructors
      .filter((c) => c.price <= remainingBudget && c.id !== currentId)
      .sort((a, b) => b.price - a.price);
  }, [allConstructors, remainingBudget, currentTeam?.constructor?.constructorId]);

  const handleSelectConstructor = (item: Constructor) => {
    if (item.price > remainingBudget) return;
    const team = useTeamStore.getState().currentTeam;
    if (!team) return;

    const oldConstructorPrice = team.constructor?.purchasePrice || 0;
    const priceDiff = item.price - oldConstructorPrice;

    const fantasyConstructor: FantasyConstructor = {
      constructorId: item.id,
      name: item.name,
      purchasePrice: item.price,
      currentPrice: item.price,
      pointsScored: 0,
      racesHeld: 0,
    };

    const updatedTeam: FantasyTeam = {
      ...team,
      constructor: fantasyConstructor,
      totalSpent: team.totalSpent + priceDiff,
      budget: team.budget - priceDiff,
      updatedAt: new Date(),
    };
    useTeamStore.getState().setCurrentTeam(updatedTeam);
    router.back();
  };

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

      {/* Constructor List */}
      <FlatList
        data={affordableConstructors}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.constructorItem}>
            <ConstructorCard
              constructor={item}
              showPrice
              showPoints
              onSelect={() => handleSelectConstructor(item)}
            />
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No affordable constructors</Text>
          </View>
        }
      />
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

  listContent: {
    paddingTop: SPACING.md,
    paddingBottom: 40,
  },

  emptyContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
  },
});
