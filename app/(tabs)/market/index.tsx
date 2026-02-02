import React, { useState } from 'react';
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
import type { DriverFilter } from '../../../src/types';

type Tab = 'drivers' | 'constructors';
type SortOption = 'price' | 'points' | 'name' | 'priceChange';

export default function MarketScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('drivers');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('price');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const driverFilter: DriverFilter = {
    search: searchQuery,
    sortBy,
    sortOrder,
  };

  const { data: drivers, isLoading: driversLoading } = useDrivers(driverFilter);
  const { data: constructors, isLoading: constructorsLoading } = useConstructors();

  const isLoading = activeTab === 'drivers' ? driversLoading : constructorsLoading;

  const toggleSort = (option: SortOption) => {
    if (sortBy === option) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(option);
      setSortOrder('desc');
    }
  };

  const filteredConstructors = constructors?.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'drivers' && styles.activeTab]}
          onPress={() => setActiveTab('drivers')}
        >
          <Text style={[styles.tabText, activeTab === 'drivers' && styles.activeTabText]}>
            Drivers
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'constructors' && styles.activeTab]}
          onPress={() => setActiveTab('constructors')}
        >
          <Text style={[styles.tabText, activeTab === 'constructors' && styles.activeTabText]}>
            Constructors
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.gray[400]} />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search ${activeTab}...`}
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

      {/* Sort Options (Drivers only) */}
      {activeTab === 'drivers' && (
        <View style={styles.sortContainer}>
          <Text style={styles.sortLabel}>Sort by:</Text>
          <View style={styles.sortOptions}>
            {(['price', 'points', 'name'] as SortOption[]).map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.sortButton, sortBy === option && styles.sortButtonActive]}
                onPress={() => toggleSort(option)}
              >
                <Text style={[
                  styles.sortButtonText,
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
                onPress={() => router.push(`/market/driver/${item.id}`)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
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
              constructor={item}
              showPrice
              showPoints
              showPriceChange
              onPress={() => router.push(`/market/constructor/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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
    backgroundColor: COLORS.gray[50],
  },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    padding: SPACING.xs,
    margin: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
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
    color: COLORS.gray[600],
  },

  activeTabText: {
    color: COLORS.white,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
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

  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },

  sortLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[600],
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
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    gap: SPACING.xs,
  },

  sortButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },

  sortButtonText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[600],
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
