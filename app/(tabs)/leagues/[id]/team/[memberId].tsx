import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { teamService } from '../../../../../src/services/team.service';
import { Card, Loading, EmptyState, BudgetBar, Avatar } from '../../../../../src/components';
import { COLORS, SPACING, FONTS, BUDGET, TEAM_SIZE, BORDER_RADIUS } from '../../../../../src/config/constants';
import { formatPoints } from '../../../../../src/utils/formatters';
import type { FantasyTeam } from '../../../../../src/types';

export default function ViewTeamScreen() {
  const { id: leagueId, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();

  const [team, setTeam] = useState<FantasyTeam | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTeam = async () => {
    if (!memberId || !leagueId) return;

    try {
      setError(null);
      const fetchedTeam = await teamService.getUserTeamInLeague(memberId, leagueId);
      setTeam(fetchedTeam);
    } catch (err) {
      console.error('Error loading team:', err);
      setError('Failed to load team');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTeam();
  }, [memberId, leagueId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTeam();
    setRefreshing(false);
  };

  if (isLoading) {
    return <Loading fullScreen message="Loading team..." />;
  }

  if (error || !team) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Team Not Found"
        message={error || "This player hasn't created a team yet"}
      />
    );
  }

  const driversCount = team.drivers?.length || 0;
  const hasConstructor = !!team.constructor;
  const totalValue = (team.drivers?.reduce((sum, d) => sum + d.currentPrice, 0) || 0) +
                     (team.constructor?.currentPrice || 0);

  return (
    <>
      <Stack.Screen
        options={{
          title: team.name || 'View Team',
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* Team Header */}
        <Card variant="elevated" style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Avatar
              name={team.name}
              size="large"
              variant="team"
              imageUrl={team.avatarUrl}
            />
            <View style={styles.headerInfo}>
              <Text style={styles.teamName}>{team.name}</Text>
              <View style={styles.readOnlyBadge}>
                <Ionicons name="eye-outline" size={12} color={COLORS.gray[500]} />
                <Text style={styles.readOnlyText}>View Only</Text>
              </View>
            </View>
          </View>

          {/* Budget Display */}
          <View style={styles.budgetSection}>
            <BudgetBar
              used={BUDGET.INITIAL - team.budget}
              total={BUDGET.INITIAL}
              showLabels
            />
            <View style={styles.budgetDetails}>
              <View style={styles.budgetItem}>
                <Text style={styles.budgetLabel}>Team Value</Text>
                <Text style={styles.budgetValue}>{formatPoints(totalValue)}</Text>
              </View>
              <View style={styles.budgetItem}>
                <Text style={styles.budgetLabel}>Remaining</Text>
                <Text style={styles.budgetValue}>{formatPoints(team.budget)}</Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Points Summary */}
        <Card variant="outlined" style={styles.pointsCard}>
          <View style={styles.pointsRow}>
            <View style={styles.pointItem}>
              <Text style={styles.pointValue}>{formatPoints(team.totalPoints || 0)}</Text>
              <Text style={styles.pointLabel}>Total Points</Text>
            </View>
          </View>
        </Card>

        {/* Team Composition Status */}
        <View style={styles.compositionStatus}>
          <View style={styles.compositionItem}>
            <Text style={styles.compositionLabel}>Drivers</Text>
            <Text style={[
              styles.compositionValue,
              driversCount === TEAM_SIZE && styles.compositionComplete,
            ]}>
              {driversCount}/{TEAM_SIZE}
            </Text>
          </View>
          <View style={styles.compositionItem}>
            <Text style={styles.compositionLabel}>Constructor</Text>
            <Text style={[
              styles.compositionValue,
              hasConstructor && styles.compositionComplete,
            ]}>
              {hasConstructor ? '1/1' : '0/1'}
            </Text>
          </View>
        </View>

        {/* Drivers Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Drivers</Text>

          {team.drivers && team.drivers.length > 0 ? (
            team.drivers.map((driver) => (
              <Card
                key={driver.driverId}
                variant="outlined"
                padding="medium"
                style={styles.driverItem}
              >
                <View style={styles.driverInfo}>
                  <View style={styles.driverMain}>
                    <Text style={styles.driverName}>{driver.name}</Text>
                    <Text style={styles.driverTeam}>{driver.shortName}</Text>
                  </View>
                  <View style={styles.driverStats}>
                    <Text style={styles.driverPoints}>
                      {formatPoints(driver.pointsScored)} pts
                    </Text>
                    <Text style={styles.driverPrice}>
                      {formatPoints(driver.currentPrice)}
                    </Text>
                  </View>
                </View>
                {driver.isStarDriver && (
                  <View style={styles.starBadge}>
                    <Ionicons name="star" size={12} color={COLORS.gold} />
                    <Text style={styles.starBadgeText}>Star Driver (+50%)</Text>
                  </View>
                )}
                {driver.racesHeld > 0 && (
                  <Text style={styles.lockBonus}>
                    Lock bonus: {driver.racesHeld} race(s)
                  </Text>
                )}
              </Card>
            ))
          ) : (
            <Card variant="outlined" padding="large">
              <Text style={styles.emptyText}>No drivers selected</Text>
            </Card>
          )}
        </View>

        {/* Constructor Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Constructor</Text>

          {team.constructor ? (
            <Card variant="outlined" padding="medium" style={styles.constructorItem}>
              <View style={styles.constructorInfo}>
                <Text style={styles.constructorName}>
                  {team.constructor.name}
                </Text>
                <View style={styles.constructorStats}>
                  <Text style={styles.constructorPoints}>
                    {formatPoints(team.constructor.pointsScored)} pts
                  </Text>
                  <Text style={styles.constructorPrice}>
                    {formatPoints(team.constructor.currentPrice)}
                  </Text>
                </View>
              </View>
              {team.constructor.isStarDriver && (
                <View style={styles.starBadge}>
                  <Ionicons name="star" size={12} color={COLORS.gold} />
                  <Text style={styles.starBadgeText}>Star Constructor (+50%)</Text>
                </View>
              )}
            </Card>
          ) : (
            <Card variant="outlined" padding="large">
              <Text style={styles.emptyText}>No constructor selected</Text>
            </Card>
          )}
        </View>
      </ScrollView>
    </>
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
    marginBottom: SPACING.md,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  headerInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.gray[900],
  },
  readOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  readOnlyText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[500],
  },
  budgetSection: {
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[100],
  },
  budgetDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  budgetItem: {
    alignItems: 'center',
  },
  budgetLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[500],
  },
  budgetValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[900],
  },
  pointsCard: {
    marginBottom: SPACING.md,
  },
  pointsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  pointItem: {
    alignItems: 'center',
  },
  pointValue: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  pointLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
  },
  compositionStatus: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.lg,
  },
  compositionItem: {
    flex: 1,
    alignItems: 'center',
  },
  compositionLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
  },
  compositionValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.gray[400],
  },
  compositionComplete: {
    color: COLORS.success,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.gray[900],
    marginBottom: SPACING.sm,
  },
  driverItem: {
    marginBottom: SPACING.sm,
  },
  driverInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  driverMain: {
    flex: 1,
  },
  driverName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[900],
  },
  driverTeam: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
  },
  driverStats: {
    alignItems: 'flex-end',
  },
  driverPoints: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.primary,
  },
  driverPrice: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
  },
  starBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.gold + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  starBadgeText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gold,
    fontWeight: '600',
  },
  lockBonus: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[500],
    marginTop: SPACING.xs,
  },
  constructorItem: {
    marginBottom: SPACING.sm,
  },
  constructorInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  constructorName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[900],
    flex: 1,
  },
  constructorStats: {
    alignItems: 'flex-end',
  },
  constructorPoints: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.primary,
  },
  constructorPrice: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
  },
  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[500],
    textAlign: 'center',
  },
});
