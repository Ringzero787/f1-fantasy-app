import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { S_RADIUS, S_FONTS } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import type { LeagueMember } from '../../types';

export function SimpleLeaguePanel() {
  const { colors, fonts, spacing } = useSimpleTheme();
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
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  // Find the user's league (use leagueId from team, or first league)
  const activeLeague = leagueId
    ? leagues.find((l) => l.id === leagueId) ?? null
    : leagues.length > 0
      ? leagues[0]
      : null;

  const hasLeague = !!activeLeague;

  // Load league data on mount and when active team changes
  useEffect(() => {
    if (userId) {
      loadUserLeagues(userId);
    }
  }, [userId, leagueId]);

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
    const existing = leagues.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setFormError('A league with that name already exists. Choose a different name.');
      return;
    }
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

  const styles = useMemo(() => ({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // -- No league state --
    noLeagueContent: {
      flexGrow: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: spacing.xl,
    },
    emptyIcon: {
      marginBottom: spacing.lg,
    },
    emptyTitle: {
      fontSize: fonts.xxl,
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
    emptySubtitle: {
      fontSize: fonts.md,
      color: colors.text.muted,
      textAlign: 'center' as const,
      lineHeight: 20,
      marginBottom: spacing.xl,
    },
    buttonGroup: {
      width: '100%' as any,
      gap: spacing.sm,
    },
    primaryButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: colors.primary,
      borderRadius: S_RADIUS.md,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    primaryButtonText: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.inverse,
    },
    secondaryButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: colors.background,
      borderRadius: S_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    secondaryButtonText: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.primary,
    },
    // -- Inline form --
    formCard: {
      width: '100%' as any,
      backgroundColor: colors.surface,
      borderRadius: S_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.lg,
    },
    formTitle: {
      fontSize: fonts.lg,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.primary,
      marginBottom: spacing.md,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: S_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: fonts.md,
      color: colors.text.primary,
      marginBottom: spacing.md,
    },
    formError: {
      fontSize: fonts.sm,
      color: colors.negative,
      marginBottom: spacing.sm,
    },
    formButtons: {
      flexDirection: 'row' as const,
      justifyContent: 'flex-end' as const,
      gap: spacing.sm,
    },
    formCancel: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: S_RADIUS.sm,
    },
    formCancelText: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.medium,
      color: colors.text.muted,
    },
    formSubmit: {
      backgroundColor: colors.primary,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xl,
      borderRadius: S_RADIUS.sm,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      minWidth: 80,
    },
    formSubmitDisabled: {
      opacity: 0.6,
    },
    formSubmitText: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.inverse,
    },
    // -- Has league state --
    leagueHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    leagueName: {
      flex: 1,
      fontSize: fonts.lg,
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.primary,
    },
    memberCount: {
      fontSize: fonts.sm,
      color: colors.text.muted,
    },
    inviteSection: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    codeRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.surface,
      borderRadius: S_RADIUS.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    codeLeft: {
      flex: 1,
    },
    codeLabel: {
      fontSize: fonts.xs,
      color: colors.text.muted,
    },
    codeValue: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.bold,
      color: colors.primary,
      letterSpacing: 1.5,
    },
    codeAction: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginLeft: spacing.xs,
    },
    // Points toggle: Season vs Last Race
    pointsToggleWrap: {
      flexDirection: 'row' as const,
      alignSelf: 'center' as const,
      backgroundColor: colors.surface,
      borderRadius: S_RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: 2,
      marginBottom: spacing.sm,
    },
    pointsToggleHalf: {
      paddingVertical: 5,
      paddingHorizontal: spacing.md,
      borderRadius: S_RADIUS.pill,
    },
    pointsToggleActive: {
      backgroundColor: colors.primary,
    },
    pointsToggleText: {
      fontSize: fonts.xs,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.muted,
    },
    pointsToggleTextActive: {
      color: colors.text.inverse,
    },
    // Email modal
    emailModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    emailModalSheet: {
      backgroundColor: colors.background,
      borderRadius: S_RADIUS.lg,
      padding: spacing.xl,
      width: '80%' as any,
      maxWidth: 320,
    },
    emailModalTitle: {
      fontSize: fonts.lg,
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.primary,
      marginBottom: spacing.md,
    },
    emailInput: {
      width: '100%' as any,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: S_RADIUS.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: fonts.lg,
      color: colors.text.primary,
    },
    emailModalButtons: {
      flexDirection: 'row' as const,
      justifyContent: 'flex-end' as const,
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    emailModalCancel: {
      height: 36,
      paddingHorizontal: spacing.lg,
      justifyContent: 'center' as const,
    },
    emailModalCancelText: {
      fontSize: fonts.md,
      color: colors.text.muted,
      fontWeight: S_FONTS.weights.medium,
    },
    emailSendBtn: {
      height: 36,
      paddingHorizontal: spacing.lg,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    emailSendBtnText: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.inverse,
    },
    emailSendBtnDisabled: {
      backgroundColor: colors.border,
    },
    standingsList: {
      flex: 1,
    },
    standingsContent: {
      padding: spacing.lg,
      paddingTop: spacing.sm,
    },
    loadingBox: {
      padding: spacing.xxl,
      alignItems: 'center' as const,
    },
    snackbar: {
      position: 'absolute' as const,
      bottom: spacing.xxl,
      left: spacing.lg,
      right: spacing.lg,
      backgroundColor: colors.text.primary,
      borderRadius: S_RADIUS.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      alignItems: 'center' as const,
    },
    snackbarText: {
      color: colors.background,
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.medium,
    },
  }), [colors, fonts, spacing]);

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
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.emptyIcon}>
          <Ionicons name="trophy-outline" size={48} color={colors.text.muted} />
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
              <Ionicons name="add-circle-outline" size={18} color={colors.text.inverse} />
              <Text style={styles.primaryButtonText}>Create League</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => { clearError(); setFormError(null); setFormMode('join'); }}
              activeOpacity={0.7}
            >
              <Ionicons name="enter-outline" size={18} color={colors.primary} />
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
              placeholderTextColor={colors.text.muted}
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
                  <ActivityIndicator size="small" color={colors.text.inverse} />
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
              placeholderTextColor={colors.text.muted}
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
                  <ActivityIndicator size="small" color={colors.text.inverse} />
                ) : (
                  <Text style={styles.formSubmitText}>Join</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
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
        <Ionicons name="chevron-down" size={14} color={colors.text.muted} />
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
                setSnackbar('Invite code copied to clipboard');
                setTimeout(() => setSnackbar(null), 2500);
              }}
              activeOpacity={0.6}
            >
              <Ionicons name="copy-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.codeAction}
              onPress={async () => {
                if (sharing) return;
                setSharing(true);
                try {
                  await Share.share({
                    message: `Join my Undercut league "${activeLeague.name}"!\n\nInvite code: ${activeLeague.inviteCode}\n\nDownload: https://undercut.humannpc.com`,
                  });
                } finally {
                  setSharing(false);
                }
              }}
              disabled={sharing}
              activeOpacity={0.6}
            >
              <Ionicons name="share-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.codeAction}
              onPress={() => setShowEmailModal(true)}
              activeOpacity={0.6}
            >
              <Ionicons name="mail-outline" size={16} color={colors.primary} />
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
            tintColor={colors.primary}
          />
        }
      >
        {isLoading && members.length === 0 && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
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

      {/* Email invite modal (owner only) */}
      <Modal visible={showEmailModal} transparent animationType="fade" onRequestClose={() => setShowEmailModal(false)}>
        <TouchableOpacity style={styles.emailModalBackdrop} onPress={() => setShowEmailModal(false)} activeOpacity={1}>
          <View style={styles.emailModalSheet}>
            <Text style={styles.emailModalTitle}>Invite by Email</Text>
            <TextInput
              style={styles.emailInput}
              placeholder="Email address"
              placeholderTextColor={colors.text.muted}
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
                    setSnackbar(`Invite sent to ${email}`);
                    setTimeout(() => setSnackbar(null), 3000);
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
                  <ActivityIndicator size="small" color={colors.text.inverse} />
                ) : (
                  <Text style={styles.emailSendBtnText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Snackbar */}
      {snackbar && (
        <View style={styles.snackbar}>
          <Text style={styles.snackbarText}>{snackbar}</Text>
        </View>
      )}
    </View>
  );
}
