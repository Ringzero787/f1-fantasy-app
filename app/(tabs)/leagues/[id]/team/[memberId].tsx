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
import { useTheme } from '../../../../../src/hooks/useTheme';
import { useScale } from '../../../../../src/hooks/useScale';
import { formatPoints } from '../../../../../src/utils/formatters';
import type { FantasyTeam } from '../../../../../src/types';

export default function ViewTeamScreen() {
  const theme = useTheme();
  const { scaledFonts } = useScale();
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
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <EmptyState
          icon="alert-circle-outline"
          title="Team Not Found"
          message={error || "This player hasn't created a team yet"}
        />
      </View>
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
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: COLORS.text.primary,
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
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
              <Text style={[styles.teamName, { color: COLORS.text.primary, fontSize: scaledFonts.xl }]}>{team.name}</Text>
              <View style={styles.readOnlyBadge}>
                <Ionicons name="eye-outline" size={12} color={COLORS.text.muted} />
                <Text style={[styles.readOnlyText, { color: COLORS.text.muted }]}>View Only</Text>
              </View>
            </View>
          </View>

          {/* Budget Display */}
          <View style={[styles.budgetSection, { borderTopColor: theme.border?.accent || COLORS.border.default }]}>
            <BudgetBar
              remaining={team.budget}
              total={BUDGET}
            />
            <View style={styles.budgetDetails}>
              <View style={styles.budgetItem}>
                <Text style={[styles.budgetLabel, { color: COLORS.text.muted }]}>Team Value</Text>
                <Text style={[styles.budgetValue, { color: COLORS.text.primary }]}>{formatPoints(totalValue)}</Text>
              </View>
              <View style={styles.budgetItem}>
                <Text style={[styles.budgetLabel, { color: COLORS.text.muted }]}>Remaining</Text>
                <Text style={[styles.budgetValue, { color: COLORS.text.primary }]}>{formatPoints(team.budget)}</Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Points Summary */}
        <Card variant="outlined" style={styles.pointsCard}>
          <View style={styles.pointsRow}>
            <View style={styles.pointItem}>
              <Text style={[styles.pointValue, { color: theme.primary, fontSize: scaledFonts.xxl }]}>{formatPoints(team.totalPoints || 0)}</Text>
              <Text style={[styles.pointLabel, { color: COLORS.text.muted }]}>Total Points</Text>
            </View>
          </View>
        </Card>

        {/* Team Composition Status */}
        <View style={[styles.compositionStatus, { backgroundColor: theme.card }]}>
          <View style={styles.compositionItem}>
            <Text style={[styles.compositionLabel, { color: COLORS.text.muted }]}>Drivers</Text>
            <Text style={[
              styles.compositionValue,
              { color: COLORS.text.muted },
              driversCount === TEAM_SIZE && styles.compositionComplete,
            ]}>
              {driversCount}/{TEAM_SIZE}
            </Text>
          </View>
          <View style={styles.compositionItem}>
            <Text style={[styles.compositionLabel, { color: COLORS.text.muted }]}>Constructor</Text>
            <Text style={[
              styles.compositionValue,
              { color: COLORS.text.muted },
              hasConstructor && styles.compositionComplete,
            ]}>
              {hasConstructor ? '1/1' : '0/1'}
            </Text>
          </View>
        </View>

        {/* Drivers Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: COLORS.text.primary, fontSize: scaledFonts.lg }]}>Drivers</Text>

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
                    <Text style={[styles.driverName, { color: COLORS.text.primary }]}>{driver.name}</Text>
                    <Text style={[styles.driverTeam, { color: COLORS.text.muted }]}>{driver.shortName}</Text>
                  </View>
                  <View style={styles.driverStats}>
                    <Text style={[styles.driverPoints, { color: theme.primary }]}>
                      {formatPoints(driver.pointsScored)} pts
                    </Text>
                    <Text style={[styles.driverPrice, { color: COLORS.text.muted }]}>
                      {formatPoints(driver.currentPrice)}
                    </Text>
                  </View>
                </View>
                {team.aceDriverId === driver.driverId && (
                  <View style={[styles.aceBadge, { backgroundColor: theme.primary + '20' }]}>
                    <Ionicons name="diamond" size={12} color={theme.primary} />
                    <Text style={[styles.aceBadgeText, { color: theme.primary }]}>Ace (2x)</Text>
                  </View>
                )}
                {driver.racesHeld > 0 && (
                  <View style={styles.contractRow}>
                    <Ionicons name="document-text-outline" size={10} color={COLORS.text.muted} />
                    <Text style={[styles.contractText, { color: COLORS.text.muted }]}>
                      {driver.racesHeld} race{driver.racesHeld !== 1 ? 's' : ''} held
                    </Text>
                  </View>
                )}
              </Card>
            ))
          ) : (
            <Card variant="outlined" padding="large">
              <Text style={[styles.emptyText, { color: COLORS.text.muted }]}>No drivers selected</Text>
            </Card>
          )}
        </View>

        {/* Constructor Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: COLORS.text.primary, fontSize: scaledFonts.lg }]}>Constructor</Text>

          {team.constructor ? (
            <Card variant="outlined" padding="medium" style={styles.constructorItem}>
              <View style={styles.constructorInfo}>
                <Text style={[styles.constructorName, { color: COLORS.text.primary }]}>
                  {team.constructor.name}
                </Text>
                <View style={styles.constructorStats}>
                  <Text style={[styles.constructorPoints, { color: theme.primary }]}>
                    {formatPoints(team.constructor.pointsScored)} pts
                  </Text>
                  <Text style={[styles.constructorPrice, { color: COLORS.text.muted }]}>
                    {formatPoints(team.constructor.currentPrice)}
                  </Text>
                </View>
              </View>
              {team.aceConstructorId === team.constructor.constructorId && (
                <View style={[styles.aceBadge, { backgroundColor: theme.primary + '20' }]}>
                  <Ionicons name="diamond" size={12} color={theme.primary} />
                  <Text style={[styles.aceBadgeText, { color: theme.primary }]}>Ace (2x)</Text>
                </View>
              )}
            </Card>
          ) : (
            <Card variant="outlined" padding="large">
              <Text style={[styles.emptyText, { color: COLORS.text.muted }]}>No constructor selected</Text>
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
  },
  readOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  readOnlyText: {
    fontSize: FONTS.sizes.xs,
  },
  budgetSection: {
    paddingTop: SPACING.md,
    borderTopWidth: 1,
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
  },
  budgetValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
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
  },
  pointLabel: {
    fontSize: FONTS.sizes.sm,
  },
  compositionStatus: {
    flexDirection: 'row',
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
  },
  compositionValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
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
  },
  driverTeam: {
    fontSize: FONTS.sizes.sm,
  },
  driverStats: {
    alignItems: 'flex-end',
  },
  driverPoints: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
  },
  driverPrice: {
    fontSize: FONTS.sizes.sm,
  },
  aceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  aceBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },
  contractRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.xs,
  },
  contractText: {
    fontSize: FONTS.sizes.xs,
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
    flex: 1,
  },
  constructorStats: {
    alignItems: 'flex-end',
  },
  constructorPoints: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
  },
  constructorPrice: {
    fontSize: FONTS.sizes.sm,
  },
  emptyText: {
    fontSize: FONTS.sizes.md,
    textAlign: 'center',
  },
});
