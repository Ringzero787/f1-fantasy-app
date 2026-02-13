import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../../src/hooks/useAuth';
import { useLeagueStore } from '../../../../src/store/league.store';
import { useTeamStore } from '../../../../src/store/team.store';
import { useAnnouncementStore } from '../../../../src/store/announcement.store';
import { Card, Button, Loading } from '../../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../../../src/config/constants';

export default function LeagueAdminScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const {
    currentLeague,
    members,
    isLoading,
    loadLeague,
    loadLeagueMembers,
    deleteLeague,
    removeMember,
    inviteMemberByEmail,
    promoteToCoAdmin,
    demoteFromCoAdmin,
    isUserAdmin,
  } = useLeagueStore();
  const { loadUserTeams } = useTeamStore();

  const {
    activeAnnouncements,
    replies,
    announcementHistory,
    isPosting,
    isLoadingReplies,
    postAnnouncement,
    deactivateAnnouncement,
    loadReplies,
    loadAnnouncementHistory,
    loadActiveAnnouncements,
  } = useAnnouncementStore();

  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [showReplies, setShowReplies] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Load league data and members on mount
  useEffect(() => {
    if (id && user) {
      loadLeague(id);
      loadUserTeams(user.id).then(() => {
        loadLeagueMembers(id);
      });
    }
  }, [id, user]);

  // Load announcements for this league
  useEffect(() => {
    if (id) {
      loadActiveAnnouncements([id]);
      loadAnnouncementHistory(id);
    }
  }, [id]);

  // Check if user is owner or admin
  const isOwner = currentLeague?.ownerId === user?.id;
  const isAdmin = user ? isUserAdmin(user.id) : false;
  const isCoAdmin = isAdmin && !isOwner;

  if (!isAdmin) {
    return (
      <View style={styles.accessDenied}>
        <Ionicons name="lock-closed" size={48} color={COLORS.text.muted} />
        <Text style={styles.accessDeniedTitle}>Access Denied</Text>
        <Text style={styles.accessDeniedText}>
          Only league owners and co-admins can access this page.
        </Text>
        <Button
          title="Go Back"
          onPress={() => router.back()}
          style={styles.backButton}
        />
      </View>
    );
  }

  if (isLoading || !currentLeague) {
    return <Loading fullScreen message="Loading..." />;
  }

  const handleInviteByEmail = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setIsInviting(true);
    try {
      await inviteMemberByEmail(currentLeague.id, inviteEmail.trim());
      Alert.alert(
        'Invitation Sent',
        `An email invite has been sent to ${inviteEmail}.\n\nThey can also join with code: ${currentLeague.inviteCode}`
      );
      setInviteEmail('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send invitation';
      Alert.alert('Error', message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = (memberId: string, memberName: string) => {
    if (memberId === user?.id) {
      Alert.alert('Error', 'You cannot remove yourself. Use "Delete League" instead.');
      return;
    }

    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${memberName} from the league? Their team and points will be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember(currentLeague.id, memberId);
              Alert.alert('Success', `${memberName} has been removed from the league`);
            } catch (error) {
              Alert.alert('Error', 'Failed to remove member');
            }
          },
        },
      ]
    );
  };

  const handleDeleteLeague = async () => {
    if (deleteConfirmText.replace(/\s+/g, ' ').trim() !== currentLeague.name.replace(/\s+/g, ' ').trim()) {
      Alert.alert('Error', 'League name does not match. Please type it exactly.');
      return;
    }

    setIsDeleting(true);
    try {
      await deleteLeague(currentLeague.id, user!.id);
      Alert.alert('League Deleted', 'Your league has been permanently deleted.', [
        { text: 'OK', onPress: () => router.replace('/leagues') },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to delete league');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handlePromoteToCoAdmin = (memberId: string, memberName: string) => {
    Alert.alert(
      'Promote to Co-Admin',
      `Are you sure you want to make ${memberName} a co-admin? They will be able to manage members and invite others.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Promote',
          onPress: async () => {
            try {
              await promoteToCoAdmin(currentLeague.id, memberId);
              Alert.alert('Success', `${memberName} is now a co-admin`);
            } catch (error) {
              Alert.alert('Error', 'Failed to promote member');
            }
          },
        },
      ]
    );
  };

  const handleDemoteFromCoAdmin = (memberId: string, memberName: string) => {
    Alert.alert(
      'Remove Co-Admin',
      `Are you sure you want to remove ${memberName} as co-admin? They will become a regular member.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await demoteFromCoAdmin(currentLeague.id, memberId);
              Alert.alert('Success', `${memberName} is no longer a co-admin`);
            } catch (error) {
              Alert.alert('Error', 'Failed to demote co-admin');
            }
          },
        },
      ]
    );
  };

  // Current active announcement for this league
  const activeAnnouncement = activeAnnouncements.find(a => a.leagueId === id) || null;

  const handlePostAnnouncement = async () => {
    if (!announcementMessage.trim() || !user || !currentLeague) return;
    try {
      await postAnnouncement(
        currentLeague.id,
        currentLeague.name,
        user.id,
        user.displayName || 'Admin',
        announcementMessage.trim()
      );
      setAnnouncementMessage('');
      await loadAnnouncementHistory(currentLeague.id);
    } catch (error) {
      Alert.alert('Error', 'Failed to post announcement. Please try again.');
    }
  };

  const handleDeactivate = async () => {
    if (!activeAnnouncement || !currentLeague) return;
    Alert.alert(
      'Deactivate Announcement',
      'This will remove the announcement from all members\' home screens.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            await deactivateAnnouncement(currentLeague.id, activeAnnouncement.id);
            loadAnnouncementHistory(currentLeague.id);
          },
        },
      ]
    );
  };

  const handleShowReplies = () => {
    if (!activeAnnouncement || !currentLeague) return;
    setShowReplies(!showReplies);
    if (!showReplies) {
      loadReplies(currentLeague.id, activeAnnouncement.id);
      // Refresh announcement data to get latest replyCount
      loadActiveAnnouncements([currentLeague.id]);
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  };

  // Filter out the owner from removable members
  const removableMembers = members.filter((m) => m.userId !== currentLeague.ownerId);

  // Get co-admins and regular members separately
  const coAdminIds = currentLeague.coAdminIds || [];
  const coAdmins = members.filter((m) => coAdminIds.includes(m.userId));
  const regularMembers = removableMembers.filter((m) => !coAdminIds.includes(m.userId));

  // Only show co-admin section if there are other members (not just the owner)
  const hasOtherMembers = removableMembers.length > 0;

  // Calculate stats
  const totalPoints = members.reduce((sum, m) => sum + m.totalPoints, 0);
  const avgPoints = members.length > 0 ? Math.round(totalPoints / members.length) : 0;
  const topScorer = members.length > 0 ? members.reduce((top, m) => m.totalPoints > top.totalPoints ? m : top, members[0]) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="settings" size={24} color={COLORS.primary} />
        <Text style={styles.headerTitle}>League Admin</Text>
      </View>
      <Text style={styles.leagueName}>{currentLeague.name}</Text>

      {/* Stats Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>League Stats</Text>
        <Card variant="outlined" style={styles.statsCard}>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{members.length}</Text>
              <Text style={styles.statLabel}>Members</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalPoints}</Text>
              <Text style={styles.statLabel}>Total Points</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{avgPoints}</Text>
              <Text style={styles.statLabel}>Avg Points</Text>
            </View>
          </View>
          {topScorer && (
            <View style={styles.topScorer}>
              <Ionicons name="trophy" size={16} color={COLORS.gold} />
              <Text style={styles.topScorerText}>
                Top Scorer: {topScorer.displayName} ({topScorer.totalPoints} pts)
              </Text>
            </View>
          )}
        </Card>
      </View>

      {/* Invite Member Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invite Member</Text>
        <Card variant="outlined">
          <View style={styles.inviteRow}>
            <TextInput
              style={styles.emailInput}
              placeholder="Enter email address"
              placeholderTextColor={COLORS.text.muted}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.inviteButton, isInviting && styles.inviteButtonDisabled]}
              onPress={handleInviteByEmail}
              disabled={isInviting}
            >
              {isInviting ? (
                <Text style={styles.inviteButtonText}>...</Text>
              ) : (
                <>
                  <Ionicons name="paper-plane" size={16} color={COLORS.card} />
                  <Text style={styles.inviteButtonText}>Invite</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.inviteHint}>
            An invitation email will be sent with a link to join your league
          </Text>
          <View style={styles.inviteCodeRow}>
            <Text style={styles.inviteCodeLabel}>Invite Code:</Text>
            <Text style={styles.inviteCodeValue}>{currentLeague.inviteCode}</Text>
          </View>
        </Card>
      </View>

      {/* Announcements Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Announcements</Text>
        <Card variant="outlined" style={styles.announcementCard}>
          {activeAnnouncement ? (
            <View>
              <View style={styles.activeAnnBadge}>
                <Text style={styles.activeAnnBadgeText}>Active</Text>
              </View>
              <Text style={styles.annMessage}>{activeAnnouncement.message}</Text>
              <Text style={styles.annMeta}>
                Posted by {activeAnnouncement.authorName} {'\u2022'} {formatTimeAgo(activeAnnouncement.createdAt)}
              </Text>
              <View style={styles.annActions}>
                <TouchableOpacity style={styles.deactivateButton} onPress={handleDeactivate}>
                  <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />
                  <Text style={styles.deactivateText}>Deactivate</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.repliesToggle} onPress={handleShowReplies}>
                  <Ionicons name="chatbubble-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.repliesToggleText}>
                    {activeAnnouncement.replyCount} {activeAnnouncement.replyCount === 1 ? 'Reply' : 'Replies'}
                  </Text>
                  <Ionicons
                    name={showReplies ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={COLORS.primary}
                  />
                </TouchableOpacity>
              </View>
              {showReplies && (
                <View style={styles.repliesList}>
                  {isLoadingReplies ? (
                    <Text style={styles.annMeta}>Loading replies...</Text>
                  ) : replies.length === 0 ? (
                    <Text style={styles.annMeta}>No replies yet</Text>
                  ) : (
                    replies.map((r) => (
                      <View key={r.id} style={styles.replyItem}>
                        <Text style={styles.replyAuthor}>{r.displayName}</Text>
                        <Text style={styles.replyMessage}>{r.message}</Text>
                        <Text style={styles.replyTime}>{formatTimeAgo(r.createdAt)}</Text>
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.annMeta}>No active announcement</Text>
          )}

          <View style={styles.postSection}>
            <Text style={styles.postLabel}>Post New Announcement</Text>
            <TextInput
              style={styles.annInput}
              placeholder="Write an announcement for league members..."
              placeholderTextColor={COLORS.text.muted}
              value={announcementMessage}
              onChangeText={setAnnouncementMessage}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.postButton,
                (!announcementMessage.trim() || isPosting) && styles.postButtonDisabled,
              ]}
              onPress={handlePostAnnouncement}
              disabled={!announcementMessage.trim() || isPosting}
            >
              <Text style={styles.postButtonText}>
                {isPosting ? 'Posting...' : 'Post'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Past Announcements */}
          <TouchableOpacity
            style={styles.historyToggle}
            onPress={() => setShowHistory(!showHistory)}
          >
            <Text style={styles.historyToggleText}>Past Announcements</Text>
            <Ionicons
              name={showHistory ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={COLORS.text.secondary}
            />
          </TouchableOpacity>
          {showHistory && (
            <View style={styles.historyList}>
              {announcementHistory.filter(a => a.id !== activeAnnouncement?.id).length === 0 ? (
                <Text style={styles.annMeta}>No past announcements</Text>
              ) : (
                announcementHistory
                  .filter(a => a.id !== activeAnnouncement?.id)
                  .map((a) => (
                    <View key={a.id} style={styles.historyItem}>
                      <Text style={styles.historyMessage} numberOfLines={2}>{a.message}</Text>
                      <Text style={styles.annMeta}>{formatTimeAgo(a.createdAt)}</Text>
                    </View>
                  ))
              )}
            </View>
          )}
        </Card>
      </View>

      {/* Co-Admin Management Section - Only show for owner and when there are other members */}
      {isOwner && hasOtherMembers && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Co-Admins</Text>
          <Card variant="outlined" style={styles.coAdminCard}>
            <View style={styles.coAdminInfo}>
              <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
              <Text style={styles.coAdminInfoText}>
                Co-admins can invite members, remove members, and manage the league alongside you.
              </Text>
            </View>

            {/* Current Co-Admins */}
            {coAdmins.length > 0 && (
              <View style={styles.coAdminList}>
                <Text style={styles.coAdminSubtitle}>Current Co-Admins</Text>
                {coAdmins.map((member) => (
                  <View key={member.userId} style={styles.coAdminRow}>
                    <View style={styles.memberInfo}>
                      <View style={styles.memberNameRow}>
                        <Text style={styles.memberName}>{member.displayName}</Text>
                        <View style={styles.adminBadge}>
                          <Text style={styles.adminBadgeText}>Admin</Text>
                        </View>
                      </View>
                      <Text style={styles.memberPoints}>{member.totalPoints} pts • Rank #{member.rank}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.demoteButton}
                      onPress={() => handleDemoteFromCoAdmin(member.userId, member.displayName)}
                    >
                      <Ionicons name="arrow-down-circle" size={20} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Promotable Members */}
            {regularMembers.length > 0 && (
              <View style={styles.promotableList}>
                <Text style={styles.coAdminSubtitle}>Promote to Co-Admin</Text>
                {regularMembers.map((member) => (
                  <View key={member.userId} style={styles.promotableRow}>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.displayName}</Text>
                      <Text style={styles.memberPoints}>{member.totalPoints} pts • Rank #{member.rank}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.promoteButton}
                      onPress={() => handlePromoteToCoAdmin(member.userId, member.displayName)}
                    >
                      <Ionicons name="arrow-up-circle" size={20} color={COLORS.success} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {regularMembers.length === 0 && coAdmins.length === 0 && (
              <Text style={styles.noMembersText}>
                Invite members to your league to promote them as co-admins
              </Text>
            )}
          </Card>
        </View>
      )}

      {/* Manage Members Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Members ({members.length})</Text>

        {/* Owner row (always shown, not removable) */}
        {members.filter(m => m.userId === currentLeague.ownerId).map((member) => (
          <View key={member.userId} style={[styles.memberRow, styles.ownerRow]}>
            <View style={styles.memberInfo}>
              <View style={styles.memberNameRow}>
                <Text style={styles.memberName}>{member.displayName}</Text>
                <View style={styles.ownerBadge}>
                  <Text style={styles.ownerBadgeText}>Owner</Text>
                </View>
              </View>
              <Text style={styles.memberPoints}>{member.totalPoints} pts</Text>
            </View>
          </View>
        ))}

        {/* Other members (removable) */}
        {removableMembers.map((member) => {
          const isMemberCoAdmin = coAdminIds.includes(member.userId);
          return (
            <View key={member.userId} style={styles.memberRow}>
              <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                  <Text style={styles.memberName}>{member.displayName}</Text>
                  {isMemberCoAdmin && (
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>Admin</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.memberPoints}>{member.totalPoints} pts • Rank #{member.rank}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveMember(member.userId, member.displayName)}
              >
                <Ionicons name="person-remove" size={18} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          );
        })}

        {removableMembers.length === 0 && (
          <Card variant="outlined" padding="large" style={styles.inviteHintCard}>
            <Ionicons name="people-outline" size={24} color={COLORS.text.muted} />
            <Text style={styles.emptyText}>Share your invite code to grow the league</Text>
          </Card>
        )}
      </View>

      {/* Danger Zone - Only for owner */}
      {isOwner && (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
        <Card variant="outlined" style={styles.dangerCard}>
          {!showDeleteConfirm ? (
            <>
              <View style={styles.dangerInfo}>
                <Ionicons name="warning" size={24} color={COLORS.error} />
                <View style={styles.dangerTextContainer}>
                  <Text style={styles.dangerLabel}>Delete League</Text>
                  <Text style={styles.dangerDescription}>
                    Permanently delete this league and all associated data. This action cannot be undone.
                  </Text>
                </View>
              </View>
              <Button
                title="Delete League"
                onPress={() => setShowDeleteConfirm(true)}
                variant="outline"
                style={styles.deleteButton}
              />
            </>
          ) : (
            <View style={styles.deleteConfirm}>
              <Ionicons name="alert-circle" size={32} color={COLORS.error} />
              <Text style={styles.deleteConfirmTitle}>Are you absolutely sure?</Text>
              <Text style={styles.deleteConfirmText}>
                This will permanently delete the league "{currentLeague.name}" and remove all {members.length} members.
              </Text>
              <Text style={styles.deleteConfirmPrompt}>
                Type <Text style={styles.leagueNameHighlight}>{currentLeague.name.replace(/\s+/g, ' ').trim()}</Text> to confirm:
              </Text>
              <TextInput
                style={styles.deleteConfirmInput}
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                placeholder="Type league name here"
                placeholderTextColor={COLORS.text.muted}
              />
              <View style={styles.deleteConfirmButtons}>
                <Button
                  title="Cancel"
                  onPress={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  variant="outline"
                  style={styles.cancelButton}
                />
                <Button
                  title={isDeleting ? 'Deleting...' : 'Delete Forever'}
                  onPress={handleDeleteLeague}
                  style={styles.confirmDeleteButton}
                  disabled={isDeleting || deleteConfirmText.replace(/\s+/g, ' ').trim() !== currentLeague.name.replace(/\s+/g, ' ').trim()}
                />
              </View>
            </View>
          )}
        </Card>
      </View>
      )}
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },

  headerTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.primary,
  },

  leagueName: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginBottom: SPACING.lg,
  },

  section: {
    marginBottom: SPACING.lg,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.secondary,
    marginBottom: SPACING.sm,
  },

  statsCard: {
    padding: SPACING.md,
  },

  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },

  statItem: {
    alignItems: 'center',
  },

  statValue: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  statLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  topScorer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
    gap: SPACING.xs,
  },

  topScorerText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
  },

  inviteRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },

  emailInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.md,
    color: COLORS.text.primary,
  },

  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.xs,
  },

  inviteButtonDisabled: {
    opacity: 0.6,
  },

  inviteButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.white,
  },

  inviteHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: SPACING.sm,
  },

  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
    gap: SPACING.sm,
  },

  inviteCodeLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },

  inviteCodeValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
    letterSpacing: 2,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  memberInfo: {
    flex: 1,
  },

  memberName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  memberPoints: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  removeButton: {
    padding: SPACING.sm,
    backgroundColor: COLORS.error + '15',
    borderRadius: BORDER_RADIUS.sm,
  },

  // Co-Admin styles
  coAdminCard: {
    padding: SPACING.md,
  },

  coAdminInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  coAdminInfoText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    lineHeight: 20,
  },

  coAdminList: {
    marginBottom: SPACING.md,
  },

  promotableList: {
    marginTop: SPACING.sm,
  },

  coAdminSubtitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.secondary,
    marginBottom: SPACING.sm,
  },

  coAdminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  promotableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  adminBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },

  adminBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.primary,
  },

  promoteButton: {
    padding: SPACING.xs,
  },

  demoteButton: {
    padding: SPACING.xs,
  },

  noMembersText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  dangerTitle: {
    color: COLORS.error,
  },

  dangerCard: {
    borderColor: COLORS.error + '40',
  },

  dangerInfo: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },

  dangerTextContainer: {
    flex: 1,
  },

  dangerLabel: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  dangerDescription: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 4,
  },

  deleteButton: {
    borderColor: COLORS.error,
  },

  deleteConfirm: {
    alignItems: 'center',
  },

  deleteConfirmTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: 'bold',
    color: COLORS.error,
    marginTop: SPACING.sm,
  },

  deleteConfirmText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  deleteConfirmPrompt: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginTop: SPACING.md,
  },

  leagueNameHighlight: {
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  deleteConfirmInput: {
    width: '100%',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.md,
    color: COLORS.text.primary,
    marginTop: SPACING.sm,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: COLORS.error + '40',
  },

  deleteConfirmButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
    width: '100%',
  },

  cancelButton: {
    flex: 1,
  },

  confirmDeleteButton: {
    flex: 1,
    backgroundColor: COLORS.error,
  },

  ownerRow: {
    borderColor: COLORS.primary + '40',
    backgroundColor: COLORS.primary + '08',
  },

  ownerBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },

  ownerBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.primary,
  },

  inviteHintCard: {
    alignItems: 'center',
    gap: SPACING.sm,
  },

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
    textAlign: 'center',
  },

  // Announcement styles
  announcementCard: {
    padding: SPACING.md,
  },

  activeAnnBadge: {
    backgroundColor: COLORS.success + '20',
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
    marginBottom: SPACING.xs,
  },

  activeAnnBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.success,
  },

  annMessage: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.primary,
    lineHeight: 22,
    marginBottom: SPACING.xs,
  },

  annMeta: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
  },

  annActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },

  deactivateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING.xs,
  },

  deactivateText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.error,
    fontWeight: '500',
  },

  repliesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING.xs,
  },

  repliesToggleText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    fontWeight: '500',
  },

  repliesList: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
  },

  replyItem: {
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  replyAuthor: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  replyMessage: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginTop: 2,
  },

  replyTime: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  postSection: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
  },

  postLabel: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.secondary,
    marginBottom: SPACING.xs,
  },

  annInput: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.md,
    color: COLORS.text.primary,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  postButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },

  postButtonDisabled: {
    opacity: 0.5,
  },

  postButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.white,
  },

  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
  },

  historyToggleText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    color: COLORS.text.secondary,
  },

  historyList: {
    marginTop: SPACING.sm,
  },

  historyItem: {
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  historyMessage: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.primary,
  },

  accessDenied: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.background,
  },

  accessDeniedTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginTop: SPACING.md,
  },

  accessDeniedText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  backButton: {
    marginTop: SPACING.lg,
  },
});
