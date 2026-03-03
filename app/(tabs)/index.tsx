import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { TooltipText } from '../../src/components/TooltipText';
import { GLOSSARY } from '../../src/config/glossary';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
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
import { useTheme } from '../../src/hooks/useTheme';
import { formatPoints } from '../../src/utils/formatters';
import type { FantasyTeam } from '../../src/types';

const CURRENT_SEASON_ID = '2026'; // This would come from app config

/* ─── TeamCard: collapsible team tile ─── */
function TeamCard({
  team,
  isCollapsed,
  onToggleCollapse,
  onPress,
  isPrimary,
  scaledFonts,
  scaledSpacing,
  scaledIcon,
  theme,
  raceResults,
  userTeams,
}: {
  team: FantasyTeam;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onPress: () => void;
  isPrimary: boolean;
  scaledFonts: any;
  scaledSpacing: any;
  scaledIcon: (s: number) => number;
  theme: any;
  raceResults: any;
  userTeams: FantasyTeam[];
}) {
  const teamDriverCount = team.drivers.length;
  const hasConstructor = !!team.constructor;
  const isTeamComplete = teamDriverCount === TEAM_SIZE && hasConstructor;
  const aceDriver = team.aceDriverId
    ? team.drivers.find(d => d.driverId === team.aceDriverId)
    : null;

  if (isCollapsed) {
    // Collapsed: single line with key stats
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={{ marginTop: isPrimary ? 0 : SPACING.sm }}
      >
        <Card variant="elevated" style={styles.teamSummaryCard}>
          <View style={styles.collapsedRow}>
            <Avatar
              name={team.name}
              size="small"
              variant="team"
              imageUrl={team.avatarUrl || null}
            />
            <Text style={[styles.collapsedName, { fontSize: scaledFonts.md }]} numberOfLines={1}>{team.name}</Text>
            <View style={styles.collapsedStats}>
              <View style={styles.collapsedStat}>
                <Ionicons name="podium" size={14} color={theme.primary} />
                <Text style={[styles.collapsedStatText, { color: theme.primary, fontSize: scaledFonts.sm }]}>
                  {formatPoints(team.totalPoints)}
                </Text>
              </View>
              <View style={styles.collapsedStat}>
                <Ionicons name="wallet-outline" size={14} color={COLORS.success} />
                <Text style={[styles.collapsedStatText, { color: COLORS.success, fontSize: scaledFonts.sm }]}>
                  ${formatPoints(team.budget)}
                </Text>
              </View>
              <Text style={[styles.collapsedDriverCount, { fontSize: scaledFonts.xs }]}>
                {teamDriverCount}/{TEAM_SIZE}
              </Text>
            </View>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); onToggleCollapse(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.collapseToggle}
            >
              <Ionicons name="chevron-down" size={18} color={COLORS.text.muted} />
            </TouchableOpacity>
          </View>
        </Card>
      </TouchableOpacity>
    );
  }

  // Expanded: full team card
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{ marginTop: isPrimary ? 0 : SPACING.sm }}
    >
      <Card variant="elevated" style={styles.teamSummaryCard}>
        <View style={styles.teamHeader}>
          <Avatar
            name={team.name}
            size="medium"
            variant="team"
            imageUrl={team.avatarUrl || null}
          />
          <Text style={[styles.teamName, { fontSize: scaledFonts.lg }]}>{team.name}</Text>
          <View style={styles.teamHeaderRight}>
            <View style={styles.teamBudget}>
              <Text style={[styles.budgetLabel, { fontSize: scaledFonts.sm }]}>Budget</Text>
              <Text style={[styles.budgetValue, { fontSize: scaledFonts.md }]}>${formatPoints(team.budget)}</Text>
            </View>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); onToggleCollapse(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.collapseToggle}
            >
              <Ionicons name="chevron-up" size={18} color={COLORS.text.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Team Status Banner */}
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
            <TooltipText term="Constructor" definition={GLOSSARY.f1Constructor} style={[styles.teamRowLabel, { fontSize: scaledFonts.md }]} />
          </View>
          <Text style={[styles.teamRowValue, { fontSize: scaledFonts.md }, !hasConstructor && styles.incompleteValue]}>
            {team.constructor?.name || 'Not selected'}
          </Text>
        </View>

        {/* Ace Row */}
        <View style={[styles.teamRow, { paddingVertical: scaledSpacing.sm }]}>
          <View style={styles.teamRowLeft}>
            <Ionicons name="diamond" size={scaledIcon(18)} color={COLORS.gold} />
            <TooltipText term="Ace" definition={GLOSSARY.ace} style={[styles.teamRowLabel, { fontSize: scaledFonts.md }]} />
          </View>
          <Text style={[styles.teamRowValue, { fontSize: scaledFonts.md }, aceDriver && [styles.aceText, { color: theme.primary }]]}>
            {aceDriver?.name || 'Not selected'}
          </Text>
        </View>

        {/* Total Points Row */}
        <View style={[styles.teamRow, styles.teamRowLast, { paddingVertical: scaledSpacing.sm }]}>
          <View style={styles.teamRowLeft}>
            <Ionicons name="podium" size={scaledIcon(18)} color={theme.primary} />
            <Text style={[styles.teamRowLabel, { fontSize: scaledFonts.md }]}>Total Points</Text>
          </View>
          <Text style={[styles.teamRowValue, styles.pointsValue, { fontSize: scaledFonts.md, color: theme.primary }]}>
            {formatPoints(team.totalPoints)}
          </Text>
        </View>

        {/* Complete Team Button if incomplete */}
        {!isTeamComplete && (
          <View style={[styles.completeTeamButton, { backgroundColor: theme.primary }]}>
            <Text style={styles.completeTeamButtonText}>Complete Your Team</Text>
            <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { scaledFonts, scaledSpacing, scaledIcon } = useScale();
  const theme = useTheme();
  const { user } = useAuth();
  const { data: nextRace, isLoading: raceLoading, refetch: refetchRace } = useNextRace(CURRENT_SEASON_ID);
  const { data: upcomingRaces } = useUpcomingRaces(CURRENT_SEASON_ID, 4);
  const [racesExpanded, setRacesExpanded] = useState(false);
  const currentTeam = useTeamStore(s => s.currentTeam);
  const userTeams = useTeamStore(s => s.userTeams);
  const selectTeam = useTeamStore(s => s.selectTeam);
  const loadUserTeams = useTeamStore(s => s.loadUserTeams);
  const leagues = useLeagueStore(s => s.leagues);
  const loadUserLeagues = useLeagueStore(s => s.loadUserLeagues);
  const pendingCountsByLeague = useLeagueStore(s => s.pendingCountsByLeague);
  const loadPendingCountsForOwnedLeagues = useLeagueStore(s => s.loadPendingCountsForOwnedLeagues);
  const raceResults = useAdminStore(s => s.raceResults);
  const loadArticles = useNewsStore(s => s.loadArticles);
  const loadActiveAnnouncements = useAnnouncementStore(s => s.loadActiveAnnouncements);
  const registerToken = useNotificationStore(s => s.registerToken);
  const loadNotifications = useNotificationStore(s => s.loadNotifications);

  const [refreshing, setRefreshing] = React.useState(false);
  const [teamsExpanded, setTeamsExpanded] = useState(false);
  const [teamCollapsed, setTeamCollapsed] = useState<Record<string, boolean>>({});

  // Load user's leagues, teams, and news on mount
  React.useEffect(() => {
    if (user) {
      loadUserLeagues(user.id);
      loadUserTeams(user.id);
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

  // Get the league matching the currently selected team
  const primaryLeague = useMemo(() => {
    if (!currentTeam?.leagueId) return leagues.length > 0 ? leagues[0] : null;
    return leagues.find(l => l.id === currentTeam.leagueId) || (leagues.length > 0 ? leagues[0] : null);
  }, [currentTeam?.leagueId, leagues]);

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

  // Pending approvals for owned leagues
  const pendingApprovals = useMemo(() => {
    return leagues
      .filter(l => (pendingCountsByLeague[l.id] ?? 0) > 0)
      .map(l => ({ leagueId: l.id, leagueName: l.name, count: pendingCountsByLeague[l.id] }));
  }, [leagues, pendingCountsByLeague]);

  const onRefresh = async () => {
    setRefreshing(true);
    const leagueIds = leagues.map(l => l.id);
    await Promise.all([
      refetchRace(),
      loadArticles(true),
      leagueIds.length > 0 ? loadActiveAnnouncements(leagueIds) : Promise.resolve(),
      user ? loadPendingCountsForOwnedLeagues(user.id) : Promise.resolve(),
      user ? loadUserTeams(user.id) : Promise.resolve(),
    ]);
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
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
            style={[styles.joinLeagueBadge, { paddingHorizontal: scaledSpacing.sm, paddingVertical: scaledSpacing.xs, backgroundColor: theme.primary + '15' }]}
            onPress={() => router.push('/leagues')}
          >
            <Ionicons name="trophy-outline" size={scaledIcon(14)} color={theme.primary} />
            <Text style={[styles.joinLeagueBadgeText, { fontSize: scaledFonts.sm, color: theme.primary }]}>Join League</Text>
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

      {/* Pending Approvals Banner */}
      {pendingApprovals.length > 0 && (
        <View style={styles.approvalBanner}>
          <View style={styles.approvalIconContainer}>
            <Ionicons name="person-add" size={20} color={COLORS.info} />
          </View>
          <View style={styles.warningContent}>
            {pendingApprovals.map((p) => (
              <TouchableOpacity
                key={p.leagueId}
                onPress={() => router.push(`/(tabs)/leagues/${p.leagueId}/admin` as any)}
                activeOpacity={0.7}
              >
                <Text style={styles.approvalText} numberOfLines={1}>
                  <Text style={styles.approvalLeagueName}>{p.leagueName}</Text>
                  {` — ${p.count} pending approval${p.count > 1 ? 's' : ''}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.info} />
        </View>
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
          <TooltipText term="Bank" definition={GLOSSARY.bank} style={[styles.statLabel, { fontSize: scaledFonts.sm }]} />
        </Card>
      </View>

      {/* Upcoming Races */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { fontSize: scaledFonts.lg, marginBottom: SPACING.md }]}>Upcoming Races</Text>
        {raceLoading ? (
          <Loading />
        ) : upcomingRaces && upcomingRaces.length > 0 ? (
          <>
            {(racesExpanded ? upcomingRaces : upcomingRaces.slice(0, 1)).map((race, index) => (
              <View key={race.id} style={index > 0 ? { marginTop: SPACING.sm } : undefined}>
                <RaceCard
                  race={race}
                  onPress={() => router.push(`/calendar/${race.id}`)}
                  showCountdown={index === 0}
                />
              </View>
            ))}
            {upcomingRaces.length > 1 && (
              <TouchableOpacity
                style={[styles.expandTeamsButton, { backgroundColor: theme.card, borderColor: COLORS.border.default }]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setRacesExpanded(prev => !prev);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={racesExpanded ? 'chevron-up' : 'ellipsis-horizontal'}
                  size={racesExpanded ? 18 : 20}
                  color={theme.primary}
                />
                <Text style={[styles.expandTeamsText, { color: theme.primary }]}>
                  {racesExpanded ? 'Show less' : `${upcomingRaces.length - 1} more race${upcomingRaces.length - 1 > 1 ? 's' : ''}`}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <Card variant="outlined" padding="large">
            <Text style={styles.emptyText}>No upcoming races</Text>
          </Card>
        )}
      </View>

      {/* My Teams Summary */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleWithDots}>
            <Text style={[styles.sectionTitle, { fontSize: scaledFonts.lg }]}>My Team</Text>
            <TouchableOpacity
              style={[styles.manageButton, { backgroundColor: theme.primary + '15' }]}
              onPress={() => router.push('/my-team')}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={14} color={theme.primary} />
              <Text style={[styles.manageButtonText, { color: theme.primary, fontSize: scaledFonts.sm }]}>Manage</Text>
            </TouchableOpacity>
          </View>
        </View>

        {currentTeam ? (
          <>
            {/* Primary team card */}
            <TeamCard
              team={currentTeam}
              isCollapsed={userTeams.length > 1 ? (teamCollapsed[currentTeam.id] ?? false) : (teamCollapsed[currentTeam.id] ?? false)}
              onToggleCollapse={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setTeamCollapsed(prev => ({ ...prev, [currentTeam.id]: !prev[currentTeam.id] }));
              }}
              onPress={() => router.push('/my-team')}
              isPrimary
              scaledFonts={scaledFonts}
              scaledSpacing={scaledSpacing}
              scaledIcon={scaledIcon}
              theme={theme}
              raceResults={raceResults}
              userTeams={userTeams}
            />

            {/* Other teams (expandable) */}
            {userTeams.length > 1 && (
              <>
                {teamsExpanded && userTeams
                  .filter(t => t.id !== currentTeam.id)
                  .map(team => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      isCollapsed={teamCollapsed[team.id] ?? true}
                      onToggleCollapse={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setTeamCollapsed(prev => ({ ...prev, [team.id]: !prev[team.id] }));
                      }}
                      onPress={() => {
                        selectTeam(team.id);
                        router.push('/my-team');
                      }}
                      isPrimary={false}
                      scaledFonts={scaledFonts}
                      scaledSpacing={scaledSpacing}
                      scaledIcon={scaledIcon}
                      theme={theme}
                      raceResults={raceResults}
                      userTeams={userTeams}
                    />
                  ))
                }
                <TouchableOpacity
                  style={[styles.expandTeamsButton, { backgroundColor: theme.card, borderColor: COLORS.border.default }]}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setTeamsExpanded(prev => !prev);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={teamsExpanded ? 'chevron-up' : 'ellipsis-horizontal'}
                    size={teamsExpanded ? 18 : 20}
                    color={theme.primary}
                  />
                  <Text style={[styles.expandTeamsText, { color: theme.primary }]}>
                    {teamsExpanded ? 'Show less' : `${userTeams.length - 1} more team${userTeams.length - 1 > 1 ? 's' : ''}`}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        ) : (
          <Card variant="outlined" padding="large">
            <TouchableOpacity
              style={styles.noTeamContainer}
              onPress={() => router.push('/my-team')}
              activeOpacity={0.8}
            >
              <Ionicons name="people-outline" size={32} color={COLORS.text.muted} />
              <Text style={styles.noTeamText}>No team created yet</Text>
              <View style={[styles.createTeamButton, { backgroundColor: theme.primary }]}>
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
    backgroundColor: undefined, // themed via inline style
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

  approvalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.info + '12',
    borderWidth: 1,
    borderColor: COLORS.info + '30',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },

  approvalIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.info + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },

  approvalText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
  },

  approvalLeagueName: {
    fontWeight: '700',
    color: COLORS.info,
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

  // Collapsed team row
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  collapsedName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
    flex: 1,
  },

  collapsedStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },

  collapsedStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  collapsedStatText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
  },

  collapsedDriverCount: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.text.muted,
  },

  collapseToggle: {
    padding: 4,
    marginLeft: SPACING.xs,
  },

  teamHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  expandTeamsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
  },

  expandTeamsText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
  },
});
