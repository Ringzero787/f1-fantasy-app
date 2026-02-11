import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/hooks/useAuth';
import { useNextRace, useTopDrivers } from '../../src/hooks';
import { useTeamStore } from '../../src/store/team.store';
import { useLeagueStore } from '../../src/store/league.store';
import { useAdminStore } from '../../src/store/admin.store';
import { Card, Loading, RaceCard, DriverCard, EmptyState, CountdownBanner } from '../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, TEAM_SIZE } from '../../src/config/constants';
import { formatPoints } from '../../src/utils/formatters';

const CURRENT_SEASON_ID = '2026'; // This would come from app config

export default function HomeScreen() {
  const { user } = useAuth();
  const { data: nextRace, isLoading: raceLoading, refetch: refetchRace } = useNextRace(CURRENT_SEASON_ID);
  const { data: topDrivers, isLoading: driversLoading, refetch: refetchDrivers } = useTopDrivers(5);
  const currentTeam = useTeamStore(s => s.currentTeam);
  const userTeams = useTeamStore(s => s.userTeams);
  const selectTeam = useTeamStore(s => s.selectTeam);
  const loadUserTeams = useTeamStore(s => s.loadUserTeams);
  const leagues = useLeagueStore(s => s.leagues);
  const loadUserLeagues = useLeagueStore(s => s.loadUserLeagues);
  const raceResults = useAdminStore(s => s.raceResults);

  const [refreshing, setRefreshing] = React.useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Sort drivers based on current sort order (using 2026 points)
  const sortedTopDrivers = useMemo(() => {
    if (!topDrivers) return [];
    const sorted = [...topDrivers].sort((a, b) => {
      const pointsA = a.currentSeasonPoints || 0;
      const pointsB = b.currentSeasonPoints || 0;
      return sortOrder === 'desc' ? pointsB - pointsA : pointsA - pointsB;
    });
    return sorted.slice(0, 3);
  }, [topDrivers, sortOrder]);

  // Load user's leagues and teams on mount
  React.useEffect(() => {
    if (user) {
      loadUserLeagues(user.id);
      loadUserTeams(user.id);
    }
  }, [user]);

  // Get the first league the user is in
  const primaryLeague = leagues.length > 0 ? leagues[0] : null;

  // Calculate team stats
  const teamDriverCount = currentTeam?.drivers.length || 0;
  const hasConstructor = !!currentTeam?.constructor;
  // V3: Captain system - find the captain driver
  const captainDriver = currentTeam?.captainDriverId
    ? currentTeam.drivers.find(d => d.driverId === currentTeam.captainDriverId)
    : null;
  const isTeamComplete = teamDriverCount === TEAM_SIZE && hasConstructor;

  // Calculate actual stats
  const totalPoints = currentTeam?.totalPoints || 0;

  // Last race points
  const lastRacePoints = useMemo(() => {
    const completedRaces = Object.entries(raceResults)
      .filter(([_, result]) => result.isComplete)
      .sort((a, b) => b[0].localeCompare(a[0]));
    if (completedRaces.length === 0 || !currentTeam) return null;
    const [_, lastResult] = completedRaces[0];
    let pts = 0;
    currentTeam.drivers.forEach(driver => {
      const dr = lastResult.driverResults.find((r: any) => r.driverId === driver.driverId);
      if (dr) {
        const multiplier = currentTeam.captainDriverId === driver.driverId ? 2 : 1;
        pts += Math.floor(dr.points * multiplier);
      }
    });
    if (currentTeam.constructor) {
      const cr = lastResult.constructorResults.find(
        (r: any) => r.constructorId === currentTeam.constructor?.constructorId
      );
      if (cr) pts += cr.points;
    }
    return pts;
  }, [raceResults, currentTeam]);

  // League rank for badge
  const leagueRank = useMemo(() => {
    if (!currentTeam?.leagueId || !primaryLeague) return null;
    const leagueTeams = userTeams.filter(t => t.leagueId === currentTeam.leagueId);
    const sorted = [...leagueTeams].sort((a, b) => b.totalPoints - a.totalPoints);
    const idx = sorted.findIndex(t => t.id === currentTeam.id);
    return idx !== -1 ? idx + 1 : null;
  }, [currentTeam, primaryLeague, userTeams]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchRace(), refetchDrivers()]);
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Welcome Section */}
      <View style={styles.welcomeSection}>
        <View style={styles.welcomeLeft}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.displayName || 'Racer'}</Text>
        </View>
        {primaryLeague ? (
          <TouchableOpacity
            style={styles.leagueBadge}
            onPress={() => router.push(`/leagues/${primaryLeague.id}`)}
          >
            <Ionicons name="trophy" size={14} color={COLORS.accent} />
            <Text style={styles.leagueBadgeText} numberOfLines={1}>
              {leagueRank ? `#${leagueRank} ` : ''}{primaryLeague.name}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.joinLeagueBadge}
            onPress={() => router.push('/leagues')}
          >
            <Ionicons name="trophy-outline" size={14} color={COLORS.primary} />
            <Text style={styles.joinLeagueBadgeText}>Join League</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <Card style={styles.statCard} variant="elevated">
          <Text style={styles.statValue}>{formatPoints(totalPoints)}</Text>
          <Text style={styles.statLabel}>Total Points</Text>
          {currentTeam && (
            <Text style={styles.statTeamName} numberOfLines={1}>
              {currentTeam.name}
            </Text>
          )}
        </Card>
        <Card style={styles.statCard} variant="elevated">
          <Text style={[styles.statValue, lastRacePoints != null && lastRacePoints > 0 && styles.lastRacePositive]}>
            {lastRacePoints != null ? `+${lastRacePoints}` : '-'}
          </Text>
          <Text style={styles.statLabel}>Last Race</Text>
        </Card>
        <Card style={styles.statCard} variant="elevated">
          <Text style={styles.statValue}>${formatPoints(currentTeam?.budget || 0)}</Text>
          <Text style={styles.statLabel}>Bank</Text>
        </Card>
      </View>

      {/* Race Countdown Banner */}
      {nextRace && <CountdownBanner race={nextRace} />}

      {/* Next Race */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Next Race</Text>
        {raceLoading ? (
          <Loading />
        ) : nextRace ? (
          <RaceCard
            race={nextRace}
            onPress={() => router.push(`/calendar/${nextRace.id}`)}
            showCountdown
          />
        ) : (
          <Card variant="outlined" padding="large">
            <Text style={styles.emptyText}>No upcoming races</Text>
          </Card>
        )}
      </View>

      {/* My Teams Summary */}
      <TouchableOpacity
        style={styles.section}
        activeOpacity={0.7}
        onPress={() => router.push('/my-team')}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Teams</Text>
          <View style={styles.manageButton}>
            <Ionicons name="settings-outline" size={18} color={COLORS.primary} />
            <Text style={styles.manageButtonText}>Manage</Text>
          </View>
        </View>

        {currentTeam ? (
          <Card variant="elevated" style={styles.teamSummaryCard}>
            <View style={styles.teamHeader}>
              <Text style={styles.teamName}>{currentTeam.name}</Text>
              <View style={styles.teamBudget}>
                <Text style={styles.budgetLabel}>Budget</Text>
                <Text style={styles.budgetValue}>{formatPoints(currentTeam.budget)}</Text>
              </View>
            </View>

            {/* Team Status Banner - Shows if incomplete */}
            {!isTeamComplete && (
              <View style={styles.incompleteTeamBanner}>
                <Ionicons name="alert-circle" size={16} color={COLORS.warning} />
                <Text style={styles.incompleteTeamText}>
                  {teamDriverCount < TEAM_SIZE && !hasConstructor
                    ? `Add ${TEAM_SIZE - teamDriverCount} driver${TEAM_SIZE - teamDriverCount > 1 ? 's' : ''} and a constructor`
                    : teamDriverCount < TEAM_SIZE
                    ? `Add ${TEAM_SIZE - teamDriverCount} more driver${TEAM_SIZE - teamDriverCount > 1 ? 's' : ''}`
                    : 'Select a constructor'}
                </Text>
              </View>
            )}

            {/* Drivers Row */}
            <View style={styles.teamRow}>
              <View style={styles.teamRowLeft}>
                <Ionicons name="people" size={18} color={teamDriverCount < TEAM_SIZE ? COLORS.warning : COLORS.text.muted} />
                <Text style={styles.teamRowLabel}>Drivers</Text>
              </View>
              <Text style={[styles.teamRowValue, teamDriverCount < TEAM_SIZE && styles.incompleteValue]}>
                {teamDriverCount}/{TEAM_SIZE}
              </Text>
            </View>

            {/* Constructor Row */}
            <View style={styles.teamRow}>
              <View style={styles.teamRowLeft}>
                <Ionicons name="car-sport" size={18} color={!hasConstructor ? COLORS.warning : COLORS.text.muted} />
                <Text style={styles.teamRowLabel}>Constructor</Text>
              </View>
              <Text style={[styles.teamRowValue, !hasConstructor && styles.incompleteValue]}>
                {currentTeam.constructor?.name || 'Not selected'}
              </Text>
            </View>

            {/* Ace Selection Row */}
            <View style={styles.teamRow}>
              <View style={styles.teamRowLeft}>
                <Ionicons name="diamond" size={18} color={COLORS.gold} />
                <Text style={styles.teamRowLabel}>Ace (2x)</Text>
              </View>
              <Text style={[styles.teamRowValue, captainDriver && styles.captainText]}>
                {captainDriver?.name || 'Not selected'}
              </Text>
            </View>

            {/* Total Points Row */}
            <View style={[styles.teamRow, styles.teamRowLast]}>
              <View style={styles.teamRowLeft}>
                <Ionicons name="podium" size={18} color={COLORS.primary} />
                <Text style={styles.teamRowLabel}>Total Points</Text>
              </View>
              <Text style={[styles.teamRowValue, styles.pointsValue]}>
                {formatPoints(currentTeam.totalPoints)}
              </Text>
            </View>

            {/* Complete Team Button if incomplete */}
            {!isTeamComplete && (
              <View style={styles.completeTeamButton}>
                <Text style={styles.completeTeamButtonText}>Complete Your Team</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
              </View>
            )}
          </Card>
        ) : (
          <Card variant="outlined" padding="large">
            <View style={styles.noTeamContainer}>
              <Ionicons name="people-outline" size={32} color={COLORS.text.muted} />
              <Text style={styles.noTeamText}>No team created yet</Text>
              <View style={styles.createTeamButton}>
                <Text style={styles.createTeamButtonText}>Create Team</Text>
              </View>
            </View>
          </Card>
        )}
      </TouchableOpacity>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/my-team')}
          >
            <View style={[styles.actionIcon, { backgroundColor: COLORS.success + '20' }]}>
              <Ionicons name="people" size={24} color={COLORS.success} />
            </View>
            <Text style={styles.actionText}>Manage Teams</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/leagues')}
          >
            <View style={[styles.actionIcon, { backgroundColor: COLORS.accent + '20' }]}>
              <Ionicons name="trophy" size={24} color={COLORS.accent} />
            </View>
            <Text style={styles.actionText}>Join League</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/market')}
          >
            <View style={[styles.actionIcon, { backgroundColor: COLORS.warning + '20' }]}>
              <Ionicons name="trending-up" size={24} color={COLORS.warning} />
            </View>
            <Text style={styles.actionText}>View Market</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Top Performers */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>2026 Top Performers</Text>
            <TouchableOpacity
              style={styles.sortToggle}
              onPress={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            >
              <Ionicons
                name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
                size={16}
                color={COLORS.primary}
              />
              <Text style={styles.sortToggleText}>
                {sortOrder === 'desc' ? 'High' : 'Low'}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => router.push('/market')}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {driversLoading ? (
          <Loading />
        ) : sortedTopDrivers && sortedTopDrivers.length > 0 ? (
          sortedTopDrivers.map((driver) => (
            <DriverCard
              key={driver.id}
              driver={driver}
              compact
              showPrice
              showPoints
              isTopTen={true}
              onPress={() => router.push(`/market/${driver.id}`)}
            />
          ))
        ) : (
          <Card variant="outlined" padding="large">
            <Text style={styles.emptyText}>No driver data available</Text>
          </Card>
        )}
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

  welcomeSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },

  welcomeLeft: {
    flex: 1,
  },

  greeting: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
  },

  userName: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  leagueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
    maxWidth: 140,
  },

  leagueBadgeText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.accent,
  },

  joinLeagueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
  },

  joinLeagueBadgeText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },

  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },

  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: SPACING.md,
  },

  statValue: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  statLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: SPACING.xs,
  },

  statTeamName: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.accent,
    marginTop: 2,
    fontWeight: '500',
    textAlign: 'center',
  },

  lastRacePositive: {
    color: COLORS.success,
  },

  section: {
    marginBottom: SPACING.lg,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  sortToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },

  sortToggleText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },

  seeAllText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    fontWeight: '500',
  },

  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.primary + '15',
    borderRadius: BORDER_RADIUS.button,
  },

  manageButtonText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.primary,
    fontWeight: '600',
  },

  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },

  actionButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },

  actionText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    color: COLORS.text.secondary,
    textAlign: 'center',
  },

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
    textAlign: 'center',
  },

  // Team Summary Styles
  teamSummaryCard: {
    padding: SPACING.md,
  },

  teamHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  teamName: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
    flex: 1,
  },

  teamBudget: {
    alignItems: 'flex-end',
  },

  budgetLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },

  budgetValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.success,
  },

  teamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  teamRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },

  teamRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  teamRowLabel: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
  },

  teamRowValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    color: COLORS.text.primary,
  },

  captainText: {
    color: COLORS.primary,
  },

  pointsValue: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  noTeamContainer: {
    alignItems: 'center',
    gap: SPACING.sm,
  },

  noTeamText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
  },

  createTeamButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.sm,
  },

  createTeamButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.white,
  },

  incompleteTeamBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },

  incompleteTeamText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.warning,
    fontWeight: '500',
    flex: 1,
  },

  incompleteValue: {
    color: COLORS.warning,
  },

  completeTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },

  completeTeamButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.white,
  },
});
