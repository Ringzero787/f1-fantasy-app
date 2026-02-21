import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSeasonRaces } from '../../../src/hooks';
import { Loading, RaceCard, EmptyState } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../../src/config/constants';
import { useTheme } from '../../../src/hooks/useTheme';
import type { Race } from '../../../src/types';

const CURRENT_SEASON_ID = '2026';

type FilterOption = 'all' | 'upcoming' | 'completed';

export default function CalendarScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState<FilterOption>('all');
  const { data: races, isLoading, refetch } = useSeasonRaces(CURRENT_SEASON_ID);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const filteredRaces = races?.filter((race) => {
    if (filter === 'all') return true;
    if (filter === 'upcoming') return race.status === 'upcoming' || race.status === 'in_progress';
    if (filter === 'completed') return race.status === 'completed';
    return true;
  });

  // Group races by status for section list
  const sections = React.useMemo(() => {
    if (!filteredRaces) return [];

    const upcoming = filteredRaces.filter(
      (r) => r.status === 'upcoming' || r.status === 'in_progress'
    );
    const completed = filteredRaces.filter((r) => r.status === 'completed');

    const result = [];
    if (upcoming.length > 0) {
      result.push({ title: 'Upcoming', data: upcoming });
    }
    if (completed.length > 0) {
      result.push({ title: 'Completed', data: completed });
    }
    return result;
  }, [filteredRaces]);

  if (isLoading && !refreshing) {
    return <Loading fullScreen message="Loading calendar..." />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Filter Tabs */}
      <View style={[styles.filterContainer, { backgroundColor: theme.card }]}>
        {(['all', 'upcoming', 'completed'] as FilterOption[]).map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.filterButton, filter === option && styles.filterButtonActive, filter === option && { backgroundColor: theme.primary }]}
            onPress={() => setFilter(option)}
          >
            <Text
              style={[
                styles.filterButtonText,
                filter === option && styles.filterButtonTextActive,
              ]}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Race Count */}
      {filteredRaces && (
        <View style={styles.countContainer}>
          <Text style={styles.countText}>
            {filteredRaces.length} race{filteredRaces.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Races List */}
      {sections.length > 0 ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RaceCard
              race={item}
              onPress={() => router.push(`/calendar/${item.id}`)}
              showCountdown={item.status === 'upcoming'}
            />
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{title}</Text>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <EmptyState
          icon="calendar-outline"
          title="No Races Found"
          message={
            filter === 'upcoming'
              ? 'No upcoming races scheduled'
              : filter === 'completed'
              ? 'No completed races yet'
              : 'No races in the calendar'
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: undefined, // themed via inline style
  },

  filterContainer: {
    flexDirection: 'row',
    backgroundColor: undefined, // themed via inline style
    margin: SPACING.md,
    padding: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  filterButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
  },

  filterButtonActive: {
    backgroundColor: COLORS.primary,
  },

  filterButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    color: COLORS.text.secondary,
  },

  filterButtonTextActive: {
    color: COLORS.white,
  },

  countContainer: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },

  countText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },

  listContent: {
    padding: SPACING.md,
    paddingTop: 0,
  },

  sectionHeader: {
    paddingVertical: SPACING.sm,
    marginTop: SPACING.md,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
});
