import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDrivers, useConstructors } from '../../../src/hooks';
import { Loading, DriverCard, ConstructorCard, EmptyState } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../../src/config/constants';
import { useScale } from '../../../src/hooks/useScale';
import type { DriverFilter } from '../../../src/types';

type Tab = 'drivers' | 'constructors';
type SortOption = 'price' | 'points' | 'name' | 'priceChange';

export default function MarketScreen() {
  const { scaledFonts, scaledSpacing, scaledIcon } = useScale();
  const [activeTab, setActiveTab] = useState<Tab>('drivers');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('price');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const driverFilter: DriverFilter = {
    search: debouncedSearch,
    sortBy,
    sortOrder,
  };

  const { data: drivers, isLoading: driversLoading } = useDrivers(driverFilter);
  const { data: constructors, isLoading: constructorsLoading } = useConstructors();

  const isLoading = activeTab === 'drivers' ? driversLoading : constructorsLoading;

  // Calculate top 10 driver IDs by 2026 season points (highest points = top positions)
  const topTenDriverIds = React.useMemo(() => {
    if (!drivers) return new Set<string>();
    const sorted = [...drivers].sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0));
    return new Set(sorted.slice(0, 10).map(d => d.id));
  }, [drivers]);

  const toggleSort = (option: SortOption) => {
    if (sortBy === option) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(option);
      setSortOrder('desc');
    }
  };

  const filteredConstructors = constructors?.filter((c) =>
    c.name.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'drivers' && styles.activeTab]}
          onPress={() => setActiveTab('drivers')}
        >
          <Text style={[styles.tabText, { fontSize: scaledFonts.md }, activeTab === 'drivers' && styles.activeTabText]}>
            Drivers
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'constructors' && styles.activeTab]}
          onPress={() => setActiveTab('constructors')}
        >
          <Text style={[styles.tabText, { fontSize: scaledFonts.md }, activeTab === 'constructors' && styles.activeTabText]}>
            Constructors
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={scaledIcon(20)} color={COLORS.text.muted} />
        <TextInput
          style={[styles.searchInput, { fontSize: scaledFonts.md }]}
          placeholder={`Search ${activeTab}...`}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={COLORS.text.muted}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={scaledIcon(20)} color={COLORS.text.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Sort Options (Drivers only) */}
      {activeTab === 'drivers' && (
        <View style={styles.sortContainer}>
          <Text style={[styles.sortLabel, { fontSize: scaledFonts.sm }]}>Sort by:</Text>
          <View style={styles.sortOptions}>
            {(['price', 'points', 'name'] as SortOption[]).map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.sortButton, sortBy === option && styles.sortButtonActive]}
                onPress={() => toggleSort(option)}
              >
                <Text style={[
                  styles.sortButtonText,
                  { fontSize: scaledFonts.sm },
                  sortBy === option && styles.sortButtonTextActive,
                ]}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
                {sortBy === option && (
                  <Ionicons
                    name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                    size={14}
                    color={COLORS.primary}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <Loading message={`Loading ${activeTab}...`} />
      ) : activeTab === 'drivers' ? (
        drivers && drivers.length > 0 ? (
          <FlatList
            data={drivers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <DriverCard
                driver={item}
                showPrice
                showPoints
                showPriceChange
                isTopTen={topTenDriverIds.has(item.id)}
                onPress={() => router.push(`/market/driver/${item.id}`)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={10}
            windowSize={5}
            initialNumToRender={10}
          />
        ) : (
          <EmptyState
            icon="person-outline"
            title="No Drivers Found"
            message={searchQuery ? `No drivers match "${searchQuery}"` : 'No drivers available'}
          />
        )
      ) : filteredConstructors && filteredConstructors.length > 0 ? (
        <FlatList
          data={filteredConstructors}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConstructorCard
              constructorData={item}
              showPrice
              showPoints
              showPriceChange
              onPress={() => router.push(`/market/constructor/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
        />
      ) : (
        <EmptyState
          icon="business-outline"
          title="No Constructors Found"
          message={searchQuery ? `No constructors match "${searchQuery}"` : 'No constructors available'}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    padding: SPACING.xs,
    margin: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  tab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
  },

  activeTab: {
    backgroundColor: COLORS.primary,
  },

  tabText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },

  activeTabText: {
    color: COLORS.white,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
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

  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },

  sortLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginRight: SPACING.sm,
  },

  sortOptions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },

  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    gap: SPACING.xs,
  },

  sortButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },

  sortButtonText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
  },

  sortButtonTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  listContent: {
    padding: SPACING.md,
    paddingTop: 0,
  },
});
