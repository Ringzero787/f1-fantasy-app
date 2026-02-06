import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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
import { saveAvatarUrl } from '../../../../src/services/avatarGeneration.service';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../../../src/config/constants';
import type { LeagueMember } from '../../../../src/types';

export default function LeagueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const {
    currentLeague,
    isLoading,
    loadLeague,
    leaveLeague,
  } = useLeagueStore();

  const [refreshing, setRefreshing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const { generate: generateAvatar, regenerate: regenerateAvatar, isGenerating, isAvailable } = useAvatarGeneration({
    onSuccess: (url) => setAvatarUrl(url),
  });

  // Subscribe to team store for real-time updates
  const { userTeams, currentTeam, loadUserTeams } = useTeamStore();

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

    // Filter teams in this league
    const teamsInLeague = Array.from(teamMap.values()).filter(
      team => team && team.leagueId === id
    );

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
    }));

    // Sort by points and assign ranks
    memberList.sort((a, b) => b.totalPoints - a.totalPoints);
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
      });
    }

    return memberList;
  }, [id, currentLeague, user, userTeams, currentTeam]);

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
        message: `Join my F1 Fantasy league "${currentLeague.name}"! Use code: ${currentLeague.inviteCode}`,
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
  const currentUserMember = members.find((m) => m.userId === user?.id);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={true}
      bounces={true}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
      }
    >
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
            <Text style={styles.leagueName}>{currentLeague.name}</Text>
            <Text style={styles.ownerText}>by {currentLeague.ownerName}</Text>
          </View>
        </View>

        {currentLeague.description && (
          <Text style={styles.description}>{currentLeague.description}</Text>
        )}

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{currentLeague.memberCount}</Text>
            <Text style={styles.statLabel}>Members</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{currentLeague.maxMembers}</Text>
            <Text style={styles.statLabel}>Max</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {currentUserMember?.rank || '-'}
            </Text>
            <Text style={styles.statLabel}>Your Rank</Text>
          </View>
        </View>
      </Card>

      {/* Leaderboard */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Leaderboard</Text>

        {members.length > 0 ? (
          members.map((member) => (
            <LeaderboardItem
              key={member.userId}
              member={member}
              isCurrentUser={member.userId === user?.id}
              onPress={() => {
                if (member.userId === user?.id) {
                  // Navigate to own team
                  router.push('/my-team');
                } else {
                  // Navigate to read-only view of other player's team
                  router.push(`/leagues/${id}/team/${member.userId}`);
                }
              }}
            />
          ))
        ) : (
          <Card variant="outlined" padding="large">
            <Text style={styles.emptyText}>No members yet</Text>
          </Card>
        )}
      </View>

      {/* Invite Code - Compact */}
      <TouchableOpacity style={styles.inviteRow} onPress={handleShareCode}>
        <View style={styles.inviteRowLeft}>
          <Ionicons name="link-outline" size={18} color={COLORS.text.muted} />
          <Text style={styles.inviteRowLabel}>Invite Code:</Text>
          <Text style={styles.inviteRowCode}>{currentLeague.inviteCode}</Text>
        </View>
        <View style={styles.shareButton}>
          <Ionicons name="share-outline" size={18} color={COLORS.primary} />
          <Text style={styles.shareText}>Share</Text>
        </View>
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.actions}>
        {isOwner && (
          <TouchableOpacity
            style={styles.adminButton}
            onPress={() => router.push(`/leagues/${id}/admin`)}
          >
            <Ionicons name="settings-outline" size={18} color={COLORS.primary} />
            <Text style={styles.adminButtonText}>League Admin</Text>
          </TouchableOpacity>
        )}
        {!isOwner && (
          <Button
            title="Leave League"
            onPress={handleLeaveLeague}
            variant="outline"
            fullWidth
            style={[styles.actionButton, styles.leaveButton]}
          />
        )}
      </View>

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
        />
      )}
    </ScrollView>
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
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  ownerText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
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
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
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
    marginBottom: SPACING.md,
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
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginBottom: SPACING.sm,
  },

  adminButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.primary,
  },

  actionButton: {
    marginBottom: SPACING.sm,
  },

  leaveButton: {
    borderColor: COLORS.error,
  },
});
