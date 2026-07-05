import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { Avatar } from '../../components/Avatar';
import { useAuthStore } from '../../store/auth.store';
import { usePrefsStore } from '../../store/prefs.store';
import { useLeagueStore } from '../../store/league.store';
import { useAdminStore } from '../../store/admin.store';
import { useSimpleTeam } from '../hooks/useSimpleTeam';
import { authService } from '../../services/auth.service';
import * as notificationService from '../../services/notification.service';
import { generateAvatar } from '../../services/avatarGeneration.service';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { demoRaces } from '../../data/demoData';
import { S_RADIUS, S_FONT_FAMILY, teamAccent } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SimpleProfileSheet({ visible, onClose }: Props) {
  const { colors, fonts, spacing, scaled, displayUpright } = useSimpleTheme();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const signOut = useAuthStore((s) => s.signOut);
  const { team } = useSimpleTeam();
  const leagues = useLeagueStore((s) => s.leagues);

  const setUser = useAuthStore((s) => s.setUser);
  const displayScale = usePrefsStore((s) => s.displayScale);
  const setDisplayScale = usePrefsStore((s) => s.setDisplayScale);
  const themeMode = usePrefsStore((s) => s.themeMode);
  const setThemeMode = usePrefsStore((s) => s.setThemeMode);
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarHistory, setAvatarHistory] = useState<string[]>([]);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showInviteHistory, setShowInviteHistory] = useState(false);
  const [inviteHistoryData, setInviteHistoryData] = useState<{ email: string; status: string; createdAt: string }[]>([]);
  const [inviteHistoryLoading, setInviteHistoryLoading] = useState(false);
  // Incomplete-team reminder opt-out (server notifyIncompleteTeams honours this). Default on.
  const [teamReminderOn, setTeamReminderOn] = useState(true);

  useEffect(() => {
    if (!user?.id || isDemoMode) return;
    notificationService.getIncompleteTeamReminderPref(user.id).then(setTeamReminderOn).catch(() => {});
  }, [user?.id, isDemoMode]);

  const handleToggleTeamReminder = async (next: boolean) => {
    setTeamReminderOn(next); // optimistic
    if (!user?.id || isDemoMode) return;
    try {
      await notificationService.setIncompleteTeamReminderPref(user.id, next);
    } catch {
      setTeamReminderOn(!next); // revert on failure
      Alert.alert('Error', 'Could not update reminder setting. Try again.');
    }
  };

  useEffect(() => {
    const url = (user as any)?.photoURL ?? null;
    setAvatarUrl(url);
  }, [user]);
  const raceResults = useAdminStore((s) => s.raceResults);

  const leagueId = team?.leagueId ?? null;
  const activeLeague = leagueId ? leagues.find((l) => l.id === leagueId) : null;

  const displayName = user?.displayName || 'Player';
  const photoURL = (user as Record<string, any>)?.photoURL ?? null;
  const appVersion = Constants.expoConfig?.version ?? '?';

  const handleAvatarTap = () => {
    setShowAvatarPicker(true);
  };

  const handlePickFromLibrary = async () => {
    setShowAvatarPicker(false);
    setTimeout(async () => {
      try {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission Required', 'Allow photo library access to change your profile picture.');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });

        if (result.canceled || !result.assets[0]) return;

        const imageUri = result.assets[0].uri;
        await applyAvatar(imageUri);
      } catch (err) {
        Alert.alert('Error', 'Could not open photo library.');
      }
    }, 300);
  };

  const handleGenerateAI = async () => {
    setShowAvatarPicker(false);
    setIsUploading(true);
    try {
      const result = await generateAvatar(displayName, 'user', user?.id ?? 'demo', 'detailed');
      if (result.success && result.imageUrl) {
        setAvatarUrl(result.imageUrl);
        setAvatarHistory(prev => {
          const updated = [result.imageUrl!, ...prev.filter(u => u !== result.imageUrl)];
          return updated.slice(0, 10);
        });
        if (user) setUser({ ...user, photoURL: result.imageUrl });
      } else {
        Alert.alert('Generation Failed', result.error || 'Try again later.');
      }
    } catch (err) {
      Alert.alert('Error', 'Avatar generation failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const applyAvatar = async (imageUri: string) => {
    setIsUploading(true);
    try {
      if (isDemoMode) {
        setAvatarUrl(imageUri);
        if (user) setUser({ ...user, photoURL: imageUri });
        return;
      }

      const base64Data = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { uploadProfileImage } = await import('../../services/profileImage.service');
      const uploadedUrl = await uploadProfileImage(user!.id, base64Data, 'image/jpeg');
      setAvatarUrl(uploadedUrl);
      await authService.updateUserProfile(user!.id, { photoURL: uploadedUrl });
      setUser({ ...user!, photoURL: uploadedUrl });
    } catch (err) {
      Alert.alert('Error', 'Failed to upload image.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectFromHistory = async (url: string) => {
    setShowAvatarPicker(false);
    setAvatarUrl(url);
    if (isDemoMode) {
      if (user) setUser({ ...user, photoURL: url });
      return;
    }
    try {
      await authService.updateUserProfile(user!.id, { photoURL: url });
      setUser({ ...user!, photoURL: url });
    } catch {
      Alert.alert('Error', 'Failed to update avatar.');
    }
  };

  const loadInviteHistory = async () => {
    if (!activeLeague) return;
    setInviteHistoryLoading(true);
    try {
      const invitesRef = collection(db, `leagues/${activeLeague.id}/invites`);
      const q = query(invitesRef, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const invites = snap.docs.map(d => {
        const data = d.data();
        return {
          email: data.email || '',
          status: data.status || 'pending',
          createdAt: data.createdAt || '',
        };
      });
      setInviteHistoryData(invites);
    } catch {
      setInviteHistoryData([]);
    } finally {
      setInviteHistoryLoading(false);
    }
  };

  const leagueMembers = useLeagueStore((s) => s.members);

  const handleCopyInviteCode = async () => {
    if (!activeLeague?.inviteCode) return;
    await Clipboard.setStringAsync(activeLeague.inviteCode);
    Alert.alert('Copied', 'Invite code copied to clipboard');
  };

  const handleLeaveLeague = () => {
    if (!activeLeague || !user) return;
    Alert.alert(
      'Leave League',
      `Are you sure you want to leave "${activeLeague.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await useLeagueStore.getState().leaveLeague(activeLeague.id, user.id);
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Failed to leave league';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  };

  const handleSwitchMode = () => {
    usePrefsStore.getState().setUiMode('complex');
    onClose();
    router.replace('/(tabs)');
  };

  const handlePrivacyPolicy = () => {
    WebBrowser.openBrowserAsync('https://f1-app-18077.web.app/privacy.html', {
      controlsColor: colors.primary,
      toolbarColor: colors.background,
    });
  };

  const handleDeleteAccount = () => {
    if (isDemoMode) {
      Alert.alert('Demo Mode', 'Account deletion is not available in demo mode.');
      return;
    }
    if (!user) return;
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.deleteAccount(user.id);
              useAuthStore.getState().setUser(null);
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Failed to delete account';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          onClose();
          try {
            await signOut();
            router.replace('/(auth)/login');
          } catch {
            // signOut already handles errors
          }
        },
      },
    ]);
  };

  const handleLeagueAction = (action: 'create' | 'join') => {
    onClose();
    Alert.alert(
      action === 'create' ? 'Create a League' : 'Join a League',
      `Switch to the Standings tab to ${action} a league.`,
    );
  };

  const styles = useMemo(() => ({
    // Sheet chrome — opens 56px below top over a scrim, card bg, sheet radius
    overlay: {
      flex: 1,
      backgroundColor: colors.scrim,
    },
    scrimTap: {
      height: scaled(56),
    },
    sheet: {
      flex: 1,
      backgroundColor: colors.card,
      borderTopLeftRadius: S_RADIUS.sheet,
      borderTopRightRadius: S_RADIUS.sheet,
      overflow: 'hidden' as const,
    },
    header: {
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingTop: scaled(18),
      paddingBottom: scaled(16),
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      ...displayUpright,
      fontSize: scaled(19),
      letterSpacing: -0.3,
      color: colors.text.primary,
    },
    closeButton: {
      position: 'absolute' as const,
      right: scaled(16),
      top: scaled(16),
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: spacing.xxl,
    },
    // Avatar section
    avatarSection: {
      alignItems: 'center' as const,
      paddingTop: scaled(28),
      paddingBottom: scaled(24),
      paddingHorizontal: scaled(20),
    },
    displayName: {
      ...displayUpright,
      fontSize: scaled(22),
      letterSpacing: -0.4,
      color: colors.text.primary,
      marginTop: scaled(14),
      marginBottom: scaled(4),
    },
    email: {
      fontSize: scaled(14),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.secondary,
    },
    demoBadge: {
      marginTop: scaled(12),
      backgroundColor: colors.primaryFaint,
      paddingHorizontal: scaled(14),
      paddingVertical: scaled(6),
      borderRadius: S_RADIUS.full,
    },
    demoBadgeText: {
      fontSize: scaled(12.5),
      fontFamily: S_FONT_FAMILY.body.semibold,
      color: colors.primary,
    },
    // Row pattern — 16/20 padding, 22px leading icon, 1px borderLight separator
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: scaled(14),
      paddingVertical: scaled(16),
      paddingHorizontal: scaled(20),
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowIcon: {
      width: scaled(22),
      alignItems: 'center' as const,
    },
    rowLabel: {
      flex: 1,
      fontSize: scaled(15),
      fontFamily: S_FONT_FAMILY.body.semibold,
      color: colors.text.primary,
    },
    dangerLabel: {
      color: colors.negative,
    },
    // Collapsible content — padded left 56 to align under labels
    collapseContent: {
      paddingLeft: scaled(56),
      paddingRight: scaled(20),
      paddingBottom: scaled(16),
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    rulesContent: {
      gap: spacing.sm,
    },
    // League block
    leagueBlock: {
      paddingTop: scaled(8),
      paddingHorizontal: scaled(20),
      paddingBottom: scaled(16),
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    leagueHeaderRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: scaled(14),
      paddingVertical: scaled(10),
    },
    leagueInfoRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingVertical: scaled(6),
    },
    leagueLabel: {
      fontSize: scaled(13.5),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
    },
    leagueValue: {
      fontSize: scaled(14),
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.text.primary,
    },
    inviteCodeRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
    },
    inviteCode: {
      ...displayUpright,
      fontSize: scaled(15),
      color: colors.primary,
      letterSpacing: 1,
    },
    leaveButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
      marginTop: spacing.sm,
      alignSelf: 'flex-start' as const,
    },
    leaveButtonText: {
      fontSize: scaled(13.5),
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.negative,
    },
    noLeagueContent: {
      paddingBottom: scaled(4),
    },
    noLeagueText: {
      fontSize: scaled(13.5),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
      lineHeight: scaled(19),
      marginBottom: spacing.md,
    },
    leagueButtonRow: {
      flexDirection: 'row' as const,
      gap: spacing.md,
    },
    leagueActionButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
      backgroundColor: colors.primaryFaint,
      paddingHorizontal: scaled(14),
      paddingVertical: scaled(8),
      borderRadius: S_RADIUS.md,
    },
    leagueActionText: {
      fontSize: scaled(13.5),
      fontFamily: S_FONT_FAMILY.body.semibold,
      color: colors.primary,
    },
    // Settings accessories
    scaleButtons: {
      flexDirection: 'row' as const,
      gap: spacing.xs,
    },
    scaleBtn: {
      width: scaled(30),
      height: scaled(30),
      borderRadius: S_RADIUS.full,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    scaleBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    scaleBtnText: {
      fontFamily: S_FONT_FAMILY.body.bold,
      color: colors.text.muted,
    },
    scaleBtnTextActive: {
      color: colors.text.inverse,
    },
    // 38×22 switch — primary track when on, border when off, white 18px thumb
    switchTrack: {
      width: scaled(38),
      height: scaled(22),
      borderRadius: S_RADIUS.full,
      backgroundColor: colors.border,
      padding: 2,
      justifyContent: 'center' as const,
      alignItems: 'flex-start' as const,
    },
    switchTrackOn: {
      backgroundColor: colors.primary,
      alignItems: 'flex-end' as const,
    },
    switchThumb: {
      width: scaled(18),
      height: scaled(18),
      borderRadius: S_RADIUS.full,
      backgroundColor: '#FFFFFF',
    },
    // Version
    versionText: {
      textAlign: 'center' as const,
      fontSize: scaled(12),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
      paddingTop: scaled(24),
      paddingBottom: scaled(30),
    },
    avatarOverlay: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: scaled(42),
      backgroundColor: colors.scrim,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    avatarEditBadge: {
      position: 'absolute' as const,
      bottom: 0,
      right: 0,
      width: scaled(28),
      height: scaled(28),
      borderRadius: S_RADIUS.full,
      backgroundColor: colors.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 2,
      borderColor: colors.card,
    },
    apBackdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
      justifyContent: 'flex-end' as const,
    },
    apSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: S_RADIUS.sheet,
      borderTopRightRadius: S_RADIUS.sheet,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl + 16,
    },
    apTitle: {
      ...displayUpright,
      fontSize: scaled(19),
      letterSpacing: -0.3,
      color: colors.text.primary,
      marginBottom: spacing.lg,
    },
    apOption: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: scaled(14),
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    apOptionInfo: {
      flex: 1,
    },
    apOptionText: {
      fontSize: scaled(15),
      fontFamily: S_FONT_FAMILY.body.semibold,
      color: colors.text.primary,
    },
    apOptionHint: {
      fontSize: scaled(13),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
      marginTop: 1,
    },
    apHistoryLabel: {
      fontSize: scaled(11.5),
      fontFamily: S_FONT_FAMILY.body.bold,
      color: colors.text.muted,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.8,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    apHistoryScroll: {
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    apCancel: {
      alignItems: 'center' as const,
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
    },
    apCancelText: {
      fontSize: scaled(15),
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.text.muted,
    },
    inviteHistoryBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      marginTop: spacing.xs,
    },
    inviteHistoryBtnText: {
      fontSize: scaled(13.5),
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.primary,
    },
    ihSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: S_RADIUS.sheet,
      borderTopRightRadius: S_RADIUS.sheet,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl + 16,
      maxHeight: '70%' as any,
    },
    ihHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: spacing.lg,
    },
    ihTitle: {
      ...displayUpright,
      fontSize: scaled(19),
      letterSpacing: -0.3,
      color: colors.text.primary,
    },
    ihEmpty: {
      fontSize: scaled(13.5),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
      fontStyle: 'italic' as const,
      textAlign: 'center' as const,
      paddingVertical: spacing.xl,
    },
    ihList: {
      flex: 1,
    },
    ihRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    ihRowLeft: {
      flex: 1,
    },
    ihEmail: {
      fontSize: scaled(14),
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.text.primary,
    },
    ihStatus: {
      fontSize: scaled(12),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
      marginTop: 2,
    },
    ihJoinedBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      backgroundColor: colors.positiveFaint,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: S_RADIUS.full,
    },
    ihJoinedText: {
      fontSize: scaled(12),
      fontFamily: S_FONT_FAMILY.body.semibold,
      color: colors.positive,
    },
    historyEmpty: {
      fontSize: scaled(13.5),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
      fontStyle: 'italic' as const,
    },
    historyRace: {
      backgroundColor: colors.surface,
      borderRadius: S_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    historyRaceHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: spacing.sm,
      paddingBottom: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    historyRaceName: {
      fontSize: scaled(14),
      fontFamily: S_FONT_FAMILY.body.semibold,
      color: colors.text.primary,
      flex: 1,
    },
    historyRaceTotal: {
      fontSize: scaled(14),
      fontFamily: S_FONT_FAMILY.body.bold,
      color: colors.text.primary,
    },
    historyDriverRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: 2,
    },
    historyDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: spacing.sm,
    },
    historyDriverName: {
      fontSize: scaled(13),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.secondary,
      flex: 1,
    },
    historyDriverPts: {
      fontSize: scaled(13),
      fontFamily: S_FONT_FAMILY.body.semibold,
      color: colors.text.muted,
    },
    historyTotalRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      marginTop: spacing.xs,
    },
    historyTotalLabel: {
      fontSize: scaled(13),
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.text.muted,
    },
    historyTotalValue: {
      fontSize: scaled(14),
      fontFamily: S_FONT_FAMILY.body.bold,
      color: colors.text.primary,
    },
  }), [colors, fonts, spacing, scaled, displayUpright]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Scrim strip above the sheet — tap to dismiss */}
        <Pressable style={styles.scrimTap} onPress={onClose} />

        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Profile</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <Ionicons name="close" size={scaled(22)} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Avatar Section */}
            <View style={styles.avatarSection}>
              <TouchableOpacity onPress={handleAvatarTap} activeOpacity={0.7} disabled={isUploading}>
                <Avatar
                  name={displayName}
                  size={scaled(84)}
                  variant="user"
                  imageUrl={avatarUrl}
                />
                {isUploading ? (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator size="small" color={colors.text.inverse} />
                  </View>
                ) : (
                  <View style={styles.avatarEditBadge}>
                    <Ionicons name="camera" size={scaled(13)} color={colors.text.inverse} />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.displayName}>{displayName}</Text>
              {user?.email ? (
                <Text style={styles.email}>{user.email}</Text>
              ) : null}
              {isDemoMode ? (
                <View style={styles.demoBadge}>
                  <Text style={styles.demoBadgeText}>Demo Mode</Text>
                </View>
              ) : null}
            </View>

            {/* Game Rules (collapsible) */}
            <TouchableOpacity
              style={styles.row}
              onPress={() => setRulesExpanded(!rulesExpanded)}
              activeOpacity={0.7}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="book-outline" size={scaled(18)} color={colors.primary} />
              </View>
              <Text style={styles.rowLabel}>Game Rules</Text>
              <Ionicons
                name="chevron-down"
                size={scaled(16)}
                color={colors.text.muted}
                style={{ transform: [{ rotate: rulesExpanded ? '180deg' : '0deg' }] }}
              />
            </TouchableOpacity>

            {rulesExpanded && (
              <View style={[styles.collapseContent, styles.rulesContent]}>
                <RuleItem icon="wallet-outline" text="Budget: $1,000 to build your team" colors={colors} scaled={scaled} spacing={spacing} />
                <RuleItem icon="people-outline" text="Team: 5 drivers + 1 constructor" colors={colors} scaled={scaled} spacing={spacing} />
                <RuleItem icon="star-outline" text="Ace: Pick one under $200 for 2x points" colors={colors} scaled={scaled} spacing={spacing} />
                <RuleItem icon="document-text-outline" text="Contracts: Choose 1-6 races per driver, auto-sells on expiry" colors={colors} scaled={scaled} spacing={spacing} />
                <RuleItem icon="trophy-outline" text="Points: Race position, positions gained, fastest lap, position bonus" colors={colors} scaled={scaled} spacing={spacing} />
              </View>
            )}

            {/* Race History (collapsible) */}
            <TouchableOpacity
              style={styles.row}
              onPress={() => setHistoryExpanded(!historyExpanded)}
              activeOpacity={0.7}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="time-outline" size={scaled(18)} color={colors.primary} />
              </View>
              <Text style={styles.rowLabel}>Race History</Text>
              <Ionicons
                name="chevron-down"
                size={scaled(16)}
                color={colors.text.muted}
                style={{ transform: [{ rotate: historyExpanded ? '180deg' : '0deg' }] }}
              />
            </TouchableOpacity>

            {historyExpanded && (
              <View style={styles.collapseContent}>
                <RaceHistory team={team} raceResults={raceResults} colors={colors} styles={styles} />
              </View>
            )}

            {/* League block */}
            <View style={styles.leagueBlock}>
              <View style={styles.leagueHeaderRow}>
                <View style={styles.rowIcon}>
                  <Ionicons name="shield-outline" size={scaled(18)} color={colors.primary} />
                </View>
                <Text style={styles.rowLabel}>League</Text>
              </View>

              {activeLeague ? (
                <>
                  <View style={styles.leagueInfoRow}>
                    <Text style={styles.leagueLabel}>Name</Text>
                    <Text style={styles.leagueValue}>{activeLeague.name}</Text>
                  </View>
                  <View style={styles.leagueInfoRow}>
                    <Text style={styles.leagueLabel}>Invite code</Text>
                    <TouchableOpacity
                      onPress={handleCopyInviteCode}
                      style={styles.inviteCodeRow}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.inviteCode}>{activeLeague.inviteCode}</Text>
                      <Ionicons name="copy-outline" size={scaled(14)} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.leagueInfoRow}>
                    <Text style={styles.leagueLabel}>Members</Text>
                    <Text style={styles.leagueValue}>
                      {activeLeague.memberCount} / {activeLeague.maxMembers}
                    </Text>
                  </View>
                  {activeLeague.ownerId !== user?.id && (
                    <TouchableOpacity
                      style={styles.leaveButton}
                      onPress={handleLeaveLeague}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="exit-outline" size={scaled(16)} color={colors.negative} />
                      <Text style={styles.leaveButtonText}>Leave League</Text>
                    </TouchableOpacity>
                  )}
                  {activeLeague.ownerId === user?.id && (
                    <TouchableOpacity
                      style={styles.inviteHistoryBtn}
                      onPress={() => { loadInviteHistory(); setShowInviteHistory(true); }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="mail-outline" size={scaled(16)} color={colors.primary} />
                      <Text style={styles.inviteHistoryBtnText}>Invite History</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <View style={styles.noLeagueContent}>
                  <Text style={styles.noLeagueText}>
                    You are not in a league. Join or create one from the Standings tab.
                  </Text>
                  <View style={styles.leagueButtonRow}>
                    <TouchableOpacity
                      style={styles.leagueActionButton}
                      onPress={() => handleLeagueAction('create')}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add-circle-outline" size={scaled(16)} color={colors.primary} />
                      <Text style={styles.leagueActionText}>Create</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.leagueActionButton}
                      onPress={() => handleLeagueAction('join')}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="enter-outline" size={scaled(16)} color={colors.primary} />
                      <Text style={styles.leagueActionText}>Join</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Display Scale */}
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="resize-outline" size={scaled(18)} color={colors.primary} />
              </View>
              <Text style={styles.rowLabel}>Display Size</Text>
              <View style={styles.scaleButtons}>
                {[{ scale: 0.85, size: 11 }, { scale: 1.0, size: 13 }, { scale: 1.15, size: 15 }, { scale: 1.3, size: 17 }].map((s) => (
                  <TouchableOpacity
                    key={s.scale}
                    style={[styles.scaleBtn, displayScale === s.scale && styles.scaleBtnActive]}
                    onPress={() => { setDisplayScale(s.scale); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.scaleBtnText, { fontSize: s.size }, displayScale === s.scale && styles.scaleBtnTextActive]}>
                      A
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Theme Mode */}
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="contrast-outline" size={scaled(18)} color={colors.primary} />
              </View>
              <Text style={styles.rowLabel}>Theme</Text>
              <View style={styles.scaleButtons}>
                {([
                  { mode: 'light' as const, icon: 'sunny-outline' as const, label: 'Light' },
                  { mode: 'system' as const, icon: 'phone-portrait-outline' as const, label: 'Auto' },
                  { mode: 'dark' as const, icon: 'moon-outline' as const, label: 'Dark' },
                ] as const).map((t) => (
                  <TouchableOpacity
                    key={t.mode}
                    style={[styles.scaleBtn, themeMode === t.mode && styles.scaleBtnActive]}
                    onPress={() => setThemeMode(t.mode)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={t.icon}
                      size={14}
                      color={themeMode === t.mode ? colors.text.inverse : colors.text.muted}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Incomplete-team reminder toggle (server notifyIncompleteTeams honours it) */}
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="alert-circle-outline" size={scaled(18)} color={colors.primary} />
              </View>
              <Text style={styles.rowLabel}>Team reminders</Text>
              <Pressable
                onPress={() => handleToggleTeamReminder(!teamReminderOn)}
                hitSlop={8}
                style={[styles.switchTrack, teamReminderOn && styles.switchTrackOn]}
              >
                <View style={styles.switchThumb} />
              </Pressable>
            </View>

            <TouchableOpacity
              style={styles.row}
              onPress={handlePrivacyPolicy}
              activeOpacity={0.7}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="lock-closed-outline" size={scaled(18)} color={colors.primary} />
              </View>
              <Text style={styles.rowLabel}>Privacy Policy</Text>
              <Ionicons name="open-outline" size={scaled(14)} color={colors.text.muted} />
            </TouchableOpacity>

            <View style={{ height: scaled(8) }} />

            {/* Destructive rows */}
            <TouchableOpacity
              style={styles.row}
              onPress={handleDeleteAccount}
              activeOpacity={0.7}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="trash-outline" size={scaled(18)} color={colors.negative} />
              </View>
              <Text style={[styles.rowLabel, styles.dangerLabel]}>Delete Account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              onPress={handleSignOut}
              activeOpacity={0.7}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="log-out-outline" size={scaled(18)} color={colors.negative} />
              </View>
              <Text style={[styles.rowLabel, styles.dangerLabel]}>Sign Out</Text>
            </TouchableOpacity>

            {/* App Version */}
            <Text style={styles.versionText}>Undercut v{appVersion}</Text>
          </ScrollView>
        </SafeAreaView>
      </View>

      {/* Avatar Picker Modal */}
      <Modal visible={showAvatarPicker} transparent animationType="fade" onRequestClose={() => setShowAvatarPicker(false)}>
        <TouchableOpacity style={styles.apBackdrop} onPress={() => setShowAvatarPicker(false)} activeOpacity={1}>
          <View style={styles.apSheet}>
            <Text style={styles.apTitle}>Change Profile Picture</Text>

            <TouchableOpacity style={styles.apOption} onPress={handleGenerateAI} activeOpacity={0.7}>
              <Ionicons name="sparkles" size={scaled(20)} color={colors.primary} />
              <View style={styles.apOptionInfo}>
                <Text style={styles.apOptionText}>Generate with AI</Text>
                <Text style={styles.apOptionHint}>Create a unique avatar</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.apOption} onPress={handlePickFromLibrary} activeOpacity={0.7}>
              <Ionicons name="image-outline" size={scaled(20)} color={colors.primary} />
              <View style={styles.apOptionInfo}>
                <Text style={styles.apOptionText}>Choose from Library</Text>
                <Text style={styles.apOptionHint}>Pick a photo from your device</Text>
              </View>
            </TouchableOpacity>

            {avatarHistory.length > 0 && (
              <>
                <Text style={styles.apHistoryLabel}>Recent Avatars</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.apHistoryScroll}>
                  {avatarHistory.map((url, idx) => (
                    <TouchableOpacity key={idx} onPress={() => handleSelectFromHistory(url)} activeOpacity={0.7}>
                      <Avatar name="" size={48} variant="user" imageUrl={url} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <TouchableOpacity style={styles.apCancel} onPress={() => setShowAvatarPicker(false)} activeOpacity={0.7}>
              <Text style={styles.apCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Invite History Modal */}
      <Modal visible={showInviteHistory} transparent animationType="fade" onRequestClose={() => setShowInviteHistory(false)}>
        <TouchableOpacity style={styles.apBackdrop} onPress={() => setShowInviteHistory(false)} activeOpacity={1}>
          <View style={styles.ihSheet}>
            <View style={styles.ihHeader}>
              <Text style={styles.ihTitle}>Invite History</Text>
              <TouchableOpacity onPress={() => setShowInviteHistory(false)} hitSlop={8}>
                <Ionicons name="close" size={scaled(22)} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {inviteHistoryLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ paddingVertical: spacing.xl }} />
            ) : inviteHistoryData.length === 0 ? (
              <Text style={styles.ihEmpty}>No invites sent yet.</Text>
            ) : (
              <ScrollView style={styles.ihList} showsVerticalScrollIndicator={false}>
                {inviteHistoryData.map((inv, idx) => {
                  const isMember = leagueMembers.some(
                    m => m.displayName?.toLowerCase() === inv.email.toLowerCase() ||
                         (m as any).email?.toLowerCase() === inv.email.toLowerCase()
                  );
                  return (
                    <View key={idx} style={styles.ihRow}>
                      <View style={styles.ihRowLeft}>
                        <Text style={styles.ihEmail} numberOfLines={1}>{inv.email}</Text>
                        <Text style={[
                          styles.ihStatus,
                          inv.status === 'sent' && { color: colors.positive },
                          inv.status === 'failed' && { color: colors.negative },
                        ]}>
                          {inv.status === 'sent' ? 'Sent' : inv.status === 'failed' ? 'Failed' : 'Pending'}
                        </Text>
                      </View>
                      {isMember && (
                        <View style={styles.ihJoinedBadge}>
                          <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
                          <Text style={styles.ihJoinedText}>Joined</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

/** Race history showing per-race performance */
function RaceHistory({ team, raceResults, colors, styles }: {
  team: any;
  raceResults: Record<string, any>;
  colors: any;
  styles: any;
}) {
  if (!team) {
    return <Text style={styles.historyEmpty}>Create a team to start tracking history.</Text>;
  }

  // Sort by ROUND, not raceId string — alphabetical raceIds rendered the
  // season as Australia → Bahrain → China regardless of calendar order.
  const raceRoundMap = new Map(demoRaces.map(r => [r.id, r.round]));
  const completedRaces = Object.entries(raceResults)
    .filter(([_, r]) => r.isComplete)
    .sort((a, b) => (raceRoundMap.get(a[0]) ?? 999) - (raceRoundMap.get(b[0]) ?? 999));

  if (completedRaces.length === 0) {
    return <Text style={styles.historyEmpty}>No races completed yet.</Text>;
  }

  const raceNameMap = new Map(demoRaces.map(r => [r.id, r.name]));

  return (
    <View>
      {completedRaces.map(([raceId, result]) => {
        const raceName = raceNameMap.get(raceId) ?? raceId.replace(/_/g, ' ');

        let raceTotal = 0;
        const driverBreakdown: { name: string; shortName: string; constructorId: string; pts: number }[] = [];
        const raceRound = raceRoundMap.get(raceId) ?? 0;

        team.drivers?.forEach((driver: any) => {
          // Tenure gate: don't credit the current roster for races run before
          // the driver was bought (same rule as team.store's calculator).
          const addedAt = driver.addedAtRace ?? (team.joinedAtRace || 0);
          if (raceRound > 0 && raceRound <= addedAt) return;
          const dr = result.driverResults?.find((r: any) => r.driverId === driver.driverId);
          const sr = result.sprintResults?.find((r: any) => r.driverId === driver.driverId);
          const pts = (dr?.points ?? 0) + (sr?.points ?? 0);
          raceTotal += pts;
          driverBreakdown.push({
            name: driver.name,
            shortName: driver.shortName,
            constructorId: driver.constructorId,
            pts,
          });
        });

        const ctor = (team as Record<string, any>)['constructor'];
        let ctorPts = 0;
        if (ctor) {
          const cr = result.constructorResults?.find((r: any) => r.constructorId === ctor.constructorId);
          const scr = result.sprintConstructorResults?.find((r: any) => r.constructorId === ctor.constructorId);
          ctorPts = (cr?.points ?? 0) + (scr?.points ?? 0);
          raceTotal += ctorPts;
        }

        return (
          <View key={raceId} style={styles.historyRace}>
            <View style={styles.historyRaceHeader}>
              <Text style={styles.historyRaceName}>{raceName}</Text>
              <Text style={[styles.historyRaceTotal, raceTotal > 0 && { color: colors.positive }]}>
                {raceTotal > 0 ? '+' : ''}{raceTotal} pts
              </Text>
            </View>
            {driverBreakdown.map((d) => (
              <View key={d.shortName} style={styles.historyDriverRow}>
                <View style={[styles.historyDot, { backgroundColor: teamAccent(d.constructorId) }]} />
                <Text style={styles.historyDriverName}>{d.shortName}</Text>
                <Text style={[
                  styles.historyDriverPts,
                  d.pts > 0 && { color: colors.positive },
                  d.pts < 0 && { color: colors.negative },
                ]}>
                  {d.pts > 0 ? '+' : ''}{d.pts}
                </Text>
              </View>
            ))}
            {ctor && (
              <View style={styles.historyDriverRow}>
                <View style={[styles.historyDot, { backgroundColor: teamAccent(ctor.constructorId) }]} />
                <Text style={styles.historyDriverName}>{ctor.name?.split(' ')[0] ?? 'CTOR'}</Text>
                <Text style={[
                  styles.historyDriverPts,
                  ctorPts > 0 && { color: colors.positive },
                  ctorPts < 0 && { color: colors.negative },
                ]}>
                  {ctorPts > 0 ? '+' : ''}{ctorPts}
                </Text>
              </View>
            )}
          </View>
        );
      })}

      {/* Running total — totalPoints + lockedPoints, matching My Team and the
          league standings (banked points from sold drivers count) */}
      <View style={styles.historyTotalRow}>
        <Text style={styles.historyTotalLabel}>Total Points</Text>
        <Text style={styles.historyTotalValue}>{(team.totalPoints ?? 0) + (team.lockedPoints ?? 0)}</Text>
      </View>
      <View style={styles.historyTotalRow}>
        <Text style={styles.historyTotalLabel}>Team Value</Text>
        <Text style={styles.historyTotalValue}>
          ${(team.drivers?.reduce((s: number, d: any) => s + (d.currentPrice ?? 0), 0) ?? 0)
            + ((team as Record<string, any>)['constructor']?.currentPrice ?? 0)}
        </Text>
      </View>
    </View>
  );
}

/** Small helper component for rule items */
function RuleItem({ icon, text, colors, scaled, spacing }: { icon: string; text: string; colors: any; scaled: (n: number) => number; spacing: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
      <Ionicons name={icon as any} size={scaled(15)} color={colors.primary} />
      <Text style={{
        flex: 1,
        fontSize: scaled(13.5),
        fontFamily: S_FONT_FAMILY.body.regular,
        color: colors.text.secondary,
        lineHeight: scaled(19),
      }}>{text}</Text>
    </View>
  );
}
