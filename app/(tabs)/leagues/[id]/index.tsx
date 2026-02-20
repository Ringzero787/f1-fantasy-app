import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../../src/hooks/useAuth';
import { useLeagueStore } from '../../../../src/store/league.store';
import { useTeamStore } from '../../../../src/store/team.store';
import { useAvatarGeneration } from '../../../../src/hooks';
import { Card, Loading, LeaderboardItem, Button, EmptyState, Avatar, AvatarPicker } from '../../../../src/components';
import { LeaderboardView } from '../../../../src/components/LeaderboardItem';
import { saveAvatarUrl } from '../../../../src/services/avatarGeneration.service';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../../../src/config/constants';
import { useTheme } from '../../../../src/hooks/useTheme';
import { useScale } from '../../../../src/hooks/useScale';
import type { LeagueMember } from '../../../../src/types';

const LEADERBOARD_VIEWS: { key: LeaderboardView; label: string; icon: string }[] = [
  { key: 'total', label: 'Total', icon: 'podium-outline' },
  { key: 'ppr', label: 'PPR', icon: 'analytics-outline' },
  { key: 'last5', label: 'Last 5', icon: 'flame-outline' },
  { key: 'wins', label: 'Wins', icon: 'trophy-outline' },
];

export default function LeagueDetailScreen() {
  const theme = useTheme();
  const { scaledFonts, scaledSpacing, scaledIcon } = useScale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const currentLeague = useLeagueStore(s => s.currentLeague);
  const pendingLeagueIds = useLeagueStore(s => s.pendingLeagueIds);
  const isLoading = useLeagueStore(s => s.isLoading);
  const loadLeague = useLeagueStore(s => s.loadLeague);
  const leaveLeague = useLeagueStore(s => s.leaveLeague);

  const [refreshing, setRefreshing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [leaderboardView, setLeaderboardView] = useState<LeaderboardView>('total');

  const { generate: generateAvatar, regenerate: regenerateAvatar, isGenerating, isAvailable } = useAvatarGeneration({
    onSuccess: (url) => setAvatarUrl(url),
  });

  // Subscribe to team store for real-time updates
  const userTeams = useTeamStore(s => s.userTeams);
  const currentTeam = useTeamStore(s => s.currentTeam);
  const loadUserTeams = useTeamStore(s => s.loadUserTeams);
  const retiredMembers = useLeagueStore(s => s.retiredMembers);

  // Compute league members directly from team data (more reliable than async loading)
  const members = useMemo((): LeagueMember[] => {
    if (!id || !currentLeague || !user) return [];

    // Build comprehensive list of teams
    const teamMap = new Map<string, typeof currentTeam>();
    userTeams.forEach(team => {
      if (team) teamMap.set(team.id, team);
    });
    if (currentTeam) {
      teamMap.set(currentTeam.id, currentTeam);
    }

    // Filter teams in this league, deduplicate by userId (keep latest)
    const teamsInLeagueAll = Array.from(teamMap.values()).filter(
      (team): team is NonNullable<typeof team> => team != null && team.leagueId === id
    );
    const seenUserIds = new Set<string>();
    const teamsInLeague = teamsInLeagueAll.filter(team => {
      if (seenUserIds.has(team.userId)) return false;
      seenUserIds.add(team.userId);
      return true;
    });

    // Create member entries
    const memberList: LeagueMember[] = teamsInLeague.map((team) => ({
      id: team.id,
      leagueId: id,
      userId: team.userId,
      displayName: team.userId === user.id ? (user.displayName || 'Demo User') : 'League Member',
      teamName: team.name,
      teamAvatarUrl: team.avatarUrl,
      role: team.userId === currentLeague.ownerId ? 'owner' as const : 'member' as const,
      totalPoints: team.totalPoints || 0,
      rank: 0,
      joinedAt: team.createdAt,
      racesPlayed: team.racesPlayed || 0,
      pprAverage: team.racesPlayed && team.racesPlayed > 0
        ? Math.round((team.totalPoints / team.racesPlayed) * 10) / 10
        : 0,
      recentFormPoints: (team.pointsHistory || []).slice(-5).reduce((a, b) => a + b, 0),
      raceWins: team.raceWins || 0,
    }));

    // Merge retired members (withdrawn teams whose scores are preserved)
    const retired = retiredMembers
      .filter(m => m.leagueId === id && !memberList.some(active => active.id === m.id));
    retired.forEach(m => memberList.push({ ...m, isWithdrawn: true }));

    // Sort based on selected view and assign ranks
    const getSortValue = (m: LeagueMember): number => {
      switch (leaderboardView) {
        case 'ppr':
          return m.pprAverage ?? (m.racesPlayed && m.racesPlayed > 0
            ? m.totalPoints / m.racesPlayed
            : 0);
        case 'last5':
          return m.recentFormPoints ?? 0;
        case 'wins':
          return m.raceWins ?? 0;
        default:
          return m.totalPoints;
      }
    };

    memberList.sort((a, b) => getSortValue(b) - getSortValue(a));
    memberList.forEach((member, index) => {
      member.rank = index + 1;
    });

    // Fallback: if no teams found but user is owner, show them
    if (memberList.length === 0 && currentLeague.ownerId === user.id) {
      const userTeam = currentTeam?.userId === user.id ? currentTeam :
                       userTeams.find(t => t.userId === user.id);
      memberList.push({
        id: user.id,
        leagueId: id,
        userId: user.id,
        displayName: user.displayName || 'Demo User',
        teamName: userTeam?.name,
        teamAvatarUrl: userTeam?.avatarUrl,
        role: 'owner',
        totalPoints: userTeam?.totalPoints || 0,
        rank: 1,
        joinedAt: new Date(),
        racesPlayed: userTeam?.racesPlayed || 0,
        pprAverage: userTeam && userTeam.racesPlayed > 0
          ? Math.round((userTeam.totalPoints / userTeam.racesPlayed) * 10) / 10
          : 0,
        recentFormPoints: userTeam ? (userTeam.pointsHistory || []).slice(-5).reduce((a, b) => a + b, 0) : 0,
        raceWins: userTeam?.raceWins || 0,
      });
    }

    return memberList;
  }, [id, currentLeague, user, userTeams, currentTeam, leaderboardView, retiredMembers]);

  useEffect(() => {
    if (id && user) {
      loadLeague(id);
      loadUserTeams(user.id);
    }
  }, [id, user]);

  // Update avatar URL when league loads
  useEffect(() => {
    if (currentLeague?.avatarUrl) {
      setAvatarUrl(currentLeague.avatarUrl);
    }
  }, [currentLeague?.avatarUrl]);

  const handleGenerateAvatar = async () => {
    if (!currentLeague || !id) return;
    if (avatarUrl) {
      await regenerateAvatar(currentLeague.name, 'league', id);
    } else {
      await generateAvatar(currentLeague.name, 'league', id);
    }
  };

  const handleSelectLeagueAvatar = async (url: string) => {
    if (!id) return;
    const result = await saveAvatarUrl('league', id, url);
    if (result.success && result.imageUrl) {
      setAvatarUrl(result.imageUrl);
    }
  };

  const handleOpenAvatarPicker = () => {
    if (currentLeague && currentLeague.ownerId === user?.id) {
      setShowAvatarPicker(true);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (id && user) {
      await loadLeague(id);
      await loadUserTeams(user.id);
    }
    setRefreshing(false);
  };

  const handleShareCode = async () => {
    if (!currentLeague) return;

    try {
      await Share.share({
        message: `Join my league "${currentLeague.name}" on Undercut!\n\nhttps://f1-app-18077.web.app/join?code=${currentLeague.inviteCode}\n\nOr enter code: ${currentLeague.inviteCode}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleLeaveLeague = () => {
    if (!currentLeague || !user) return;

    Alert.alert(
      'Leave League',
      `Are you sure you want to leave "${currentLeague.name}"? Your team and points will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveLeague(currentLeague.id, user.id);
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to leave league');
            }
          },
        },
      ]
    );
  };

  const foundedYear = useMemo(() => {
    if (!currentLeague) return null;
    const d = currentLeague.createdAt;
    if (!d) return null;
    if (d instanceof Date) return d.getFullYear();
    // Firestore Timestamp object
    if (typeof d === 'object' && 'seconds' in d) return new Date((d as any).seconds * 1000).getFullYear();
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed.getFullYear();
  }, [currentLeague?.createdAt]);

  if (isLoading && !currentLeague) {
    return <Loading fullScreen message="Loading league..." />;
  }

  if (!currentLeague) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState
          icon="alert-circle-outline"
          title="League Not Found"
          message="This league may have been deleted or you don't have access"
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const isOwner = currentLeague.ownerId === user?.id;
  const isPendingApproval = id ? pendingLeagueIds.includes(id) : false;
  const currentUserMember = members.find((m) => m.userId === user?.id);

  const listHeader = (
    <>
      {/* League Header */}
      <Card variant="elevated" style={styles.headerCard}>
        <View style={styles.headerTop}>
          <Avatar
            name={currentLeague.name}
            size="xlarge"
            variant="league"
            imageUrl={avatarUrl}
            isGenerating={isGenerating}
            editable={isOwner}
            onPress={handleOpenAvatarPicker}
          />
          <View style={styles.headerInfo}>
            <Text style={[styles.leagueName, { fontSize: scaledFonts.xxl }]}>{currentLeague.name}</Text>
            <Text style={[styles.ownerText, { fontSize: scaledFonts.sm }]}>by {currentLeague.ownerName}</Text>
            {foundedYear ? <Text style={styles.foundedText}>Founded {foundedYear}</Text> : null}
          </View>
        </View>

        {currentLeague.description && (
          <Text style={[styles.description, { fontSize: scaledFonts.md }]}>{currentLeague.description}</Text>
        )}

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { fontSize: scaledFonts.xl }]}>{currentLeague.memberCount}</Text>
            <Text style={[styles.statLabel, { fontSize: scaledFonts.xs }]}>Members</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { fontSize: scaledFonts.xl }]}>{currentLeague.maxMembers}</Text>
            <Text style={[styles.statLabel, { fontSize: scaledFonts.xs }]}>Max</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { fontSize: scaledFonts.xl }]}>
              {currentUserMember?.rank || '-'}
            </Text>
            <Text style={[styles.statLabel, { fontSize: scaledFonts.xs }]}>Your Rank</Text>
          </View>
        </View>
      </Card>

      {/* Pending Approval Banner */}
      {isPendingApproval && (
        <View style={styles.pendingBanner}>
          <Ionicons name="hourglass-outline" size={20} color={COLORS.warning} />
          <View style={styles.pendingBannerInfo}>
            <Text style={styles.pendingBannerTitle}>Awaiting Admin Approval</Text>
            <Text style={styles.pendingBannerText}>
              Your request to join this league is being reviewed by the admin.
            </Text>
          </View>
        </View>
      )}

      {/* Leaderboard Title + View Toggle */}
      {!isPendingApproval && (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { fontSize: scaledFonts.lg }]}>Leaderboard</Text>

        <View style={styles.viewToggle}>
          {LEADERBOARD_VIEWS.map((view) => (
            <TouchableOpacity
              key={view.key}
              style={[
                styles.viewToggleItem,
                leaderboardView === view.key && styles.viewToggleItemActive,
                leaderboardView === view.key && { backgroundColor: theme.primary },
              ]}
              onPress={() => setLeaderboardView(view.key)}
            >
              <Ionicons
                name={view.icon as any}
                size={14}
                color={leaderboardView === view.key ? COLORS.white : COLORS.text.muted}
              />
              <Text
                style={[
                  styles.viewToggleText,
                  leaderboardView === view.key && styles.viewToggleTextActive,
                ]}
              >
                {view.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      )}
    </>
  );

  const listFooter = (
    <>
      {/* Invite Code - Compact */}
      <TouchableOpacity style={styles.inviteRow} onPress={handleShareCode}>
        <View style={styles.inviteRowLeft}>
          <Ionicons name="link-outline" size={20} color={COLORS.text.muted} />
          <Text style={[styles.inviteRowLabel, { fontSize: scaledFonts.sm }]}>Invite Code:</Text>
          <Text style={[styles.inviteRowCode, { fontSize: scaledFonts.md }]}>{currentLeague.inviteCode}</Text>
        </View>
        <View style={styles.shareButton}>
          <Ionicons name="share-outline" size={20} color={theme.primary} />
          <Text style={[styles.shareText, { fontSize: scaledFonts.sm, color: theme.primary }]}>Share</Text>
        </View>
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.actions}>
        {isOwner && (
          <TouchableOpacity
            style={[styles.adminButton, { borderColor: theme.primary }]}
            onPress={() => router.push(`/leagues/${id}/admin`)}
          >
            <Ionicons name="settings-outline" size={20} color={theme.primary} />
            <Text style={[styles.adminButtonText, { fontSize: scaledFonts.lg, color: theme.primary }]}>League Admin</Text>
          </TouchableOpacity>
        )}
        {!isOwner && (
          <Button
            title="Leave League"
            onPress={handleLeaveLeague}
            variant="outline"
            fullWidth
            style={StyleSheet.flatten([styles.actionButton, styles.leaveButton])}
          />
        )}
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={isPendingApproval ? [] : members}
        keyExtractor={(item) => item.id}
        renderItem={({ item: member }) => (
          <LeaderboardItem
            member={member}
            isCurrentUser={member.userId === user?.id}
            view={leaderboardView}
            onPress={() => {
              if (member.userId === user?.id) {
                router.push('/my-team');
              } else {
                router.push(`/leagues/${id}/team/${member.userId}`);
              }
            }}
          />
        )}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          <Card variant="outlined" padding="large">
            <Text style={styles.emptyText}>No members yet</Text>
          </Card>
        }
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={true}
        bounces={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      />

      {/* Avatar Picker Modal */}
      {currentLeague && id && (
        <AvatarPicker
          visible={showAvatarPicker}
          onClose={() => setShowAvatarPicker(false)}
          name={currentLeague.name}
          type="league"
          currentAvatarUrl={avatarUrl}
          onSelectAvatar={handleSelectLeagueAvatar}
          onGenerateAI={handleGenerateAvatar}
          isGeneratingAI={isGenerating}
          canGenerateAI={isAvailable}
          userId={user?.id}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  emptyContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    flexGrow: 1,
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

  leagueName: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  ownerText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  foundedText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    fontStyle: 'italic',
    marginTop: 2,
  },

  description: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    marginBottom: SPACING.md,
    lineHeight: 22,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  statLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border.default,
  },

  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    marginBottom: SPACING.lg,
  },

  inviteRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  inviteRowLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },

  inviteRowCode: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
    letterSpacing: 2,
  },

  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  shareText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    fontWeight: '500',
  },

  section: {
    marginBottom: SPACING.lg,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.sm,
  },

  viewToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    padding: 4,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  viewToggleItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    gap: 4,
  },

  viewToggleItemActive: {
    backgroundColor: COLORS.primary,
  },

  viewToggleText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    color: COLORS.text.muted,
  },

  viewToggleTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
    textAlign: 'center',
  },

  actions: {
    marginTop: SPACING.md,
  },

  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.card,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginBottom: SPACING.sm,
  },

  adminButtonText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.primary,
  },

  actionButton: {
    marginBottom: SPACING.sm,
  },

  leaveButton: {
    borderColor: COLORS.error,
  },

  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.warning + '15',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },

  pendingBannerInfo: {
    flex: 1,
  },

  pendingBannerTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.warning,
  },

  pendingBannerText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
});
