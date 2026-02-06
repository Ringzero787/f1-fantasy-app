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
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../../../src/config/constants';
import { formatPoints, formatPriceChange } from '../../../../src/utils/formatters';

export default function ConstructorDetailScreen() {
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

  return (
    <ScrollView
      style={styles.container}
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
          <Text style={styles.shortName}>{constructor.shortName}</Text>

          <View style={styles.nationalityRow}>
            <Ionicons name="flag-outline" size={16} color={COLORS.gray[500]} />
            <Text style={styles.nationality}>{constructor.nationality}</Text>
          </View>
        </View>
      </Card>

      {/* Price Card */}
      <Card variant="outlined" style={styles.priceCard}>
        <View style={styles.priceHeader}>
          <Text style={styles.priceLabel}>Current Price</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceValue}>{formatPoints(constructor.price)}</Text>
            {priceDirection !== 'neutral' && (
              <View style={[
                styles.changeBadge,
                priceDirection === 'up' ? styles.priceUp : styles.priceDown,
              ]}>
                <Ionicons
                  name={priceDirection === 'up' ? 'arrow-up' : 'arrow-down'}
                  size={14}
                  color={COLORS.white}
                />
                <Text style={styles.changeText}>{Math.abs(priceChange)}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.priceDivider} />

        <View style={styles.priceStats}>
          <View style={styles.priceStat}>
            <Text style={styles.priceStatLabel}>Previous</Text>
            <Text style={styles.priceStatValue}>
              {formatPoints(constructor.previousPrice)}
            </Text>
          </View>
          <View style={styles.priceStat}>
            <Text style={styles.priceStatLabel}>Change</Text>
            <Text style={[
              styles.priceStatValue,
              priceDirection === 'up' && styles.textUp,
              priceDirection === 'down' && styles.textDown,
            ]}>
              {formatPriceChange(constructor.price, constructor.previousPrice)}
            </Text>
          </View>
        </View>
      </Card>

      {/* Stats Card */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statistics</Text>
        <Card variant="outlined">
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>2026 Season Points</Text>
            <Text style={styles.statValue}>
              {formatPoints(constructor.currentSeasonPoints || 0)}
            </Text>
          </View>
        </Card>
      </View>

      {/* Drivers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Drivers</Text>
        {drivers && drivers.length > 0 ? (
          drivers.map((driver) => (
            <DriverCard
              key={driver.id}
              driver={driver}
              compact
              showPrice
              isTopTen={topTenDriverIds.has(driver.id)}
            />
          ))
        ) : (
          <Card variant="outlined" padding="large">
            <Text style={styles.emptyText}>No drivers assigned</Text>
          </Card>
        )}
      </View>

      {/* Constructor Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About Constructor Points</Text>
        <Card variant="outlined">
          <Text style={styles.infoText}>
            Constructor points are calculated based on the combined performance
            of both team drivers. When you select a constructor, you earn fantasy
            points from both drivers' race and sprint results.
          </Text>
          <View style={styles.colorRow}>
            <Text style={styles.colorLabel}>Team Color:</Text>
            <View
              style={[styles.colorSwatch, { backgroundColor: constructor.primaryColor }]}
            />
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray[50],
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
    color: COLORS.gray[900],
    textAlign: 'center',
  },

  shortName: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[600],
    marginTop: SPACING.xs,
  },

  nationalityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },

  nationality: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
  },

  priceCard: {
    marginBottom: SPACING.lg,
  },

  priceHeader: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },

  priceLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
    marginBottom: SPACING.xs,
  },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  priceValue: {
    fontSize: FONTS.sizes.xxxl,
    fontWeight: 'bold',
    color: COLORS.gray[900],
  },

  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: 2,
  },

  priceUp: {
    backgroundColor: COLORS.priceUp,
  },

  priceDown: {
    backgroundColor: COLORS.priceDown,
  },

  changeText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.white,
  },

  priceDivider: {
    height: 1,
    backgroundColor: COLORS.gray[200],
    marginVertical: SPACING.md,
  },

  priceStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },

  priceStat: {
    alignItems: 'center',
  },

  priceStatLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[500],
  },

  priceStatValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.gray[900],
    marginTop: 2,
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
    color: COLORS.gray[900],
    marginBottom: SPACING.md,
  },

  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },

  statBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[100],
  },

  statLabel: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[600],
  },

  statValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[900],
  },

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[500],
    textAlign: 'center',
  },

  infoText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[600],
    lineHeight: 22,
    marginBottom: SPACING.md,
  },

  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  colorLabel: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[600],
  },

  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
  },
});
