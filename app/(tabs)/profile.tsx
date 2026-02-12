import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../src/hooks/useAuth';
import { useAvatarGeneration, useAutoSyncOpenF1 } from '../../src/hooks';
import { authService } from '../../src/services/auth.service';
import { Card } from '../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../src/config/constants';
import { useAuthStore } from '../../src/store/auth.store';
import { useAdminStore } from '../../src/store/admin.store';
import { useTeamStore } from '../../src/store/team.store';
import { useAvatarStore } from '../../src/store/avatar.store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ProfileScreen() {
  const { user, isDemoMode, signOut } = useAuth();
  const setUser = useAuthStore((state) => state.setUser);
  const resetAdminData = useAdminStore((state) => state.resetAllData);
  const userTeams = useTeamStore((state) => state.userTeams);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.photoURL || null);
  const [isUploading, setIsUploading] = useState(false);
  const [showAvatarOptions, setShowAvatarOptions] = useState(false);

  // Avatar history
  const addAvatar = useAvatarStore(s => s.addAvatar);
  const avatarHistory = useAvatarStore(s => s.getHistory(user?.id || ''));
  const avatarRemaining = useAvatarStore(s => s.getRemaining(user?.id || ''));
  const canGenerateAvatar = useAvatarStore(s => s.canGenerate(user?.id || ''));

  // OpenF1 import functionality
  const autoSyncOpenF1 = useAutoSyncOpenF1();
  const [isImporting, setIsImporting] = useState(false);

  const { generate: generateAvatar, isGenerating, isAvailable: isAvatarGenerationAvailable } = useAvatarGeneration({
    onSuccess: async (url) => {
      setAvatarUrl(url);
      // Save to avatar history
      if (user) addAvatar(user.id, url);
      if (user && !isDemoMode) {
        try {
          await authService.updateUserProfile(user.id, { photoURL: url });
          setUser({ ...user, photoURL: url });
        } catch (error) {
          console.error('Failed to update profile:', error);
        }
      } else if (user && isDemoMode) {
        setUser({ ...user, photoURL: url });
      }
    },
  });

  useEffect(() => {
    if (user?.photoURL) {
      setAvatarUrl(user.photoURL);
    }
  }, [user?.photoURL]);

  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to upload a profile picture.');
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
      setIsUploading(true);
      setShowAvatarOptions(false);

      if (isDemoMode) {
        setAvatarUrl(imageUri);
        if (user) setUser({ ...user, photoURL: imageUri });
        setIsUploading(false);
        return;
      }

      try {
        const base64Data = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const { uploadProfileImage } = await import('../../src/services/profileImage.service');
        const uploadedUrl = await uploadProfileImage(user!.id, base64Data, 'image/jpeg');
        setAvatarUrl(uploadedUrl);
        await authService.updateUserProfile(user!.id, { photoURL: uploadedUrl });
        setUser({ ...user!, photoURL: uploadedUrl });
      } catch (error) {
        console.error('Upload error:', error);
        Alert.alert('Error', 'Failed to upload image. Please try again.');
      } finally {
        setIsUploading(false);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      setIsUploading(false);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const handleGenerateAvatar = async () => {
    if (!user) return;
    if (!canGenerateAvatar) {
      Alert.alert('Limit Reached', 'You\'ve used all 10 avatar generations. Pick from your previous avatars below.');
      return;
    }
    setShowAvatarOptions(false);
    await generateAvatar(user.displayName || 'User', 'user', user.id);
  };

  const handleSelectHistoryAvatar = async (url: string) => {
    setAvatarUrl(url);
    setShowAvatarOptions(false);
    if (user && !isDemoMode) {
      try {
        await authService.updateUserProfile(user.id, { photoURL: url });
        setUser({ ...user, photoURL: url });
      } catch (error) {
        console.error('Failed to update profile:', error);
      }
    } else if (user) {
      setUser({ ...user, photoURL: url });
    }
  };

  const handleAvatarPress = () => {
    setShowAvatarOptions(true);
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/(auth)/login');
            } catch (error) {
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  const handleSwitchAccount = () => {
    Alert.alert(
      'Switch Account',
      'Sign out and switch to a different account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/(auth)/login');
            } catch (error) {
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset All Data',
      'This will clear all cached data including race results and price updates. The app will reload with fresh data. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              resetAdminData();
              Alert.alert('Success', 'All data has been reset. Please restart the app.', [
                { text: 'OK', onPress: () => router.replace('/(auth)/login') }
              ]);
            } catch (error) {
              console.error('Reset error:', error);
              Alert.alert('Error', 'Failed to reset data');
            }
          },
        },
      ]
    );
  };

  const handleImportOpenF1 = async () => {
    Alert.alert(
      'Import Race Results',
      'This will fetch the latest race results from OpenF1 and import them into the app. This may update driver prices. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            setIsImporting(true);
            try {
              const result = await autoSyncOpenF1.mutateAsync(2025);
              Alert.alert(
                'Import Successful',
                `Imported ${result.driversImported} driver results.\n` +
                `Race: ${result.raceImported ? 'Yes' : 'No'}\n` +
                `Sprint: ${result.sprintImported ? 'Yes' : 'No'}`
              );
            } catch (error) {
              console.error('OpenF1 import error:', error);
              Alert.alert(
                'Import Failed',
                error instanceof Error ? error.message : 'Failed to import race results from OpenF1'
              );
            } finally {
              setIsImporting(false);
            }
          },
        },
      ]
    );
  };

  const IconBox = ({ icon, color, bg }: { icon: string; color: string; bg: string }) => (
    <View style={[styles.iconBox, { backgroundColor: bg }]}>
      <Ionicons name={icon as any} size={18} color={color} />
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero Profile Card */}
      <Card style={styles.userCard} variant="elevated">
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={handleAvatarPress}
          disabled={isUploading || isGenerating}
        >
          <LinearGradient
            colors={[COLORS.primary, '#6366F1']}
            style={styles.avatarRing}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user?.displayName?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
            )}
          </LinearGradient>
          {(isUploading || isGenerating) && (
            <View style={styles.avatarLoading}>
              <ActivityIndicator size="small" color={COLORS.white} />
            </View>
          )}
          <View style={styles.editBadge}>
            <Ionicons name="camera" size={14} color={COLORS.white} />
          </View>
          {isDemoMode && (
            <View style={styles.demoBadge}>
              <Text style={styles.demoBadgeText}>DEMO</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.userName}>{user?.displayName || 'User'}</Text>
        <Text style={styles.userEmail}>{user?.email || ''}</Text>

        {/* Stats Pills */}
        <View style={styles.statsPillRow}>
          <View style={styles.statsPill}>
            <Ionicons name="people" size={13} color={COLORS.primary} />
            <Text style={styles.statsPillText}>{userTeams.length} Team{userTeams.length !== 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.statsPill}>
            <Ionicons name="calendar" size={13} color={COLORS.warning} />
            <Text style={styles.statsPillText}>2026 Season</Text>
          </View>
          <View style={[styles.statsPill, isDemoMode && styles.statsPillDemo]}>
            <Ionicons name={isDemoMode ? 'flask' : 'cloud'} size={13} color={isDemoMode ? COLORS.warning : COLORS.success} />
            <Text style={styles.statsPillText}>{isDemoMode ? 'Demo' : 'Online'}</Text>
          </View>
        </View>
      </Card>

      {/* Avatar Options Modal */}
      {showAvatarOptions && (
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAvatarOptions(false)}
        >
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            bounces={false}
          >
            <TouchableOpacity activeOpacity={1}>
              <View style={styles.optionsCard}>
                <Text style={styles.optionsTitle}>Change Profile Picture</Text>

                <TouchableOpacity style={styles.optionItem} onPress={handlePickImage}>
                  <IconBox icon="image-outline" color={COLORS.primary} bg={COLORS.primary + '15'} />
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionText}>Choose from Library</Text>
                    <Text style={styles.optionSubtext}>Upload a photo from your device</Text>
                  </View>
                </TouchableOpacity>

                {isAvatarGenerationAvailable && (
                  <TouchableOpacity
                    style={[styles.optionItem, !canGenerateAvatar && styles.optionItemDisabled]}
                    onPress={handleGenerateAvatar}
                  >
                    <IconBox icon="sparkles" color={COLORS.purple[500]} bg={COLORS.purple[500] + '15'} />
                    <View style={styles.optionTextContainer}>
                      <Text style={styles.optionText}>
                        Auto Generate
                      </Text>
                      <Text style={styles.optionSubtext}>
                        {canGenerateAvatar
                          ? `${avatarRemaining} of 10 remaining`
                          : 'Limit reached — pick from below'}
                      </Text>
                    </View>
                    {canGenerateAvatar && (
                      <View style={styles.remainingBadge}>
                        <Text style={styles.remainingBadgeText}>{avatarRemaining}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                {/* Previous Avatars */}
                {avatarHistory.length > 0 && (
                  <View style={styles.historySection}>
                    <Text style={styles.historySectionTitle}>Previous Avatars</Text>
                    <View style={styles.historyGrid}>
                      {avatarHistory.map((url, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={[
                            styles.historyItem,
                            url === avatarUrl && styles.historyItemActive,
                          ]}
                          onPress={() => handleSelectHistoryAvatar(url)}
                        >
                          <Image source={{ uri: url }} style={styles.historyImage} />
                          {url === avatarUrl && (
                            <View style={styles.historyCheck}>
                              <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                            </View>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.optionItem, styles.cancelOption]}
                  onPress={() => setShowAvatarOptions(false)}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      )}

      {/* Account Section */}
      <Text style={styles.sectionTitle}>Account</Text>
      <Card style={styles.menuCard}>
        <TouchableOpacity style={styles.menuItem} onPress={handleSwitchAccount}>
          <View style={styles.menuItemLeft}>
            <IconBox icon="swap-horizontal" color={COLORS.primary} bg={COLORS.primary + '15'} />
            <Text style={styles.menuItemText}>Switch Account</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.text.muted} />
        </TouchableOpacity>
      </Card>

      {/* App Info */}
      <Text style={styles.sectionTitle}>App Info</Text>
      <Card style={styles.menuCard}>
        <View style={styles.menuItem}>
          <View style={styles.menuItemLeft}>
            <IconBox icon="information-circle-outline" color="#6366F1" bg="#6366F115" />
            <Text style={styles.menuItemText}>Version</Text>
          </View>
          <Text style={styles.menuItemValue}>1.0.0</Text>
        </View>

        <View style={styles.menuDivider} />

        <View style={styles.menuItem}>
          <View style={styles.menuItemLeft}>
            <IconBox icon="calendar-outline" color={COLORS.warning} bg={COLORS.warning + '15'} />
            <Text style={styles.menuItemText}>Season</Text>
          </View>
          <Text style={styles.menuItemValue}>2026</Text>
        </View>

        <View style={styles.menuDivider} />

        <View style={styles.menuItem}>
          <View style={styles.menuItemLeft}>
            <IconBox icon="cloud-outline" color={COLORS.success} bg={COLORS.success + '15'} />
            <Text style={styles.menuItemText}>Mode</Text>
          </View>
          <Text style={styles.menuItemValue}>
            {isDemoMode ? 'Demo (Offline)' : 'Online'}
          </Text>
        </View>
      </Card>

      {/* Legal / Attribution */}
      <Text style={styles.sectionTitle}>Legal</Text>
      <Card style={styles.menuCard}>
        <View style={styles.legalItem}>
          <Text style={styles.legalText}>
            This app is unofficial and is not associated in any way with the Formula 1 companies. F1, Formula 1, FIA, and related marks are trademarks of Formula One Licensing B.V. and the Federation Internationale de l'Automobile.
          </Text>
        </View>
        <View style={styles.menuDivider} />
        <View style={styles.legalItem}>
          <View style={styles.legalAttribution}>
            <IconBox icon="server-outline" color={COLORS.success} bg={COLORS.success + '15'} />
            <Text style={styles.legalText}>
              Race data provided by <Text style={styles.legalLink}>OpenF1 API</Text> — an open-source project not affiliated with Formula 1.
            </Text>
          </View>
        </View>
      </Card>

      {/* Data Management */}
      <Text style={styles.sectionTitle}>Data</Text>
      <Card style={styles.menuCard}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={handleImportOpenF1}
          disabled={isImporting}
        >
          <View style={styles.menuItemLeft}>
            {isImporting ? (
              <View style={[styles.iconBox, { backgroundColor: COLORS.success + '15' }]}>
                <ActivityIndicator size="small" color={COLORS.success} />
              </View>
            ) : (
              <IconBox icon="cloud-download-outline" color={COLORS.success} bg={COLORS.success + '15'} />
            )}
            <View>
              <Text style={[styles.menuItemText, { color: COLORS.success }]}>
                {isImporting ? 'Importing...' : 'Import from OpenF1'}
              </Text>
              <Text style={styles.menuItemSubtext}>Fetch latest race results</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.text.muted} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        <TouchableOpacity style={styles.menuItem} onPress={handleResetData}>
          <View style={styles.menuItemLeft}>
            <IconBox icon="refresh-outline" color={COLORS.warning} bg={COLORS.warning + '15'} />
            <Text style={[styles.menuItemText, { color: COLORS.warning }]}>
              Reset All Data
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.text.muted} />
        </TouchableOpacity>
      </Card>

      {/* Debug Info for Demo Mode */}
      {isDemoMode && (
        <>
          <Text style={styles.sectionTitle}>Debug Info</Text>
          <Card style={styles.debugCard}>
            <Text style={styles.debugText}>User ID: {user?.id}</Text>
            <Text style={styles.debugText}>Demo Mode: {isDemoMode ? 'Yes' : 'No'}</Text>
            <Text style={styles.debugText}>
              Created: {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
            </Text>
          </Card>
        </>
      )}

      {/* Sign Out Button */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const AVATAR_SIZE = 110;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    padding: SPACING.md,
    paddingBottom: 100,
  },

  // Hero card
  userCard: {
    alignItems: 'center',
    paddingTop: SPACING.xl + SPACING.md,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
  },

  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.lg,
  },

  avatarRing: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    borderRadius: (AVATAR_SIZE + 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.background,
  },

  avatarText: {
    fontSize: 44,
    fontWeight: 'bold',
    color: COLORS.primary,
  },

  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: COLORS.background,
  },

  avatarLoading: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  editBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: COLORS.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.background,
  },

  demoBadge: {
    position: 'absolute',
    top: 0,
    right: -4,
    backgroundColor: COLORS.warning,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
  },

  demoBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.white,
  },

  userName: {
    fontSize: FONTS.sizes.xxxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginBottom: SPACING.xs,
  },

  userEmail: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
    marginBottom: SPACING.lg,
  },

  // Stats pills
  statsPillRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },

  statsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  statsPillDemo: {
    borderColor: COLORS.warning + '40',
    backgroundColor: COLORS.warning + '08',
  },

  statsPillText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },

  // Section titles
  sectionTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
    marginTop: SPACING.sm,
  },

  // Menu cards
  menuCard: {
    marginBottom: SPACING.md,
    padding: 0,
    overflow: 'hidden',
  },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },

  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },

  iconBox: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  menuItemText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    color: COLORS.text.primary,
  },

  menuItemValue: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
    fontWeight: '500',
  },

  menuItemSubtext: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border.default,
    marginLeft: SPACING.md + 36 + SPACING.md, // align with text, past icon
  },

  // Sign out button
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md + 2,
    marginTop: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.error + '30',
    backgroundColor: COLORS.error + '08',
  },

  signOutText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.error,
  },

  // Legal
  legalItem: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },

  legalAttribution: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },

  legalText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    lineHeight: 18,
    flex: 1,
  },

  legalLink: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Debug
  debugCard: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.md,
  },

  debugText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    fontFamily: 'monospace',
    marginBottom: SPACING.xs,
  },

  // Modal styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1000,
  },

  modalScroll: {
    flex: 1,
  },

  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },

  optionsCard: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    maxHeight: '85%',
  },

  optionsTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },

  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },

  optionTextContainer: {
    flex: 1,
  },

  optionText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    color: COLORS.text.primary,
  },

  optionSubtext: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  cancelOption: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },

  cancelText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    color: COLORS.text.secondary,
    textAlign: 'center',
    flex: 1,
  },

  optionItemDisabled: {
    opacity: 0.45,
  },

  remainingBadge: {
    backgroundColor: COLORS.purple[500] + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },

  remainingBadgeText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.purple[500],
  },

  // Avatar history
  historySection: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },

  historySectionTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },

  historyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },

  historyItem: {
    width: 60,
    height: 60,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.border.default,
  },

  historyItemActive: {
    borderColor: COLORS.success,
    borderWidth: 2,
  },

  historyImage: {
    width: '100%',
    height: '100%',
  },

  historyCheck: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: COLORS.card,
    borderRadius: 10,
  },
});
