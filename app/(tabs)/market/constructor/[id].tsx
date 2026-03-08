import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useConstructor, useDriversByConstructor, useDrivers } from '../../../../src/hooks';
import { Card, Loading, EmptyState, DriverCard } from '../../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, TIER_A_THRESHOLD, TIER_B_THRESHOLD } from '../../../../src/config/constants';
import { useTheme } from '../../../../src/hooks/useTheme';
import { formatPoints, formatPriceChange } from '../../../../src/utils/formatters';

function getConstructorTier(price: number): 'A' | 'B' | 'C' {
  if (price > TIER_A_THRESHOLD) return 'A';
  if (price > TIER_B_THRESHOLD) return 'B';
  return 'C';
}

export default function ConstructorDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: constructor, isLoading, refetch } = useConstructor(id || '');
  const { data: drivers } = useDriversByConstructor(id || '');
  const { data: allDrivers } = useDrivers();
  const [refreshing, setRefreshing] = React.useState(false);

  // Calculate top 10 driver IDs by 2026 season points
  const topTenDriverIds = React.useMemo(() => {
    if (!allDrivers) return new Set<string>();
    const sorted = [...allDrivers].sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0));
    return new Set(sorted.slice(0, 10).map(d => d.id));
  }, [allDrivers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return <Loading fullScreen message="Loading constructor..." />;
  }

  if (!constructor) {
    return (
      <EmptyState
        icon="business-outline"
        title="Constructor Not Found"
        message="This constructor could not be found"
      />
    );
  }

  const priceChange = constructor.price - constructor.previousPrice;
  const priceDirection = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'neutral';
  const tier = getConstructorTier(constructor.price);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header Card */}
      <Card variant="elevated" style={styles.headerCard}>
        <View style={[styles.teamColorBar, { backgroundColor: constructor.primaryColor }]} />

        <View style={styles.headerContent}>
          <Text style={styles.constructorName}>{constructor.name}</Text>

          <View style={styles.headerMeta}>
            {constructor.nationality && (
              <View style={styles.metaChip}>
                <Ionicons name="flag-outline" size={14} color={COLORS.text.muted} />
                <Text style={styles.metaText}>{constructor.nationality}</Text>
              </View>
            )}
            {constructor.teamPrincipal && (
              <View style={styles.metaChip}>
                <Ionicons name="person-outline" size={14} color={COLORS.text.muted} />
                <Text style={styles.metaText}>{constructor.teamPrincipal}</Text>
              </View>
            )}
          </View>

          <View style={[styles.tierBadge, { backgroundColor: theme.primary + '20' }]}>
            <Text style={[styles.tierText, { color: theme.primary }]}>Tier {tier}</Text>
          </View>
        </View>
      </Card>

      {/* Price + Stats Row */}
      <View style={styles.statsRow}>
        <Card variant="outlined" style={styles.priceStatCard}>
          <Text style={styles.statCardLabel}>Price</Text>
          <Text style={styles.statCardValue}>{formatPoints(constructor.price)}</Text>
          {priceDirection !== 'neutral' && (
            <View style={[
              styles.changeBadge,
              priceDirection === 'up' ? styles.priceUp : styles.priceDown,
            ]}>
              <Ionicons
                name={priceDirection === 'up' ? 'arrow-up' : 'arrow-down'}
                size={12}
                color={COLORS.white}
              />
              <Text style={styles.changeText}>{Math.abs(priceChange)}</Text>
            </View>
          )}
        </Card>

        <Card variant="outlined" style={styles.priceStatCard}>
          <Text style={styles.statCardLabel}>Season Pts</Text>
          <Text style={[styles.statCardValue, { color: theme.primary }]}>
            {formatPoints(constructor.currentSeasonPoints || 0)}
          </Text>
        </Card>

        <Card variant="outlined" style={styles.priceStatCard}>
          <Text style={styles.statCardLabel}>Previous</Text>
          <Text style={styles.statCardValue}>
            {formatPoints(constructor.previousPrice)}
          </Text>
          <Text style={[
            styles.changeSmall,
            priceDirection === 'up' && styles.textUp,
            priceDirection === 'down' && styles.textDown,
          ]}>
            {formatPriceChange(constructor.price, constructor.previousPrice)}
          </Text>
        </Card>
      </View>

      {/* Drivers Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Drivers</Text>
        {drivers && drivers.length > 0 ? (
          drivers.map((driver) => (
            <DriverCard
              key={driver.id}
              driver={driver}
              compact
              showPrice
              showPoints
              isTopTen={topTenDriverIds.has(driver.id)}
            />
          ))
        ) : (
          <Card variant="outlined" padding="large">
            <Text style={styles.emptyText}>No drivers assigned</Text>
          </Card>
        )}
      </View>

      {/* Value Tier Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Value Tier</Text>
        <Card variant="outlined">
          <Text style={styles.tierInfoText}>
            {tier === 'A' ? (
              <>
                <Text style={styles.bold}>Tier A — Premium constructor.</Text> One of the most
                expensive picks. High points ceiling from both drivers' combined race and sprint
                results.
              </>
            ) : tier === 'B' ? (
              <>
                <Text style={styles.bold}>Tier B — Mid-range constructor.</Text> Solid combined
                output from both drivers at a reasonable price. Good balance of cost and
                performance.
              </>
            ) : (
              <>
                <Text style={styles.bold}>Tier C — Budget constructor.</Text> Lower combined
                output but frees up budget for premium drivers. Consider if you need to balance
                your team's spending.
              </>
            )}
          </Text>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },

  headerCard: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
    padding: 0,
    overflow: 'hidden',
  },

  teamColorBar: {
    width: 8,
  },

  headerContent: {
    flex: 1,
    padding: SPACING.md,
    alignItems: 'center',
  },

  constructorName: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    textAlign: 'center',
  },

  headerMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },

  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.glass.white,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },

  metaText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
  },

  tierBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.md,
  },

  tierText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
  },

  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },

  priceStatCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },

  statCardLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginBottom: SPACING.xs,
  },

  statCardValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    gap: 2,
    marginTop: SPACING.xs,
  },

  priceUp: {
    backgroundColor: COLORS.priceUp,
  },

  priceDown: {
    backgroundColor: COLORS.priceDown,
  },

  changeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.white,
  },

  changeSmall: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.text.muted,
    marginTop: SPACING.xs,
  },

  textUp: {
    color: COLORS.priceUp,
  },

  textDown: {
    color: COLORS.priceDown,
  },

  section: {
    marginBottom: SPACING.lg,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.md,
  },

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
    textAlign: 'center',
  },

  tierInfoText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    lineHeight: 22,
  },

  bold: {
    fontWeight: '600',
    color: COLORS.text.primary,
  },
});
