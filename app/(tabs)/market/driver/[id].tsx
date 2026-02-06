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
import { useDriver } from '../../../../src/hooks';
import { Card, Loading, EmptyState } from '../../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../../../src/config/constants';
import { formatPoints, formatPriceChange } from '../../../../src/utils/formatters';

export default function DriverDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: driver, isLoading, refetch } = useDriver(id || '');
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return <Loading fullScreen message="Loading driver..." />;
  }

  if (!driver) {
    return (
      <EmptyState
        icon="person-outline"
        title="Driver Not Found"
        message="This driver could not be found"
      />
    );
  }

  const priceChange = driver.price - driver.previousPrice;
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
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>{driver.number}</Text>
        </View>

        <Text style={styles.driverName}>{driver.name}</Text>
        <Text style={styles.teamName}>{driver.constructorName}</Text>

        <View style={styles.nationalityRow}>
          <Ionicons name="flag-outline" size={16} color={COLORS.text.muted} />
          <Text style={styles.nationality}>{driver.nationality}</Text>
        </View>

        <View style={styles.tierBadge}>
          <Text style={styles.tierText}>Tier {driver.tier}</Text>
        </View>
      </Card>

      {/* Price Card */}
      <Card variant="outlined" style={styles.priceCard}>
        <View style={styles.priceHeader}>
          <Text style={styles.priceLabel}>Current Price</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceValue}>{formatPoints(driver.price)}</Text>
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
              {formatPoints(driver.previousPrice)}
            </Text>
          </View>
          <View style={styles.priceStat}>
            <Text style={styles.priceStatLabel}>Change</Text>
            <Text style={[
              styles.priceStatValue,
              priceDirection === 'up' && styles.textUp,
              priceDirection === 'down' && styles.textDown,
            ]}>
              {formatPriceChange(driver.price, driver.previousPrice)}
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
              {formatPoints(driver.currentSeasonPoints || 0)}
            </Text>
          </View>
          <View style={[styles.statRow, styles.statBorder]}>
            <Text style={styles.statLabel}>Driver Number</Text>
            <Text style={styles.statValue}>#{driver.number}</Text>
          </View>
          <View style={[styles.statRow, styles.statBorder]}>
            <Text style={styles.statLabel}>Short Name</Text>
            <Text style={styles.statValue}>{driver.shortName}</Text>
          </View>
        </Card>
      </View>

      {/* Price Tier Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Price Tier Information</Text>
        <Card variant="outlined">
          <Text style={styles.tierInfoText}>
            {driver.tier === 'A' ? (
              <>
                <Text style={styles.bold}>Tier A drivers</Text> (price 200+) have larger
                price swings based on performance. Great performances can increase
                price by up to 15 points, while poor performances can decrease it
                by 15 points.
              </>
            ) : (
              <>
                <Text style={styles.bold}>Tier B drivers</Text> (price under 200) have
                smaller price movements. Great performances increase price by up
                to 10 points, while poor performances decrease it by 10 points.
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
    backgroundColor: COLORS.background,
  },

  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },

  headerCard: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },

  numberBadge: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },

  numberText: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  driverName: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    textAlign: 'center',
  },

  teamName: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
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
    color: COLORS.text.muted,
  },

  tierBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.md,
  },

  tierText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
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
    color: COLORS.text.muted,
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
    color: COLORS.text.primary,
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
    backgroundColor: COLORS.border.default,
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
    color: COLORS.text.muted,
  },

  priceStatValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
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
    color: COLORS.text.primary,
    marginBottom: SPACING.md,
  },

  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },

  statBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
  },

  statLabel: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
  },

  statValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
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
