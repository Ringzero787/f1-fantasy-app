import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../../src/hooks/useAuth';
import { useLeagueStore } from '../../../../src/store/league.store';
import { useTeamStore } from '../../../../src/store/team.store';
import { useAnnouncementStore } from '../../../../src/store/announcement.store';
import { usePurchaseStore } from '../../../../src/store/purchase.store';
import { useAuthStore } from '../../../../src/store/auth.store';
import { Card, Button, Loading, PurchaseModal } from '../../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SLOTS_PER_EXPANSION } from '../../../../src/config/constants';
import { PRODUCTS, PRODUCT_IDS } from '../../../../src/config/products';
import { validateLeagueName } from '../../../../src/utils/validation';

export default function LeagueAdminScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const {
    currentLeague,
    members,
    pendingMembers,
    isLoading,
    loadLeague,
    loadLeagueMembers,
    loadPendingMembers,
    deleteLeague,
    updateLeagueDetails,
    removeMember,
    inviteMemberByEmail,
    promoteToCoAdmin,
    demoteFromCoAdmin,
    isUserAdmin,
    approveMember,
    rejectMember,
    updateLeagueSettings,
    expandLeagueCapacity,
  } = useLeagueStore();
  const { loadUserTeams } = useTeamStore();

  // Purchase store
  const purchaseLeagueExpansion = usePurchaseStore(s => s.purchaseLeagueExpansion);
  const hasExpansionCredit = usePurchaseStore(s => s.hasExpansionCredit);
  const consumeExpansionCredit = usePurchaseStore(s => s.consumeExpansionCredit);
  const isPurchasing = usePurchaseStore(s => s.isPurchasing);
  const isDemoMode = useAuthStore.getState().isDemoMode;

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
  const [isApprovingOrRejecting, setIsApprovingOrRejecting] = useState<string | null>(null);

  // Expansion purchase state
  const [showExpansionPurchase, setShowExpansionPurchase] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);

  // Inline edit state for name & description
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Load league data and members on mount
  useEffect(() => {
    if (id && user) {
      loadLeague(id);
      loadPendingMembers(id);
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

  const handleApproveMember = async (memberId: string, memberName: string) => {
    setIsApprovingOrRejecting(memberId);
    try {
      await approveMember(currentLeague.id, memberId);
      Alert.alert('Approved', `${memberName} has been approved and added to the league.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve member';
      Alert.alert('Error', message);
    } finally {
      setIsApprovingOrRejecting(null);
    }
  };

  const handleRejectMember = (memberId: string, memberName: string) => {
    Alert.alert(
      'Reject Request',
      `Are you sure you want to reject ${memberName}'s request? They can request again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setIsApprovingOrRejecting(memberId);
            try {
              await rejectMember(currentLeague.id, memberId);
            } catch (error) {
              Alert.alert('Error', 'Failed to reject member');
            } finally {
              setIsApprovingOrRejecting(null);
            }
          },
        },
      ]
    );
  };

  const handleToggleRequireApproval = async (value: boolean) => {
    try {
      await updateLeagueSettings(currentLeague.id, { requireApproval: value });
    } catch (error) {
      Alert.alert('Error', 'Failed to update setting');
    }
  };

  const handleExpandSlots = async () => {
    if (!currentLeague) return;

    // In demo mode, just expand directly
    if (isDemoMode) {
      setIsExpanding(true);
      try {
        await expandLeagueCapacity(currentLeague.id, SLOTS_PER_EXPANSION);
        Alert.alert('Slots Added', `${SLOTS_PER_EXPANSION} member slots have been added to your league! (Demo mode)`);
      } catch (error) {
        Alert.alert('Error', 'Failed to expand league capacity');
      } finally {
        setIsExpanding(false);
      }
      return;
    }

    // Check if user already has an expansion credit
    if (hasExpansionCredit()) {
      setIsExpanding(true);
      try {
        consumeExpansionCredit();
        await expandLeagueCapacity(currentLeague.id, SLOTS_PER_EXPANSION);
        Alert.alert('Slots Added', `${SLOTS_PER_EXPANSION} member slots have been added to your league!`);
      } catch (error) {
        Alert.alert('Error', 'Failed to expand league capacity');
      } finally {
        setIsExpanding(false);
      }
    } else {
      // Show purchase modal
      setShowExpansionPurchase(true);
    }
  };

  const handleExpansionPurchaseComplete = async () => {
    setShowExpansionPurchase(false);
    await purchaseLeagueExpansion(currentLeague?.id);

    // After purchase, consume the credit and expand
    // Small delay to let the purchase state update
    setTimeout(async () => {
      if (currentLeague && hasExpansionCredit()) {
        setIsExpanding(true);
        try {
          consumeExpansionCredit();
          await expandLeagueCapacity(currentLeague.id, SLOTS_PER_EXPANSION);
          Alert.alert('Slots Added', `${SLOTS_PER_EXPANSION} member slots have been added to your league!`);
        } catch (error) {
          Alert.alert('Error', 'Failed to expand league capacity');
        } finally {
          setIsExpanding(false);
        }
      }
    }, 500);
  };

  const handleStartEditName = () => {
    setEditName(currentLeague.name);
    setEditingName(true);
  };

  const handleSaveName = async () => {
    const trimmed = editName.trim();
    if (trimmed === currentLeague.name) {
      setEditingName(false);
      return;
    }
    const validation = validateLeagueName(trimmed);
    if (!validation.isValid) {
      Alert.alert('Invalid Name', validation.error || 'Please enter a valid league name');
      return;
    }
    setIsSavingDetails(true);
    try {
      await updateLeagueDetails(currentLeague.id, user!.id, { name: trimmed });
      setEditingName(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update name';
      Alert.alert('Error', message);
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleStartEditDescription = () => {
    setEditDescription(currentLeague.description || '');
    setEditingDescription(true);
  };

  const handleSaveDescription = async () => {
    const trimmed = editDescription.trim();
    const currentDesc = currentLeague.description || '';
    if (trimmed === currentDesc) {
      setEditingDescription(false);
      return;
    }
    if (trimmed.length > 200) {
      Alert.alert('Too Long', 'Description must be 200 characters or fewer');
      return;
    }
    setIsSavingDetails(true);
    try {
      await updateLeagueDetails(currentLeague.id, user!.id, { description: trimmed });
      setEditingDescription(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update description';
      Alert.alert('Error', message);
    } finally {
      setIsSavingDetails(false);
    }
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
      {/* Editable League Name */}
      {editingName ? (
        <View style={styles.editRow}>
          <TextInput
            style={styles.editNameInput}
            value={editName}
            onChangeText={setEditName}
            maxLength={50}
            autoFocus
            selectTextOnFocus
          />
          <TouchableOpacity
            style={styles.editSaveButton}
            onPress={handleSaveName}
            disabled={isSavingDetails}
          >
            <Ionicons name="checkmark" size={20} color={COLORS.success} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.editCancelButton}
            onPress={() => setEditingName(false)}
          >
            <Ionicons name="close" size={20} color={COLORS.text.muted} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.editableRow} onPress={isOwner ? handleStartEditName : undefined} activeOpacity={isOwner ? 0.6 : 1}>
          <Text style={styles.leagueName}>{currentLeague.name}</Text>
          {isOwner && <Ionicons name="pencil" size={16} color={COLORS.text.muted} />}
        </TouchableOpacity>
      )}

      {/* Editable Description */}
      {editingDescription ? (
        <View style={styles.editDescriptionContainer}>
          <TextInput
            style={styles.editDescriptionInput}
            value={editDescription}
            onChangeText={setEditDescription}
            maxLength={200}
            multiline
            autoFocus
            placeholder="Add a description..."
            placeholderTextColor={COLORS.text.muted}
          />
          <View style={styles.editDescriptionActions}>
            <Text style={styles.charCount}>{editDescription.length}/200</Text>
            <View style={styles.editButtonGroup}>
              <TouchableOpacity
                style={styles.editSaveButton}
                onPress={handleSaveDescription}
                disabled={isSavingDetails}
              >
                <Ionicons name="checkmark" size={20} color={COLORS.success} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editCancelButton}
                onPress={() => setEditingDescription(false)}
              >
                <Ionicons name="close" size={20} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.editableDescriptionRow}
          onPress={isOwner ? handleStartEditDescription : undefined}
          activeOpacity={isOwner ? 0.6 : 1}
        >
          <Text style={currentLeague.description ? styles.descriptionText : styles.descriptionPlaceholder}>
            {currentLeague.description || (isOwner ? 'Add a description...' : 'No description')}
          </Text>
          {isOwner && <Ionicons name="pencil" size={14} color={COLORS.text.muted} />}
        </TouchableOpacity>
      )}

      {/* Require Approval Toggle */}
      {isOwner && (
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Require Approval</Text>
              <Text style={styles.switchDescription}>
                New members must be approved before joining
              </Text>
            </View>
            <Switch
              value={currentLeague.settings?.requireApproval === true}
              onValueChange={handleToggleRequireApproval}
              trackColor={{ false: COLORS.border.default, true: COLORS.primary + '60' }}
              thumbColor={currentLeague.settings?.requireApproval ? COLORS.primary : COLORS.surface}
            />
          </View>
        </View>
      )}

      {/* Pending Requests Section */}
      {pendingMembers.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
              Pending Requests
            </Text>
            <View style={styles.pendingCountBadge}>
              <Text style={styles.pendingCountText}>{pendingMembers.length}</Text>
            </View>
          </View>
          {currentLeague.memberCount >= currentLeague.maxMembers && (
            <View style={styles.fullWarning}>
              <Ionicons name="warning" size={16} color={COLORS.warning} />
              <Text style={styles.fullWarningText}>
                League is full ({currentLeague.memberCount}/{currentLeague.maxMembers}). Remove a member to approve new requests.
              </Text>
            </View>
          )}
          <Card variant="outlined" style={styles.pendingCard}>
            {pendingMembers.map((member) => (
              <View key={member.userId} style={styles.pendingRow}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.displayName}</Text>
                  <Text style={styles.memberPoints}>
                    Requested {formatTimeAgo(member.joinedAt)}
                  </Text>
                </View>
                {isApprovingOrRejecting === member.userId ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <View style={styles.pendingActions}>
                    <TouchableOpacity
                      style={styles.approveButton}
                      onPress={() => handleApproveMember(member.userId, member.displayName)}
                      disabled={currentLeague.memberCount >= currentLeague.maxMembers}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color={currentLeague.memberCount >= currentLeague.maxMembers ? COLORS.text.muted : COLORS.success}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectButton}
                      onPress={() => handleRejectMember(member.userId, member.displayName)}
                    >
                      <Ionicons name="close-circle" size={24} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </Card>
        </View>
      )}

      {/* Slot Capacity Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Member Capacity</Text>
        <Card variant="outlined" style={styles.capacityCard}>
          {(() => {
            const used = currentLeague.memberCount;
            const max = currentLeague.maxMembers;
            const pct = max > 0 ? used / max : 0;
            const remaining = max - used;
            const barColor = pct > 0.9 ? COLORS.error : pct >= 0.75 ? COLORS.warning : COLORS.success;
            return (
              <>
                <View style={styles.capacityHeader}>
                  <Text style={styles.capacityTitle}>
                    Members: {used} / {max}
                  </Text>
                  <Text style={[styles.capacityPct, { color: barColor }]}>
                    {Math.round(pct * 100)}%
                  </Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${Math.min(pct * 100, 100)}%`, backgroundColor: barColor }]} />
                </View>
                {pct >= 0.75 && (
                  <View style={[styles.capacityWarning, { borderColor: barColor + '30', backgroundColor: barColor + '10' }]}>
                    <Ionicons name="warning" size={14} color={barColor} />
                    <Text style={[styles.capacityWarningText, { color: barColor }]}>
                      {remaining <= 0
                        ? 'League is full! Add more slots to accept new members.'
                        : `Only ${remaining} slot${remaining === 1 ? '' : 's'} remaining`}
                    </Text>
                  </View>
                )}
                {isOwner && (
                  <TouchableOpacity
                    style={[styles.expandButton, isExpanding && { opacity: 0.6 }]}
                    onPress={handleExpandSlots}
                    disabled={isExpanding}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
                    <Text style={styles.expandButtonText}>
                      {isExpanding ? 'Adding...' : `Add ${SLOTS_PER_EXPANSION} Slots \u2014 $4.99`}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            );
          })()}
        </Card>
      </View>

      {/* Stats Section */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>League Stats</Text>
          <Text style={styles.foundedText}>Founded {new Date(currentLeague.createdAt).getFullYear()}</Text>
        </View>
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
      {/* League Expansion Purchase Modal */}
      <PurchaseModal
        visible={showExpansionPurchase}
        onClose={() => setShowExpansionPurchase(false)}
        onPurchase={handleExpansionPurchaseComplete}
        isLoading={isPurchasing}
        title={PRODUCTS[PRODUCT_IDS.LEAGUE_EXPANSION].title}
        description={PRODUCTS[PRODUCT_IDS.LEAGUE_EXPANSION].description}
        price={PRODUCTS[PRODUCT_IDS.LEAGUE_EXPANSION].price}
        icon={PRODUCTS[PRODUCT_IDS.LEAGUE_EXPANSION].icon}
        benefits={PRODUCTS[PRODUCT_IDS.LEAGUE_EXPANSION].benefits}
      />
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
    flex: 1,
  },

  editableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },

  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },

  editNameInput: {
    flex: 1,
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },

  editSaveButton: {
    padding: SPACING.xs,
    backgroundColor: COLORS.success + '15',
    borderRadius: BORDER_RADIUS.sm,
  },

  editCancelButton: {
    padding: SPACING.xs,
    backgroundColor: COLORS.text.muted + '15',
    borderRadius: BORDER_RADIUS.sm,
  },

  editableDescriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },

  descriptionText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    flex: 1,
  },

  descriptionPlaceholder: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    fontStyle: 'italic',
    flex: 1,
  },

  editDescriptionContainer: {
    marginBottom: SPACING.lg,
  },

  editDescriptionInput: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.primary,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
    minHeight: 60,
    textAlignVertical: 'top',
  },

  editDescriptionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
  },

  charCount: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
  },

  editButtonGroup: {
    flexDirection: 'row',
    gap: SPACING.xs,
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

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },

  foundedText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    fontStyle: 'italic',
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

  // Require Approval Toggle
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  switchInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },

  switchLabel: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  switchDescription: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  // Pending Requests
  pendingCountBadge: {
    backgroundColor: COLORS.warning,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },

  pendingCountText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: 'bold',
    color: COLORS.white,
  },

  pendingCard: {
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },

  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  pendingActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },

  approveButton: {
    padding: SPACING.xs,
  },

  rejectButton: {
    padding: SPACING.xs,
  },

  fullWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.warning + '15',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },

  fullWarningText: {
    flex: 1,
    fontSize: FONTS.sizes.xs,
    color: COLORS.warning,
    lineHeight: 16,
  },

  // Capacity section
  capacityCard: {
    padding: SPACING.md,
  },

  capacityHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },

  capacityTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  capacityPct: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
  },

  progressBarBg: {
    height: 8,
    backgroundColor: COLORS.border.default,
    borderRadius: 4,
    overflow: 'hidden',
  },

  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },

  capacityWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
    borderWidth: 1,
  },

  capacityWarningText: {
    flex: 1,
    fontSize: FONTS.sizes.xs,
    lineHeight: 16,
  },

  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary + '15',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },

  expandButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
