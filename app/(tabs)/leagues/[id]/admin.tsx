import React, { useState } from 'react';
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
import { Card, Button, Loading } from '../../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../../../src/config/constants';

export default function LeagueAdminScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const {
    currentLeague,
    members,
    isLoading,
    deleteLeague,
    removeMember,
    inviteMemberByEmail,
  } = useLeagueStore();

  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Check if user is owner
  const isOwner = currentLeague?.ownerId === user?.id;

  if (!isOwner) {
    return (
      <View style={styles.accessDenied}>
        <Ionicons name="lock-closed" size={48} color={COLORS.gray[400]} />
        <Text style={styles.accessDeniedTitle}>Access Denied</Text>
        <Text style={styles.accessDeniedText}>
          Only league owners can access this page.
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
      Alert.alert('Success', `Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
    } catch (error) {
      Alert.alert('Error', 'Failed to send invitation');
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
    if (deleteConfirmText !== currentLeague.name) {
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

  // Filter out the owner from removable members
  const removableMembers = members.filter((m) => m.userId !== currentLeague.ownerId);

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
              placeholderTextColor={COLORS.gray[400]}
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
                  <Ionicons name="paper-plane" size={16} color={COLORS.white} />
                  <Text style={styles.inviteButtonText}>Invite</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.inviteHint}>
            An invitation will be sent to join your league
          </Text>
        </Card>
      </View>

      {/* Manage Members Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Manage Members</Text>
        {removableMembers.length > 0 ? (
          removableMembers.map((member) => (
            <View key={member.userId} style={styles.memberRow}>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.displayName}</Text>
                <Text style={styles.memberPoints}>{member.totalPoints} pts • Rank #{member.rank}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveMember(member.userId, member.displayName)}
              >
                <Ionicons name="person-remove" size={18} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Card variant="outlined" padding="large">
            <Text style={styles.emptyText}>No other members to manage</Text>
          </Card>
        )}
      </View>

      {/* Danger Zone */}
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
                Type <Text style={styles.leagueNameHighlight}>{currentLeague.name}</Text> to confirm:
              </Text>
              <TextInput
                style={styles.deleteConfirmInput}
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                placeholder="Type league name here"
                placeholderTextColor={COLORS.gray[400]}
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
                  disabled={isDeleting || deleteConfirmText !== currentLeague.name}
                />
              </View>
            </View>
          )}
        </Card>
      </View>
    </ScrollView>
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
    color: COLORS.gray[900],
    marginBottom: SPACING.lg,
  },

  section: {
    marginBottom: SPACING.lg,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[700],
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
    color: COLORS.gray[900],
  },

  statLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[500],
    marginTop: 2,
  },

  topScorer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[100],
    gap: SPACING.xs,
  },

  topScorerText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[600],
  },

  inviteRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },

  emailInput: {
    flex: 1,
    backgroundColor: COLORS.gray[50],
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[900],
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
    color: COLORS.gray[500],
    marginTop: SPACING.sm,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },

  memberInfo: {
    flex: 1,
  },

  memberName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[900],
  },

  memberPoints: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
    marginTop: 2,
  },

  removeButton: {
    padding: SPACING.sm,
    backgroundColor: COLORS.error + '15',
    borderRadius: BORDER_RADIUS.sm,
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
    color: COLORS.gray[900],
  },

  dangerDescription: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
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
    color: COLORS.gray[600],
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  deleteConfirmPrompt: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[700],
    marginTop: SPACING.md,
  },

  leagueNameHighlight: {
    fontWeight: 'bold',
    color: COLORS.gray[900],
  },

  deleteConfirmInput: {
    width: '100%',
    backgroundColor: COLORS.gray[50],
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[900],
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

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[500],
    textAlign: 'center',
  },

  accessDenied: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.gray[50],
  },

  accessDeniedTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.gray[900],
    marginTop: SPACING.md,
  },

  accessDeniedText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[500],
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  backButton: {
    marginTop: SPACING.lg,
  },
});
