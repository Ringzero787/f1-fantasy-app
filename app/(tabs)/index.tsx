import React from 'react';
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
import { Card, Loading, RaceCard, DriverCard, EmptyState } from '../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, TEAM_SIZE } from '../../src/config/constants';
import { formatPoints } from '../../src/utils/formatters';

const CURRENT_SEASON_ID = '2026'; // This would come from app config

export default function HomeScreen() {
  const { user } = useAuth();
  const { data: nextRace, isLoading: raceLoading, refetch: refetchRace } = useNextRace(CURRENT_SEASON_ID);
  const { data: topDrivers, isLoading: driversLoading, refetch: refetchDrivers } = useTopDrivers(5);
  const { currentTeam, userTeams, selectTeam, loadUserTeams } = useTeamStore();
  const { leagues, loadUserLeagues } = useLeagueStore();

  const [refreshing, setRefreshing] = React.useState(false);

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
  const starDriver = currentTeam?.drivers.find(d => d.isStarDriver);
  const starConstructor = currentTeam?.constructor?.isStarDriver ? currentTeam.constructor : null;
  const isTeamComplete = teamDriverCount === TEAM_SIZE && hasConstructor;

  // Calculate actual stats
  const totalPoints = currentTeam?.totalPoints || 0;
  const leagueCount = leagues.length;
  // Find best rank across all leagues (would need member data - for now use placeholder)
  const bestRank = leagueCount > 0 ? 1 : null; // TODO: Calculate from actual league standings

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
        {primaryLeague && (
          <TouchableOpacity
            style={styles.leagueBadge}
            onPress={() => router.push(`/leagues/${primaryLeague.id}`)}
          >
            <Ionicons name="trophy" size={14} color={COLORS.accent} />
            <Text style={styles.leagueBadgeText} numberOfLines={1}>
              {primaryLeague.name}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <Card style={styles.statCard} variant="elevated">
          <Text style={styles.statValue}>{totalPoints}</Text>
          <Text style={styles.statLabel}>Total Points</Text>
          {currentTeam && (
            <Text style={styles.statTeamName} numberOfLines={1}>
              {currentTeam.name}
            </Text>
          )}
        </Card>
        <Card style={styles.statCard} variant="elevated">
          <Text style={styles.statValue}>{leagueCount}</Text>
          <Text style={styles.statLabel}>Leagues</Text>
        </Card>
        <Card style={styles.statCard} variant="elevated">
          <Text style={styles.statValue}>{bestRank || '--'}</Text>
          <Text style={styles.statLabel}>Best Rank</Text>
        </Card>
      </View>

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

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/my-team')}
          >
            <View style={[styles.actionIcon, { backgroundColor: COLORS.primary + '20' }]}>
              <Ionicons name="people" size={24} color={COLORS.primary} />
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

      {/* My Teams Summary */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Teams</Text>
          <TouchableOpacity onPress={() => router.push('/my-team')}>
            <Text style={styles.seeAllText}>Manage</Text>
          </TouchableOpacity>
        </View>

        {/* Team Selector - show when multiple teams exist */}
        {userTeams.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.teamSelector}
            contentContainerStyle={styles.teamSelectorContent}
          >
            {userTeams.map((team) => (
              <TouchableOpacity
                key={team.id}
                style={[
                  styles.teamSelectorItem,
                  currentTeam?.id === team.id && styles.teamSelectorItemActive,
                ]}
                onPress={() => selectTeam(team.id)}
              >
                <Text
                  style={[
                    styles.teamSelectorText,
                    currentTeam?.id === team.id && styles.teamSelectorTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {team.name}
                </Text>
                {team.leagueId ? (
                  <Ionicons name="trophy" size={12} color={currentTeam?.id === team.id ? COLORS.white : COLORS.accent} />
                ) : (
                  <Ionicons name="person" size={12} color={currentTeam?.id === team.id ? COLORS.white : COLORS.gray[400]} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.addTeamButton}
              onPress={() => router.push('/my-team')}
            >
              <Ionicons name="add" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          </ScrollView>
        )}

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
                <Ionicons name="people" size={18} color={teamDriverCount < TEAM_SIZE ? COLORS.warning : COLORS.gray[500]} />
                <Text style={styles.teamRowLabel}>Drivers</Text>
              </View>
              <Text style={[styles.teamRowValue, teamDriverCount < TEAM_SIZE && styles.incompleteValue]}>
                {teamDriverCount}/{TEAM_SIZE}
              </Text>
            </View>

            {/* Constructor Row */}
            <View style={styles.teamRow}>
              <View style={styles.teamRowLeft}>
                <Ionicons name="car-sport" size={18} color={!hasConstructor ? COLORS.warning : COLORS.gray[500]} />
                <Text style={styles.teamRowLabel}>Constructor</Text>
              </View>
              <Text style={[styles.teamRowValue, !hasConstructor && styles.incompleteValue]}>
                {currentTeam.constructor?.name || 'Not selected'}
              </Text>
            </View>

            {/* Star Selection Row */}
            <View style={styles.teamRow}>
              <View style={styles.teamRowLeft}>
                <Ionicons name="star" size={18} color={COLORS.gold} />
                <Text style={styles.teamRowLabel}>Star (+50%)</Text>
              </View>
              <Text style={[styles.teamRowValue, (starDriver || starConstructor) && styles.starText]}>
                {starDriver?.name || starConstructor?.name || 'Not selected'}
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
              <TouchableOpacity
                style={styles.completeTeamButton}
                onPress={() => router.push('/my-team')}
              >
                <Text style={styles.completeTeamButtonText}>Complete Your Team</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
              </TouchableOpacity>
            )}
          </Card>
        ) : (
          <Card variant="outlined" padding="large">
            <View style={styles.noTeamContainer}>
              <Ionicons name="people-outline" size={32} color={COLORS.gray[400]} />
              <Text style={styles.noTeamText}>No team created yet</Text>
              <TouchableOpacity
                style={styles.createTeamButton}
                onPress={() => router.push('/my-team')}
              >
                <Text style={styles.createTeamButtonText}>Create Team</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
      </View>

      {/* Top Performers */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top Performers</Text>
          <TouchableOpacity onPress={() => router.push('/market')}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {driversLoading ? (
          <Loading />
        ) : topDrivers && topDrivers.length > 0 ? (
          topDrivers.slice(0, 3).map((driver) => (
            <DriverCard
              key={driver.id}
              driver={driver}
              compact
              showPrice
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
    color: COLORS.gray[600],
  },

  userName: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.gray[900],
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
    color: COLORS.gray[900],
  },

  statLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[500],
    marginTop: SPACING.xs,
  },

  statTeamName: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.accent,
    marginTop: 2,
    fontWeight: '500',
    textAlign: 'center',
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

  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.gray[900],
    marginBottom: SPACING.md,
  },

  seeAllText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    fontWeight: '500',
  },

  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },

  actionButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
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
    color: COLORS.gray[700],
    textAlign: 'center',
  },

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[500],
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
    borderBottomColor: COLORS.gray[100],
  },

  teamName: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.gray[900],
    flex: 1,
  },

  teamBudget: {
    alignItems: 'flex-end',
  },

  budgetLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[500],
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
    borderBottomColor: COLORS.gray[100],
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
    color: COLORS.gray[600],
  },

  teamRowValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    color: COLORS.gray[900],
  },

  starText: {
    color: COLORS.gold,
  },

  pointsValue: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  teamSelector: {
    marginBottom: SPACING.md,
  },

  teamSelectorContent: {
    gap: SPACING.sm,
    paddingRight: SPACING.md,
  },

  teamSelectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.gray[100],
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },

  teamSelectorItemActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  teamSelectorText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    color: COLORS.gray[700],
    maxWidth: 100,
  },

  teamSelectorTextActive: {
    color: COLORS.white,
  },

  addTeamButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    borderStyle: 'dashed',
  },

  noTeamContainer: {
    alignItems: 'center',
    gap: SPACING.sm,
  },

  noTeamText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[500],
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
