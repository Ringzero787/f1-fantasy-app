import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Share,
  Modal,
  StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Avatar } from '../../components/Avatar';
import { generateAvatar, saveAvatarUrl } from '../../services/avatarGeneration.service';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { SimpleStandingsRow } from './SimpleStandingsRow';
import { SimpleMemberTeamView } from './SimpleMemberTeamView';
import { useLeagueStore } from '../../store/league.store';
import { useAuthStore } from '../../store/auth.store';
import { useAdminStore } from '../../store/admin.store';
import { useSimpleTeam } from '../hooks/useSimpleTeam';
import { S_COLORS, S_FONTS, S_SPACING, S_RADIUS } from '../theme/simpleTheme';
import type { LeagueMember } from '../../types';

export function SimpleLeaguePanel() {
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const userId = user?.id ?? '';
  const userName = user?.displayName ?? 'Player';

  const { team, assignTeamToLeague, syncToFirebase } = useSimpleTeam();
  const raceResults = useAdminStore((s) => s.raceResults);
  const leagueId = team?.leagueId ?? null;

  const leagues = useLeagueStore((s) => s.leagues);
  const members = useLeagueStore((s) => s.members);
  const currentLeague = useLeagueStore((s) => s.currentLeague);
  const isLoading = useLeagueStore((s) => s.isLoading);
  const error = useLeagueStore((s) => s.error);
  const clearError = useLeagueStore((s) => s.clearError);
  const loadUserLeagues = useLeagueStore((s) => s.loadUserLeagues);
  const loadLeague = useLeagueStore((s) => s.loadLeague);
  const loadLeagueMembers = useLeagueStore((s) => s.loadLeagueMembers);
  const createLeague = useLeagueStore((s) => s.createLeague);
  const joinLeagueByCode = useLeagueStore((s) => s.joinLeagueByCode);
  const leaveLeague = useLeagueStore((s) => s.leaveLeague);

  const [viewingMember, setViewingMember] = useState<LeagueMember | null>(null);
  const [formMode, setFormMode] = useState<'none' | 'create' | 'join'>('none');
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [showLastRace, setShowLastRace] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Find the user's league (use leagueId from team, or first league)
  const activeLeague = leagueId
    ? leagues.find((l) => l.id === leagueId) ?? currentLeague
    : leagues.length > 0
      ? leagues[0]
      : null;

  const hasLeague = !!activeLeague;

  // Load league data on mount
  useEffect(() => {
    if (userId) {
      loadUserLeagues(userId);
    }
  }, [userId]);

  // When we have a league, load its members
  useEffect(() => {
    if (activeLeague) {
      clearError();
      loadLeague(activeLeague.id).catch(() => {});
      loadLeagueMembers(activeLeague.id).catch(() => {});
    }
  }, [activeLeague?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (userId) {
      await loadUserLeagues(userId);
    }
    if (activeLeague) {
      await loadLeagueMembers(activeLeague.id);
    }
    setRefreshing(false);
  }, [userId, activeLeague?.id]);

  const handleCreate = async () => {
    const name = leagueName.trim();
    if (!name) {
      setFormError('Enter a league name');
      return;
    }
    if (name.length < 3) {
      setFormError('League name must be at least 3 characters');
      return;
    }
    // Check for duplicate name
    const existing = leagues.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setFormError('A league with that name already exists. Choose a different name.');
      return;
    }
    // Also check if user already has a league (simple mode = 1 league)
    if (leagues.length > 0 && team?.leagueId) {
      setFormError('You are already in a league. Leave your current league first.');
      return;
    }
    setFormError(null);
    try {
      const league = await createLeague(userId, userName, {
        name,
        isPublic: false,
        maxMembers: 20,
      }, '2026');
      // Assign team to the new league
      if (team && league) {
        await assignTeamToLeague(team.id, league.id);
        await syncToFirebase();
      }
      setLeagueName('');
      setFormMode('none');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create league';
      setFormError(msg.includes('permission') ? 'Unable to create league. Please try again.' : msg);
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) {
      setFormError('Enter an invite code');
      return;
    }
    setFormError(null);
    try {
      await joinLeagueByCode(inviteCode.trim(), userId, userName);
      // Assign team to the joined league
      const joinedLeague = useLeagueStore.getState().currentLeague;
      if (team && joinedLeague) {
        await assignTeamToLeague(team.id, joinedLeague.id);
        await syncToFirebase();
      }
      setInviteCode('');
      setFormMode('none');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to join league');
    }
  };

  // If viewing a member's team, show that overlay
  if (viewingMember && activeLeague) {
    return (
      <SimpleMemberTeamView
        member={viewingMember}
        leagueId={activeLeague.id}
        onBack={() => setViewingMember(null)}
      />
    );
  }

  // No league state — show join/create prompt
  if (!hasLeague) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.noLeagueContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={S_COLORS.primary}
          />
        }
      >
        <View style={styles.emptyIcon}>
          <Ionicons name="trophy-outline" size={48} color={S_COLORS.text.muted} />
        </View>
        <Text style={styles.emptyTitle}>Join a League</Text>
        <Text style={styles.emptySubtitle}>
          Compete against friends and see who builds the best F1 fantasy team.
        </Text>

        {formMode === 'none' && (
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => { clearError(); setFormError(null); setFormMode('create'); }}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={18} color={S_COLORS.text.inverse} />
              <Text style={styles.primaryButtonText}>Create League</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => { clearError(); setFormError(null); setFormMode('join'); }}
              activeOpacity={0.7}
            >
              <Ionicons name="enter-outline" size={18} color={S_COLORS.primary} />
              <Text style={styles.secondaryButtonText}>Join with Code</Text>
            </TouchableOpacity>
          </View>
        )}

        {formMode === 'create' && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Create a League</Text>
            <TextInput
              style={styles.input}
              placeholder="League name"
              placeholderTextColor={S_COLORS.text.muted}
              value={leagueName}
              onChangeText={setLeagueName}
              autoFocus
              maxLength={30}
            />
            {formError && <Text style={styles.formError}>{formError}</Text>}
            <View style={styles.formButtons}>
              <TouchableOpacity
                style={styles.formCancel}
                onPress={() => { setFormMode('none'); setFormError(null); }}
                activeOpacity={0.7}
              >
                <Text style={styles.formCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formSubmit, isLoading && styles.formSubmitDisabled]}
                onPress={handleCreate}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={S_COLORS.text.inverse} />
                ) : (
                  <Text style={styles.formSubmitText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {formMode === 'join' && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Join a League</Text>
            <TextInput
              style={styles.input}
              placeholder="Invite code"
              placeholderTextColor={S_COLORS.text.muted}
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              autoFocus
              autoCapitalize="characters"
              maxLength={8}
            />
            {formError && <Text style={styles.formError}>{formError}</Text>}
            <View style={styles.formButtons}>
              <TouchableOpacity
                style={styles.formCancel}
                onPress={() => { setFormMode('none'); setFormError(null); }}
                activeOpacity={0.7}
              >
                <Text style={styles.formCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formSubmit, isLoading && styles.formSubmitDisabled]}
                onPress={handleJoin}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={S_COLORS.text.inverse} />
                ) : (
                  <Text style={styles.formSubmitText}>Join</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Errors handled by form-specific error state */}
      </ScrollView>
    );
  }

  // Has league — show standings
  const sortedMembers = [...members].sort((a, b) => b.totalPoints - a.totalPoints);
  const isOwner = activeLeague.ownerId === userId;
  const handleLeagueAvatarTap = () => {
    if (!isOwner) return;
    Alert.alert('League Avatar', 'Choose how to set the league avatar', [
      {
        text: 'Generate with AI',
        onPress: async () => {
          try {
            const result = await generateAvatar(activeLeague.name, 'league', activeLeague.id, 'detailed');
            if (result.success && result.imageUrl) {
              Alert.alert('Done', 'League avatar updated!');
              onRefresh();
            }
          } catch { Alert.alert('Error', 'Generation failed'); }
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) { Alert.alert('Permission Required'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
            });
            if (result.canceled || !result.assets[0]) return;
            if (isDemoMode) { return; }
            const uri = result.assets[0].uri;
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            const { uploadProfileImage } = await import('../../services/profileImage.service');
            const url = await uploadProfileImage(activeLeague.id, base64, 'image/jpeg');
            await saveAvatarUrl('league', activeLeague.id, url);
            Alert.alert('Done', 'League avatar updated!');
            onRefresh();
          } catch { Alert.alert('Error', 'Upload failed'); }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleLeagueTap = () => {
    const buttons: any[] = [];

    if (!isOwner) {
      buttons.push({
        text: 'Leave League',
        style: 'destructive' as const,
        onPress: () => {
          Alert.alert(
            'Leave League?',
            `Are you sure you want to leave "${activeLeague.name}"?\n\nYour team will switch to solo play. Your points and team are preserved, but you won't appear in league standings.\n\nYou can rejoin later with an invite code.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Leave',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await leaveLeague(activeLeague.id, userId);
                    // Clear team's leagueId locally
                    if (team) {
                      const { useTeamStore } = require('../../store/team.store');
                      const currentTeam = useTeamStore.getState().currentTeam;
                      if (currentTeam) {
                        useTeamStore.getState().setCurrentTeam({ ...currentTeam, leagueId: null });
                        await syncToFirebase();
                      }
                    }
                  } catch (e: any) {
                    Alert.alert('Error', e.message || 'Failed to leave league');
                  }
                },
              },
            ],
          );
        },
      });
    } else {
      buttons.push({
        text: 'You are the owner',
        style: 'default' as const,
        onPress: () => {},
      });
    }

    buttons.push({ text: 'Close', style: 'cancel' as const });

    Alert.alert(
      activeLeague.name,
      `${activeLeague.memberCount ?? members.length} members${activeLeague.inviteCode ? `\nInvite code: ${activeLeague.inviteCode}` : ''}`,
      buttons,
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.leagueHeader} onPress={handleLeagueTap} activeOpacity={0.7}>
        <TouchableOpacity onPress={isOwner ? handleLeagueAvatarTap : undefined} activeOpacity={isOwner ? 0.7 : 1}>
          <Avatar name={activeLeague.name} size={28} variant="team" imageUrl={(activeLeague as any).avatarUrl} />
        </TouchableOpacity>
        <Text style={styles.leagueName} numberOfLines={1}>{activeLeague.name}</Text>
        <Ionicons name="chevron-down" size={14} color={S_COLORS.text.muted} />
        <Text style={styles.memberCount}>
          {activeLeague.memberCount ?? members.length} member{(activeLeague.memberCount ?? members.length) !== 1 ? 's' : ''}
        </Text>
      </TouchableOpacity>

      {/* Owner: invite code + copy/share/email */}
      {isOwner && activeLeague.inviteCode && (
        <View style={styles.inviteSection}>
          <View style={styles.codeRow}>
            <View style={styles.codeLeft}>
              <Text style={styles.codeLabel}>Invite Code</Text>
              <Text style={styles.codeValue}>{activeLeague.inviteCode}</Text>
            </View>
            <TouchableOpacity
              style={styles.codeAction}
              onPress={async () => {
                await Clipboard.setStringAsync(activeLeague.inviteCode!);
                Alert.alert('Copied', 'Invite code copied to clipboard');
              }}
              activeOpacity={0.6}
            >
              <Ionicons name="copy-outline" size={16} color={S_COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.codeAction}
              onPress={() => {
                Share.share({
                  message: `Join my Undercut league "${activeLeague.name}"!\n\nInvite code: ${activeLeague.inviteCode}\n\nDownload: https://undercut.humannpc.com`,
                });
              }}
              activeOpacity={0.6}
            >
              <Ionicons name="share-outline" size={16} color={S_COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.codeAction}
              onPress={() => setShowEmailModal(true)}
              activeOpacity={0.6}
            >
              <Ionicons name="mail-outline" size={16} color={S_COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Points toggle: Season vs Last Race */}
      <View style={styles.pointsToggleWrap}>
        <TouchableOpacity
          style={[styles.pointsToggleHalf, !showLastRace && styles.pointsToggleActive]}
          onPress={() => setShowLastRace(false)}
          activeOpacity={0.7}
        >
          <Text style={[styles.pointsToggleText, !showLastRace && styles.pointsToggleTextActive]}>Season</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pointsToggleHalf, showLastRace && styles.pointsToggleActive]}
          onPress={() => setShowLastRace(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.pointsToggleText, showLastRace && styles.pointsToggleTextActive]}>Last Race</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.standingsList}
        contentContainerStyle={styles.standingsContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={S_COLORS.primary}
          />
        }
      >
        {isLoading && members.length === 0 && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={S_COLORS.primary} />
          </View>
        )}

        {!isLoading && members.length === 0 && (
          <View style={styles.loadingBox}>
            <Text style={styles.emptySubtitle}>No members yet. Share the invite code!</Text>
          </View>
        )}

        {sortedMembers.map((member, index) => (
          <SimpleStandingsRow
            key={member.id ?? member.userId}
            member={{ ...member, rank: index + 1 }}
            isCurrentUser={member.userId === userId}
            onPress={() => setViewingMember(member)}
            showLastRace={showLastRace}
            lastRacePoints={(member as any).lastRacePoints ?? 0}
          />
        ))}
      </ScrollView>

      {/* Errors handled by form-specific error state */}

      {/* Email invite modal (owner only) */}
      <Modal visible={showEmailModal} transparent animationType="fade" onRequestClose={() => setShowEmailModal(false)}>
        <TouchableOpacity style={styles.emailModalBackdrop} onPress={() => setShowEmailModal(false)} activeOpacity={1}>
          <View style={styles.emailModalSheet}>
            <Text style={styles.emailModalTitle}>Invite by Email</Text>
            <TextInput
              style={styles.emailInput}
              placeholder="Email address"
              placeholderTextColor={S_COLORS.text.muted}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <View style={styles.emailModalButtons}>
              <TouchableOpacity style={styles.emailModalCancel} onPress={() => setShowEmailModal(false)}>
                <Text style={styles.emailModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.emailSendBtn, (!inviteEmail.trim() || sendingInvite) && styles.emailSendBtnDisabled]}
                onPress={async () => {
                  const email = inviteEmail.trim();
                  if (!email || !email.includes('@')) {
                    Alert.alert('Invalid Email', 'Please enter a valid email address.');
                    return;
                  }
                  setSendingInvite(true);
                  try {
                    await addDoc(collection(db, `leagues/${activeLeague.id}/invites`), {
                      email,
                      status: 'pending',
                      sentBy: userId,
                      createdAt: new Date().toISOString(),
                    });
                    setInviteEmail('');
                    setShowEmailModal(false);
                    Alert.alert('Sent', `Invite sent to ${email}`);
                  } catch (err) {
                    Alert.alert('Error', 'Failed to send invite. Try again.');
                  } finally {
                    setSendingInvite(false);
                  }
                }}
                disabled={!inviteEmail.trim() || sendingInvite}
                activeOpacity={0.6}
              >
                {sendingInvite ? (
                  <ActivityIndicator size="small" color={S_COLORS.text.inverse} />
                ) : (
                  <Text style={styles.emailSendBtnText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: S_COLORS.background,
  },
  // -- No league state --
  noLeagueContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: S_SPACING.xl,
  },
  emptyIcon: {
    marginBottom: S_SPACING.lg,
  },
  emptyTitle: {
    fontSize: S_FONTS.sizes.xxl,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.text.primary,
    marginBottom: S_SPACING.sm,
  },
  emptySubtitle: {
    fontSize: S_FONTS.sizes.md,
    color: S_COLORS.text.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: S_SPACING.xl,
  },
  buttonGroup: {
    width: '100%',
    gap: S_SPACING.sm,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: S_COLORS.primary,
    borderRadius: S_RADIUS.md,
    paddingVertical: S_SPACING.md,
    gap: S_SPACING.sm,
  },
  primaryButtonText: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.inverse,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: S_COLORS.background,
    borderRadius: S_RADIUS.md,
    borderWidth: 1,
    borderColor: S_COLORS.primary,
    paddingVertical: S_SPACING.md,
    gap: S_SPACING.sm,
  },
  secondaryButtonText: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.primary,
  },
  // -- Inline form --
  formCard: {
    width: '100%',
    backgroundColor: S_COLORS.surface,
    borderRadius: S_RADIUS.md,
    borderWidth: 1,
    borderColor: S_COLORS.borderLight,
    padding: S_SPACING.lg,
  },
  formTitle: {
    fontSize: S_FONTS.sizes.lg,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.primary,
    marginBottom: S_SPACING.md,
  },
  input: {
    backgroundColor: S_COLORS.background,
    borderRadius: S_RADIUS.sm,
    borderWidth: 1,
    borderColor: S_COLORS.border,
    paddingHorizontal: S_SPACING.md,
    paddingVertical: S_SPACING.sm,
    fontSize: S_FONTS.sizes.md,
    color: S_COLORS.text.primary,
    marginBottom: S_SPACING.md,
  },
  formError: {
    fontSize: S_FONTS.sizes.sm,
    color: S_COLORS.negative,
    marginBottom: S_SPACING.sm,
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: S_SPACING.sm,
  },
  formCancel: {
    paddingVertical: S_SPACING.sm,
    paddingHorizontal: S_SPACING.lg,
    borderRadius: S_RADIUS.sm,
  },
  formCancelText: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.medium,
    color: S_COLORS.text.muted,
  },
  formSubmit: {
    backgroundColor: S_COLORS.primary,
    paddingVertical: S_SPACING.sm,
    paddingHorizontal: S_SPACING.xl,
    borderRadius: S_RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  formSubmitDisabled: {
    opacity: 0.6,
  },
  formSubmitText: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.inverse,
  },
  storeError: {
    fontSize: S_FONTS.sizes.sm,
    color: S_COLORS.negative,
    textAlign: 'center',
    padding: S_SPACING.sm,
  },
  // -- Has league state --
  leagueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S_SPACING.lg,
    paddingTop: S_SPACING.md,
    paddingBottom: S_SPACING.sm,
    gap: S_SPACING.sm,
  },
  leagueName: {
    flex: 1,
    fontSize: S_FONTS.sizes.lg,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.text.primary,
  },
  memberCount: {
    fontSize: S_FONTS.sizes.sm,
    color: S_COLORS.text.muted,
  },
  inviteSection: {
    marginHorizontal: S_SPACING.lg,
    marginBottom: S_SPACING.sm,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: S_COLORS.surface,
    borderRadius: S_RADIUS.sm,
    paddingHorizontal: S_SPACING.md,
    paddingVertical: S_SPACING.sm,
  },
  codeLeft: {
    flex: 1,
  },
  codeLabel: {
    fontSize: S_FONTS.sizes.xs,
    color: S_COLORS.text.muted,
  },
  codeValue: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.primary,
    letterSpacing: 1.5,
  },
  codeAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: S_SPACING.xs,
  },
  emailInviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S_SPACING.sm,
    marginTop: S_SPACING.sm,
  },
  emailInput: {
    width: '100%',
    backgroundColor: S_COLORS.surface,
    borderWidth: 1,
    borderColor: S_COLORS.border,
    borderRadius: S_RADIUS.md,
    paddingHorizontal: S_SPACING.lg,
    paddingVertical: S_SPACING.md,
    fontSize: S_FONTS.sizes.lg,
    color: S_COLORS.text.primary,
  },
  emailSendBtn: {
    height: 36,
    paddingHorizontal: S_SPACING.lg,
    borderRadius: 18,
    backgroundColor: S_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailSendBtnText: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.inverse,
  },
  emailSendBtnDisabled: {
    backgroundColor: S_COLORS.border,
  },
  // Points toggle: Season vs Last Race
  pointsToggleWrap: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: S_COLORS.surface,
    borderRadius: S_RADIUS.pill,
    borderWidth: 1,
    borderColor: S_COLORS.borderLight,
    padding: 2,
    marginBottom: S_SPACING.sm,
  },
  pointsToggleHalf: {
    paddingVertical: 5,
    paddingHorizontal: S_SPACING.md,
    borderRadius: S_RADIUS.pill,
  },
  pointsToggleActive: {
    backgroundColor: S_COLORS.primary,
  },
  pointsToggleText: {
    fontSize: S_FONTS.sizes.xs,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.muted,
  },
  pointsToggleTextActive: {
    color: S_COLORS.text.inverse,
  },
  // Email modal
  emailModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emailModalSheet: {
    backgroundColor: S_COLORS.background,
    borderRadius: S_RADIUS.lg,
    padding: S_SPACING.xl,
    width: '80%',
    maxWidth: 320,
  },
  emailModalTitle: {
    fontSize: S_FONTS.sizes.lg,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.text.primary,
    marginBottom: S_SPACING.md,
  },
  emailModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: S_SPACING.sm,
    marginTop: S_SPACING.md,
  },
  emailModalCancel: {
    height: 36,
    paddingHorizontal: S_SPACING.lg,
    justifyContent: 'center',
  },
  emailModalCancelText: {
    fontSize: S_FONTS.sizes.md,
    color: S_COLORS.text.muted,
    fontWeight: S_FONTS.weights.medium,
  },
  standingsList: {
    flex: 1,
  },
  standingsContent: {
    padding: S_SPACING.lg,
    paddingTop: S_SPACING.sm,
  },
  loadingBox: {
    padding: S_SPACING.xxl,
    alignItems: 'center',
  },
});
