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
import { S_RADIUS, S_FONT_FAMILY } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import type { LeagueMember } from '../../types';

export function SimpleLeaguePanel() {
  const { colors, fonts, spacing, scaled, displayUpright } = useSimpleTheme();
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
  const [copied, setCopied] = useState(false);

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
      await loadLeagueMembers(activeLeague.id, true); // force refresh, bypass cache
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
      width: scaled(80),
      height: scaled(80),
      borderRadius: S_RADIUS.full,
      backgroundColor: colors.primaryFaint,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: scaled(20),
    },
    emptyTitle: {
      ...displayUpright,
      fontSize: scaled(26),
      letterSpacing: -0.5,
      color: colors.text.primary,
      textAlign: 'center' as const,
      marginBottom: spacing.sm,
    },
    emptySubtitle: {
      fontSize: scaled(14.5),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.secondary,
      textAlign: 'center' as const,
      lineHeight: scaled(20),
      marginBottom: scaled(28),
    },
    buttonGroup: {
      width: '100%' as any,
      gap: 10,
    },
    primaryButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: colors.primary,
      borderRadius: S_RADIUS.lg,
      paddingVertical: scaled(14),
      gap: spacing.sm,
    },
    primaryButtonText: {
      fontSize: scaled(15),
      fontFamily: S_FONT_FAMILY.body.semibold,
      letterSpacing: 0.2,
      color: colors.text.inverse,
    },
    secondaryButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: 'transparent',
      borderRadius: S_RADIUS.lg,
      borderWidth: 1.5,
      borderColor: colors.primary,
      paddingVertical: scaled(14),
      gap: spacing.sm,
    },
    secondaryButtonText: {
      fontSize: scaled(15),
      fontFamily: S_FONT_FAMILY.body.semibold,
      letterSpacing: 0.2,
      color: colors.primary,
    },
    // -- Inline form --
    formCard: {
      width: '100%' as any,
      backgroundColor: colors.card,
      borderRadius: S_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    formTitle: {
      fontSize: fonts.lg,
      fontFamily: S_FONT_FAMILY.body.semibold,
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
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.primary,
      marginBottom: spacing.md,
    },
    formError: {
      fontSize: fonts.sm,
      fontFamily: S_FONT_FAMILY.body.regular,
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
      fontFamily: S_FONT_FAMILY.body.medium,
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
      fontFamily: S_FONT_FAMILY.body.semibold,
      color: colors.text.inverse,
    },
    // -- Has league state --
    leagueHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: scaled(12),
    },
    leagueName: {
      ...displayUpright,
      flex: 1,
      minWidth: 0,
      fontSize: scaled(19),
      letterSpacing: -0.3,
      color: colors.text.primary,
    },
    memberBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      flexShrink: 0,
    },
    memberCount: {
      fontSize: scaled(13.5),
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.text.secondary,
    },
    inviteSection: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    codeRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: scaled(12),
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: S_RADIUS.lg,
      paddingHorizontal: scaled(16),
      paddingVertical: scaled(14),
    },
    codeLeft: {
      flex: 1,
    },
    codeLabel: {
      fontSize: scaled(11.5),
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.text.muted,
      letterSpacing: 0.3,
      textTransform: 'uppercase' as const,
    },
    codeValue: {
      ...displayUpright,
      fontSize: scaled(22),
      color: colors.primary,
      letterSpacing: 3,
      marginTop: 4,
    },
    codeAction: {
      width: scaled(36),
      height: scaled(36),
      borderRadius: S_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'transparent',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    codeActionCopied: {
      backgroundColor: colors.positiveFaint,
    },
    // Points toggle: Season vs Last Race
    pointsToggleWrap: {
      flexDirection: 'row' as const,
      alignSelf: 'center' as const,
      backgroundColor: colors.surface,
      borderRadius: S_RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      gap: 2,
      marginBottom: spacing.sm,
    },
    pointsToggleHalf: {
      paddingVertical: scaled(7),
      paddingHorizontal: scaled(22),
      borderRadius: S_RADIUS.pill,
    },
    pointsToggleActive: {
      backgroundColor: colors.primary,
    },
    pointsToggleText: {
      fontSize: scaled(13.5),
      fontFamily: S_FONT_FAMILY.body.semibold,
      color: colors.text.secondary,
    },
    pointsToggleTextActive: {
      color: colors.text.inverse,
    },
    // Email modal
    emailModalBackdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    emailModalSheet: {
      backgroundColor: colors.card,
      borderRadius: S_RADIUS.sheet,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      width: '80%' as any,
      maxWidth: 320,
    },
    emailModalTitle: {
      fontSize: fonts.lg,
      fontFamily: S_FONT_FAMILY.body.bold,
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
      fontFamily: S_FONT_FAMILY.body.regular,
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
      fontFamily: S_FONT_FAMILY.body.medium,
    },
    emailSendBtn: {
      height: 36,
      paddingHorizontal: spacing.lg,
      borderRadius: S_RADIUS.md,
      backgroundColor: colors.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    emailSendBtnText: {
      fontSize: fonts.md,
      fontFamily: S_FONT_FAMILY.body.semibold,
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
      fontFamily: S_FONT_FAMILY.body.medium,
    },
  }), [colors, fonts, spacing, scaled, displayUpright]);

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
          <Ionicons name="trophy-outline" size={scaled(38)} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>Join a league</Text>
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
              <Ionicons name="add" size={18} color={colors.text.inverse} />
              <Text style={styles.primaryButtonText}>Create league</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => { clearError(); setFormError(null); setFormMode('join'); }}
              activeOpacity={0.7}
            >
              <Ionicons name="enter-outline" size={18} color={colors.primary} />
              <Text style={styles.secondaryButtonText}>Join with code</Text>
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

  // Has league — show standings. Deterministic tiebreaks matching the server's
  // rankLeagueMembers (totalPoints desc, lastRacePoints desc, userId asc) so
  // tied members never swap order between refreshes; `|| 0` guards NaN from a
  // member doc missing totalPoints (NaN comparator corrupts the whole sort).
  const sortedMembers = [...members].sort((a, b) => {
    const byTotal = (b.totalPoints || 0) - (a.totalPoints || 0);
    if (byTotal !== 0) return byTotal;
    const byLast = ((b as any).lastRacePoints || 0) - ((a as any).lastRacePoints || 0);
    if (byLast !== 0) return byLast;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });
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
          <Avatar name={activeLeague.name} size={40} variant="team" imageUrl={(activeLeague as any).avatarUrl} />
        </TouchableOpacity>
        <Text style={styles.leagueName} numberOfLines={1}>{activeLeague.name}</Text>
        <View style={styles.memberBtn}>
          <Ionicons name="chevron-down" size={14} color={colors.text.secondary} />
          <Text style={styles.memberCount}>
            {activeLeague.memberCount ?? members.length} member{(activeLeague.memberCount ?? members.length) !== 1 ? 's' : ''}
          </Text>
        </View>
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
              style={[styles.codeAction, copied && styles.codeActionCopied]}
              onPress={async () => {
                await Clipboard.setStringAsync(activeLeague.inviteCode!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
                setSnackbar('Invite code copied to clipboard');
                setTimeout(() => setSnackbar(null), 2500);
              }}
              activeOpacity={0.6}
            >
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={16}
                color={copied ? colors.positive : colors.primary}
              />
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
