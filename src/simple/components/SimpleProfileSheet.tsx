import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
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
import { generateAvatar } from '../../services/avatarGeneration.service';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { demoRaces } from '../../data/demoData';
import { TEAM_COLORS } from '../../config/constants';
import { S_RADIUS, S_FONTS } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SimpleProfileSheet({ visible, onClose }: Props) {
  const { colors, fonts, spacing } = useSimpleTheme();
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
      controlsColor: '#14B8A6',
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
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    headerTitle: {
      fontSize: fonts.lg,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.primary,
    },
    closeButton: {
      position: 'absolute' as const,
      right: spacing.lg,
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
      paddingVertical: spacing.xl,
    },
    displayName: {
      fontSize: fonts.xl,
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.primary,
      marginTop: spacing.md,
    },
    email: {
      fontSize: fonts.sm,
      color: colors.text.muted,
      marginTop: spacing.xs,
    },
    demoBadge: {
      marginTop: spacing.sm,
      backgroundColor: colors.primaryFaint,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: S_RADIUS.pill,
    },
    demoBadgeText: {
      fontSize: fonts.xs,
      fontWeight: S_FONTS.weights.medium,
      color: colors.primary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.borderLight,
      marginHorizontal: spacing.lg,
    },
    // Section headers
    sectionHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    sectionTitleRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    sectionTitle: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.primary,
    },
    // Rules
    rulesContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
    ruleItem: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: spacing.sm,
    },
    ruleText: {
      flex: 1,
      fontSize: fonts.sm,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    // League
    leagueContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
    leagueInfoRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    leagueLabel: {
      fontSize: fonts.sm,
      color: colors.text.muted,
    },
    leagueValue: {
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.medium,
      color: colors.text.primary,
    },
    inviteCodeRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
    },
    inviteCode: {
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.bold,
      color: colors.primary,
      letterSpacing: 1.5,
    },
    leaveButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
      marginTop: spacing.sm,
      alignSelf: 'flex-start' as const,
    },
    leaveButtonText: {
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.medium,
      color: colors.negative,
    },
    noLeagueContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    noLeagueText: {
      fontSize: fonts.sm,
      color: colors.text.muted,
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
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: S_RADIUS.md,
    },
    leagueActionText: {
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.medium,
      color: colors.primary,
    },
    // Settings
    settingsContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    scaleRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    scaleButtons: {
      flexDirection: 'row' as const,
      gap: spacing.xs,
    },
    scaleBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
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
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.muted,
    },
    scaleBtnTextActive: {
      color: colors.text.inverse,
    },
    settingsRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    settingsRowText: {
      flex: 1,
      fontSize: fonts.md,
      color: colors.text.primary,
    },
    dangerRow: {
      borderBottomWidth: 0,
    },
    dangerText: {
      color: colors.negative,
    },
    // Version
    versionText: {
      textAlign: 'center' as const,
      fontSize: fonts.xs,
      color: colors.text.muted,
      marginTop: spacing.xl,
      paddingBottom: spacing.lg,
    },
    avatarOverlay: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 36,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    avatarEditBadge: {
      position: 'absolute' as const,
      bottom: 0,
      right: 0,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 2,
      borderColor: colors.background,
    },
    apBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end' as const,
    },
    apSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: S_RADIUS.lg,
      borderTopRightRadius: S_RADIUS.lg,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl + 16,
    },
    apTitle: {
      fontSize: fonts.lg,
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.primary,
      marginBottom: spacing.lg,
    },
    apOption: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    apOptionInfo: {
      flex: 1,
    },
    apOptionText: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.primary,
    },
    apOptionHint: {
      fontSize: fonts.sm,
      color: colors.text.muted,
      marginTop: 1,
    },
    apHistoryLabel: {
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.semibold,
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
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.medium,
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
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.medium,
      color: colors.primary,
    },
    ihSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: S_RADIUS.lg,
      borderTopRightRadius: S_RADIUS.lg,
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
      fontSize: fonts.lg,
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.primary,
    },
    ihEmpty: {
      fontSize: fonts.sm,
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
      fontSize: fonts.md,
      color: colors.text.primary,
      fontWeight: S_FONTS.weights.medium,
    },
    ihStatus: {
      fontSize: fonts.xs,
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
      borderRadius: S_RADIUS.pill,
    },
    ihJoinedText: {
      fontSize: fonts.xs,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.positive,
    },
    historyEmpty: {
      fontSize: fonts.sm,
      color: colors.text.muted,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      fontStyle: 'italic' as const,
    },
    historyContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
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
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.primary,
      flex: 1,
    },
    historyRaceTotal: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.bold,
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
      fontSize: fonts.sm,
      color: colors.text.secondary,
      flex: 1,
    },
    historyDriverPts: {
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.semibold,
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
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.medium,
      color: colors.text.muted,
    },
    historyTotalValue: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.primary,
    },
  }), [colors, fonts, spacing]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.text.primary} />
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
                size={72}
                variant="user"
                imageUrl={avatarUrl}
              />
              {isUploading ? (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator size="small" color={colors.text.inverse} />
                </View>
              ) : (
                <View style={styles.avatarEditBadge}>
                  <Ionicons name="camera" size={12} color={colors.text.inverse} />
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

          <View style={styles.divider} />

          {/* Game Rules Section */}
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setRulesExpanded(!rulesExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionTitleRow}>
              <Ionicons name="book-outline" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Game Rules</Text>
            </View>
            <Ionicons
              name={rulesExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.text.muted}
            />
          </TouchableOpacity>

          {rulesExpanded && (
            <View style={styles.rulesContent}>
              <RuleItem icon="wallet-outline" text="Budget: $1,000 to build your team" colors={colors} fonts={fonts} spacing={spacing} />
              <RuleItem icon="people-outline" text="Team: 5 drivers + 1 constructor" colors={colors} fonts={fonts} spacing={spacing} />
              <RuleItem icon="star-outline" text="Ace: Pick one under $200 for 2x points" colors={colors} fonts={fonts} spacing={spacing} />
              <RuleItem icon="document-text-outline" text="Contracts: Choose 1-6 races per driver, auto-sells on expiry" colors={colors} fonts={fonts} spacing={spacing} />
              <RuleItem icon="trophy-outline" text="Points: Race position, positions gained, fastest lap, position bonus" colors={colors} fonts={fonts} spacing={spacing} />
            </View>
          )}

          <View style={styles.divider} />

          {/* Race History Section */}
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setHistoryExpanded(!historyExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionTitleRow}>
              <Ionicons name="time-outline" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Race History</Text>
            </View>
            <Ionicons
              name={historyExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.text.muted}
            />
          </TouchableOpacity>

          {historyExpanded && (
            <RaceHistory team={team} raceResults={raceResults} colors={colors} fonts={fonts} spacing={spacing} styles={styles} />
          )}

          <View style={styles.divider} />

          {/* League Section */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="shield-outline" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>League</Text>
            </View>
          </View>

          {activeLeague ? (
            <View style={styles.leagueContent}>
              <View style={styles.leagueInfoRow}>
                <Text style={styles.leagueLabel}>Name</Text>
                <Text style={styles.leagueValue}>{activeLeague.name}</Text>
              </View>
              <View style={styles.leagueInfoRow}>
                <Text style={styles.leagueLabel}>Invite Code</Text>
                <TouchableOpacity
                  onPress={handleCopyInviteCode}
                  style={styles.inviteCodeRow}
                  activeOpacity={0.7}
                >
                  <Text style={styles.inviteCode}>{activeLeague.inviteCode}</Text>
                  <Ionicons name="copy-outline" size={14} color={colors.primary} />
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
                  <Ionicons name="exit-outline" size={16} color={colors.negative} />
                  <Text style={styles.leaveButtonText}>Leave League</Text>
                </TouchableOpacity>
              )}
              {activeLeague.ownerId === user?.id && (
                <TouchableOpacity
                  style={styles.inviteHistoryBtn}
                  onPress={() => { loadInviteHistory(); setShowInviteHistory(true); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="mail-outline" size={16} color={colors.primary} />
                  <Text style={styles.inviteHistoryBtnText}>Invite History</Text>
                </TouchableOpacity>
              )}
            </View>
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
                  <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                  <Text style={styles.leagueActionText}>Create</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.leagueActionButton}
                  onPress={() => handleLeagueAction('join')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="enter-outline" size={16} color={colors.primary} />
                  <Text style={styles.leagueActionText}>Join</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.divider} />

          {/* Settings Section */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="settings-outline" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Settings</Text>
            </View>
          </View>

          <View style={styles.settingsContent}>
            {/* Display Scale */}
            <View style={styles.scaleRow}>
              <Ionicons name="resize-outline" size={18} color={colors.text.secondary} />
              <Text style={styles.settingsRowText}>Display Size</Text>
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
            <View style={styles.scaleRow}>
              <Ionicons name="contrast-outline" size={18} color={colors.text.secondary} />
              <Text style={styles.settingsRowText}>Theme</Text>
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
                      color={themeMode === t.mode ? '#fff' : colors.text.muted}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.settingsRow}
              onPress={handlePrivacyPolicy}
              activeOpacity={0.7}
            >
              <Ionicons name="lock-closed-outline" size={18} color={colors.text.secondary} />
              <Text style={styles.settingsRowText}>Privacy Policy</Text>
              <Ionicons name="open-outline" size={14} color={colors.text.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsRow, styles.dangerRow]}
              onPress={handleDeleteAccount}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={18} color={colors.negative} />
              <Text style={[styles.settingsRowText, styles.dangerText]}>Delete Account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsRow, styles.dangerRow]}
              onPress={handleSignOut}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={18} color={colors.negative} />
              <Text style={[styles.settingsRowText, styles.dangerText]}>Sign Out</Text>
            </TouchableOpacity>
          </View>

          {/* App Version */}
          <Text style={styles.versionText}>Undercut v{appVersion}</Text>
        </ScrollView>
      </SafeAreaView>

      {/* Avatar Picker Modal */}
      <Modal visible={showAvatarPicker} transparent animationType="fade" onRequestClose={() => setShowAvatarPicker(false)}>
        <TouchableOpacity style={styles.apBackdrop} onPress={() => setShowAvatarPicker(false)} activeOpacity={1}>
          <View style={styles.apSheet}>
            <Text style={styles.apTitle}>Change Profile Picture</Text>

            <TouchableOpacity style={styles.apOption} onPress={handleGenerateAI} activeOpacity={0.7}>
              <Ionicons name="sparkles" size={20} color={colors.primary} />
              <View style={styles.apOptionInfo}>
                <Text style={styles.apOptionText}>Generate with AI</Text>
                <Text style={styles.apOptionHint}>Create a unique avatar</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.apOption} onPress={handlePickFromLibrary} activeOpacity={0.7}>
              <Ionicons name="image-outline" size={20} color={colors.primary} />
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
                <Ionicons name="close" size={22} color={colors.text.primary} />
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
function RaceHistory({ team, raceResults, colors, fonts, spacing, styles }: {
  team: any;
  raceResults: Record<string, any>;
  colors: any;
  fonts: any;
  spacing: any;
  styles: any;
}) {
  if (!team) {
    return <Text style={styles.historyEmpty}>Create a team to start tracking history.</Text>;
  }

  const completedRaces = Object.entries(raceResults)
    .filter(([_, r]) => r.isComplete)
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (completedRaces.length === 0) {
    return <Text style={styles.historyEmpty}>No races completed yet.</Text>;
  }

  const raceNameMap = new Map(demoRaces.map(r => [r.id, r.name]));

  return (
    <View style={styles.historyContent}>
      {completedRaces.map(([raceId, result]) => {
        const raceName = raceNameMap.get(raceId) ?? raceId.replace(/_/g, ' ');

        let raceTotal = 0;
        const driverBreakdown: { name: string; shortName: string; constructorId: string; pts: number }[] = [];

        team.drivers?.forEach((driver: any) => {
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
            {driverBreakdown.map((d) => {
              const color = TEAM_COLORS[d.constructorId]?.primary ?? colors.text.muted;
              return (
                <View key={d.shortName} style={styles.historyDriverRow}>
                  <View style={[styles.historyDot, { backgroundColor: color }]} />
                  <Text style={styles.historyDriverName}>{d.shortName}</Text>
                  <Text style={[
                    styles.historyDriverPts,
                    d.pts > 0 && { color: colors.positive },
                    d.pts < 0 && { color: colors.negative },
                  ]}>
                    {d.pts > 0 ? '+' : ''}{d.pts}
                  </Text>
                </View>
              );
            })}
            {ctor && (
              <View style={styles.historyDriverRow}>
                <View style={[styles.historyDot, { backgroundColor: TEAM_COLORS[ctor.constructorId]?.primary ?? colors.text.muted }]} />
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

      {/* Running total */}
      <View style={styles.historyTotalRow}>
        <Text style={styles.historyTotalLabel}>Total Points</Text>
        <Text style={styles.historyTotalValue}>{team.totalPoints ?? 0}</Text>
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
function RuleItem({ icon, text, colors, fonts, spacing }: { icon: string; text: string; colors: any; fonts: any; spacing: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
      <Ionicons name={icon as any} size={15} color={colors.primary} />
      <Text style={{ flex: 1, fontSize: fonts.sm, color: colors.text.secondary, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}
