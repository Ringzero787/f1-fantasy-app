import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/hooks/useAuth';
import { useNextRace, useUpcomingRaces } from '../../src/hooks';
import { useTeamStore } from '../../src/store/team.store';
import { useLeagueStore } from '../../src/store/league.store';
import { useAdminStore } from '../../src/store/admin.store';
import { Card, Loading, RaceCard, EmptyState, CountdownBanner, NewsFeed, Avatar, AnnouncementBanner } from '../../src/components';
import { useNewsStore } from '../../src/store/news.store';
import { useAnnouncementStore } from '../../src/store/announcement.store';
import { useNotificationStore } from '../../src/store/notification.store';
import { scheduleIncompleteTeamReminder } from '../../src/services/notification.service';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, TEAM_SIZE } from '../../src/config/constants';
import { useScale } from '../../src/hooks/useScale';
import { formatPoints } from '../../src/utils/formatters';

const CURRENT_SEASON_ID = '2026'; // This would come from app config

export default function HomeScreen() {
  const { scaledFonts, scaledSpacing, scaledIcon } = useScale();
  const { user } = useAuth();
  const { data: nextRace, isLoading: raceLoading, refetch: refetchRace } = useNextRace(CURRENT_SEASON_ID);
  const { data: upcomingRaces } = useUpcomingRaces(CURRENT_SEASON_ID, 5);
  const [activeRaceIndex, setActiveRaceIndex] = useState(0);
  const currentTeam = useTeamStore(s => s.currentTeam);
  const userTeams = useTeamStore(s => s.userTeams);
  const selectTeam = useTeamStore(s => s.selectTeam);
  const loadUserTeams = useTeamStore(s => s.loadUserTeams);
  const leagues = useLeagueStore(s => s.leagues);
  const loadUserLeagues = useLeagueStore(s => s.loadUserLeagues);
  const raceResults = useAdminStore(s => s.raceResults);
  const loadArticles = useNewsStore(s => s.loadArticles);
  const loadActiveAnnouncements = useAnnouncementStore(s => s.loadActiveAnnouncements);
  const registerToken = useNotificationStore(s => s.registerToken);
  const loadNotifications = useNotificationStore(s => s.loadNotifications);

  const [refreshing, setRefreshing] = React.useState(false);

  // Swipe to switch teams
  const swipeX = useRef(new Animated.Value(0)).current;
  const swipeTeamRef = useRef<(dir: 'left' | 'right') => void>(() => {});
  swipeTeamRef.current = (direction: 'left' | 'right') => {
    if (userTeams.length < 2 || !currentTeam) return;
    const idx = userTeams.findIndex(t => t.id === currentTeam.id);
    const nextIdx = direction === 'left'
      ? (idx + 1) % userTeams.length
      : (idx - 1 + userTeams.length) % userTeams.length;
    selectTeam(userTeams[nextIdx].id);
  };

  const teamPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 15 && Math.abs(gs.dy) < Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        swipeX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -50) {
          swipeTeamRef.current('left');
        } else if (gs.dx > 50) {
          swipeTeamRef.current('right');
        }
        Animated.spring(swipeX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 120,
          friction: 8,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  // Load user's leagues, teams, and news on mount
  React.useEffect(() => {
    if (user) {
      loadUserLeagues(user.id);
      // Only load teams if not already hydrated from persistence
      if (userTeams.length === 0) {
        loadUserTeams(user.id);
      }
      loadArticles();
      registerToken(user.id);
      loadNotifications(user.id);
    }
  }, [user]);

  // Schedule incomplete team reminder when team or next race changes
  React.useEffect(() => {
    if (currentTeam && nextRace) {
      scheduleIncompleteTeamReminder(nextRace, currentTeam);
    }
  }, [currentTeam?.id, currentTeam?.drivers.length, currentTeam?.constructor, nextRace?.id]);

  // Load announcements when leagues are available
  React.useEffect(() => {
    const ids = leagues.map(l => l.id);
    if (ids.length > 0) {
      loadActiveAnnouncements(ids);
    }
  }, [leagues]);

  // Get the first league the user is in
  const primaryLeague = leagues.length > 0 ? leagues[0] : null;

  // Calculate team stats
  const teamDriverCount = currentTeam?.drivers.length || 0;
  const hasConstructor = !!currentTeam?.constructor;
  // V3: Ace system - find the ace driver
  const aceDriver = currentTeam?.aceDriverId
    ? currentTeam.drivers.find(d => d.driverId === currentTeam.aceDriverId)
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
        const multiplier = currentTeam.aceDriverId === driver.driverId ? 2 : 1;
        pts += Math.floor(dr.points * multiplier);
      }
    });
    if (currentTeam.constructor) {
      const cr = lastResult.constructorResults.find(
        (r: any) => r.constructorId === currentTeam.constructor?.constructorId
      );
      if (cr) {
        const cMultiplier = currentTeam.aceConstructorId === currentTeam.constructor.constructorId ? 2 : 1;
        pts += Math.floor(cr.points * cMultiplier);
      }
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

  // Check all teams for warnings
  const teamWarnings = useMemo(() => {
    const warnings: { teamName: string; issues: string[] }[] = [];
    for (const team of userTeams) {
      const issues: string[] = [];
      const driverCount = team.drivers.length;
      if (driverCount < TEAM_SIZE) {
        issues.push(`needs ${TEAM_SIZE - driverCount} more driver${TEAM_SIZE - driverCount > 1 ? 's' : ''}`);
      }
      if (!team.constructor) {
        issues.push('no constructor selected');
      }
      if (driverCount === TEAM_SIZE && team.constructor && !team.aceDriverId) {
        issues.push('no ace driver set');
      }
      if (issues.length > 0) {
        warnings.push({ teamName: team.name, issues });
      }
    }
    return warnings;
  }, [userTeams]);

  const onRefresh = async () => {
    setRefreshing(true);
    const leagueIds = leagues.map(l => l.id);
    await Promise.all([
      refetchRace(),
      loadArticles(true),
      leagueIds.length > 0 ? loadActiveAnnouncements(leagueIds) : Promise.resolve(),
    ]);
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
          <Text style={[styles.greeting, { fontSize: scaledFonts.md }]}>Welcome back,</Text>
          <Text style={[styles.userName, { fontSize: scaledFonts.xxl }]}>{user?.displayName || 'Racer'}</Text>
        </View>
        {primaryLeague ? (
          <TouchableOpacity
            style={[styles.leagueBadge, { paddingHorizontal: scaledSpacing.sm, paddingVertical: scaledSpacing.xs }]}
            onPress={() => router.push(`/leagues/${primaryLeague.id}`)}
          >
            <Ionicons name="trophy" size={scaledIcon(14)} color={COLORS.accent} />
            <View style={styles.leagueBadgeContent}>
              <Text style={[styles.leagueBadgeText, { fontSize: scaledFonts.sm }]} numberOfLines={1}>
                {leagueRank ? `#${leagueRank} ` : ''}{primaryLeague.name}
              </Text>
              <Text style={[styles.leagueOwnerText, { fontSize: scaledFonts.xs }]} numberOfLines={1}>
                {primaryLeague.ownerName}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.joinLeagueBadge, { paddingHorizontal: scaledSpacing.sm, paddingVertical: scaledSpacing.xs }]}
            onPress={() => router.push('/leagues')}
          >
            <Ionicons name="trophy-outline" size={scaledIcon(14)} color={COLORS.primary} />
            <Text style={[styles.joinLeagueBadgeText, { fontSize: scaledFonts.sm }]}>Join League</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Race Countdown / Lockout Banner */}
      {nextRace && <CountdownBanner race={nextRace} accentColor="#7c3aed" />}

      {/* League Announcements */}
      <AnnouncementBanner />

      {/* Team Warnings */}
      {teamWarnings.length > 0 && (
        <TouchableOpacity
          style={styles.warningBanner}
          onPress={() => router.push('/my-team')}
          activeOpacity={0.8}
        >
          <View style={styles.warningIconContainer}>
            <Ionicons name="warning" size={20} color={COLORS.warning} />
          </View>
          <View style={styles.warningContent}>
            {teamWarnings.map((w, i) => (
              <Text key={i} style={styles.warningText} numberOfLines={1}>
                <Text style={styles.warningTeamName}>{w.teamName}</Text>
                {' — '}{w.issues.join(', ')}
              </Text>
            ))}
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.warning} />
        </TouchableOpacity>
      )}

      {/* Quick Stats */}
      <View style={[styles.statsRow, { gap: scaledSpacing.sm }]}>
        <Card style={styles.statCard} variant="elevated">
          <Text style={[styles.statValue, { fontSize: scaledFonts.xxl }]}>{formatPoints(totalPoints)}</Text>
          <Text style={[styles.statLabel, { fontSize: scaledFonts.sm }]}>Total Points</Text>
          {currentTeam && (
            <Text style={[styles.statTeamName, { fontSize: scaledFonts.sm }]} numberOfLines={1}>
              {currentTeam.name}
            </Text>
          )}
        </Card>
        <Card style={styles.statCard} variant="elevated">
          <Text style={[styles.statValue, { fontSize: scaledFonts.xxl }, lastRacePoints != null && lastRacePoints > 0 && styles.lastRacePositive]}>
            {lastRacePoints != null ? `+${lastRacePoints}` : '-'}
          </Text>
          <Text style={[styles.statLabel, { fontSize: scaledFonts.sm }]}>Last Race</Text>
        </Card>
        <Card style={styles.statCard} variant="elevated">
          <Text style={[styles.statValue, { fontSize: scaledFonts.xxl }]}>${formatPoints(currentTeam?.budget || 0)}</Text>
          <Text style={[styles.statLabel, { fontSize: scaledFonts.sm }]}>Bank</Text>
        </Card>
      </View>

      {/* Upcoming Races Carousel */}
      <View style={styles.section}>
        <View style={styles.raceSectionHeader}>
          <Text style={[styles.sectionTitle, { fontSize: scaledFonts.lg }]}>Upcoming Races</Text>
          {upcomingRaces && upcomingRaces.length > 1 && (
            <View style={styles.raceDots}>
              {upcomingRaces.map((_, i) => (
                <View
                  key={i}
                  style={[styles.raceDot, i === activeRaceIndex && styles.raceDotActive]}
                />
              ))}
            </View>
          )}
        </View>
        {raceLoading ? (
          <Loading />
        ) : upcomingRaces && upcomingRaces.length > 0 ? (
          <FlatList
            data={upcomingRaces}
            keyExtractor={item => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / (Dimensions.get('window').width - SPACING.md * 2));
              setActiveRaceIndex(index);
            }}
            renderItem={({ item, index }) => (
              <View style={{ width: Dimensions.get('window').width - SPACING.md * 2 }}>
                <RaceCard
                  race={item}
                  onPress={() => router.push(`/calendar/${item.id}`)}
                  showCountdown={index === 0}
                />
              </View>
            )}
          />
        ) : (
          <Card variant="outlined" padding="large">
            <Text style={styles.emptyText}>No upcoming races</Text>
          </Card>
        )}
      </View>

      {/* My Teams Summary */}
      <View style={styles.section}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push('/my-team')}
        >
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWithDots}>
              <Text style={[styles.sectionTitle, { fontSize: scaledFonts.lg }]}>My Teams</Text>
              {userTeams.length > 1 && (
                <View style={styles.teamDots}>
                  {userTeams.map(team => (
                    <TouchableOpacity
                      key={team.id}
                      style={[
                        styles.teamDot,
                        team.id === currentTeam?.id && styles.teamDotActive,
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        selectTeam(team.id);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    />
                  ))}
                </View>
              )}
            </View>
            <View style={styles.manageButton}>
              <Ionicons name="settings-outline" size={18} color={COLORS.primary} />
              <Text style={styles.manageButtonText}>Manage</Text>
            </View>
          </View>
        </TouchableOpacity>

        {currentTeam ? (
          <Animated.View
            {...teamPanResponder.panHandlers}
            style={{ transform: [{ translateX: swipeX }] }}
          >
          <Card variant="elevated" style={styles.teamSummaryCard}>
            <View style={styles.teamHeader}>
              <Avatar
                name={currentTeam.name}
                size="small"
                variant="team"
                imageUrl={currentTeam.avatarUrl || null}
              />
              <Text style={[styles.teamName, { fontSize: scaledFonts.lg }]}>{currentTeam.name}</Text>
              <View style={styles.teamBudget}>
                <Text style={[styles.budgetLabel, { fontSize: scaledFonts.sm }]}>Budget</Text>
                <Text style={[styles.budgetValue, { fontSize: scaledFonts.md }]}>${formatPoints(currentTeam.budget)}</Text>
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
            <View style={[styles.teamRow, { paddingVertical: scaledSpacing.sm }]}>
              <View style={styles.teamRowLeft}>
                <Ionicons name="people" size={scaledIcon(18)} color={teamDriverCount < TEAM_SIZE ? COLORS.warning : COLORS.text.muted} />
                <Text style={[styles.teamRowLabel, { fontSize: scaledFonts.md }]}>Drivers</Text>
              </View>
              <Text style={[styles.teamRowValue, { fontSize: scaledFonts.md }, teamDriverCount < TEAM_SIZE && styles.incompleteValue]}>
                {teamDriverCount}/{TEAM_SIZE}
              </Text>
            </View>

            {/* Constructor Row */}
            <View style={[styles.teamRow, { paddingVertical: scaledSpacing.sm }]}>
              <View style={styles.teamRowLeft}>
                <Ionicons name="car-sport" size={scaledIcon(18)} color={!hasConstructor ? COLORS.warning : COLORS.text.muted} />
                <Text style={[styles.teamRowLabel, { fontSize: scaledFonts.md }]}>Constructor</Text>
              </View>
              <Text style={[styles.teamRowValue, { fontSize: scaledFonts.md }, !hasConstructor && styles.incompleteValue]}>
                {currentTeam.constructor?.name || 'Not selected'}
              </Text>
            </View>

            {/* Ace Selection Row */}
            <View style={[styles.teamRow, { paddingVertical: scaledSpacing.sm }]}>
              <View style={styles.teamRowLeft}>
                <Ionicons name="diamond" size={scaledIcon(18)} color={COLORS.gold} />
                <Text style={[styles.teamRowLabel, { fontSize: scaledFonts.md }]}>Ace (2x)</Text>
              </View>
              <Text style={[styles.teamRowValue, { fontSize: scaledFonts.md }, aceDriver && styles.aceText]}>
                {aceDriver?.name || 'Not selected'}
              </Text>
            </View>

            {/* Total Points Row */}
            <View style={[styles.teamRow, styles.teamRowLast, { paddingVertical: scaledSpacing.sm }]}>
              <View style={styles.teamRowLeft}>
                <Ionicons name="podium" size={scaledIcon(18)} color={COLORS.primary} />
                <Text style={[styles.teamRowLabel, { fontSize: scaledFonts.md }]}>Total Points</Text>
              </View>
              <Text style={[styles.teamRowValue, styles.pointsValue, { fontSize: scaledFonts.md }]}>
                {formatPoints(currentTeam.totalPoints)}
              </Text>
            </View>

            {/* Complete Team Button if incomplete */}
            {!isTeamComplete && (
              <TouchableOpacity
                style={styles.completeTeamButton}
                onPress={() => router.push('/my-team')}
                activeOpacity={0.8}
              >
                <Text style={styles.completeTeamButtonText}>Complete Your Team</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
              </TouchableOpacity>
            )}
          </Card>
          </Animated.View>
        ) : (
          <Card variant="outlined" padding="large">
            <TouchableOpacity
              style={styles.noTeamContainer}
              onPress={() => router.push('/my-team')}
              activeOpacity={0.8}
            >
              <Ionicons name="people-outline" size={32} color={COLORS.text.muted} />
              <Text style={styles.noTeamText}>No team created yet</Text>
              <View style={styles.createTeamButton}>
                <Text style={styles.createTeamButtonText}>Create Team</Text>
              </View>
            </TouchableOpacity>
          </Card>
        )}
      </View>

      {/* F1 News Feed */}
      <NewsFeed />
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
    maxWidth: 160,
  },

  leagueBadgeContent: {
    flexShrink: 1,
  },

  leagueBadgeText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.accent,
  },

  leagueOwnerText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.accent,
    opacity: 0.7,
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

  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '12',
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },

  warningIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.warning + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },

  warningContent: {
    flex: 1,
    gap: 2,
  },

  warningText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
  },

  warningTeamName: {
    fontWeight: '700',
    color: COLORS.warning,
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

  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  raceSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  raceDots: {
    flexDirection: 'row',
    gap: 5,
  },
  raceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.text.muted + '40',
  },
  raceDotActive: {
    backgroundColor: COLORS.primary,
    width: 16,
  },

  sectionTitleWithDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  teamDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  teamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.text.muted + '40',
  },

  teamDotActive: {
    backgroundColor: COLORS.primary,
    width: 10,
    height: 10,
    borderRadius: 5,
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
    gap: SPACING.sm,
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

  aceText: {
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
