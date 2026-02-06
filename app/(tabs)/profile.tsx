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
import { useAuth } from '../../src/hooks/useAuth';
import { useAvatarGeneration, useAutoSyncOpenF1 } from '../../src/hooks';
import { authService } from '../../src/services/auth.service';
import { Card } from '../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../src/config/constants';
import { useAuthStore } from '../../src/store/auth.store';
import { useAdminStore } from '../../src/store/admin.store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ProfileScreen() {
  const { user, isDemoMode, signOut } = useAuth();
  const setUser = useAuthStore((state) => state.setUser);
  const resetAdminData = useAdminStore((state) => state.resetAllData);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.photoURL || null);
  const [isUploading, setIsUploading] = useState(false);
  const [showAvatarOptions, setShowAvatarOptions] = useState(false);

  // OpenF1 import functionality
  const autoSyncOpenF1 = useAutoSyncOpenF1();
  const [isImporting, setIsImporting] = useState(false);

  const { generate: generateAvatar, isGenerating, isAvailable: isAvatarGenerationAvailable } = useAvatarGeneration({
    onSuccess: async (url) => {
      setAvatarUrl(url);
      // Update user profile with new avatar
      if (user && !isDemoMode) {
        try {
          await authService.updateUserProfile(user.id, { photoURL: url });
          setUser({ ...user, photoURL: url });
        } catch (error) {
          console.error('Failed to update profile:', error);
        }
      } else if (user && isDemoMode) {
        // In demo mode, just update local state
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
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to upload a profile picture.');
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const imageUri = result.assets[0].uri;
      setIsUploading(true);
      setShowAvatarOptions(false);

      if (isDemoMode) {
        // In demo mode, just use the local URI
        setAvatarUrl(imageUri);
        if (user) {
          setUser({ ...user, photoURL: imageUri });
        }
        setIsUploading(false);
        Alert.alert('Success', 'Profile picture updated!');
        return;
      }

      // For non-demo mode, upload to Firebase Storage
      // Read file as base64 using expo-file-system
      try {
        const base64Data = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Upload using the profile image service
        const { uploadProfileImage } = await import('../../src/services/profileImage.service');
        const uploadedUrl = await uploadProfileImage(user!.id, base64Data, 'image/jpeg');

        setAvatarUrl(uploadedUrl);
        await authService.updateUserProfile(user!.id, { photoURL: uploadedUrl });
        setUser({ ...user!, photoURL: uploadedUrl });
        Alert.alert('Success', 'Profile picture updated!');
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
    setShowAvatarOptions(false);
    await generateAvatar(user.displayName || 'User', 'user', user.id);
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
              // Clear all AsyncStorage
              await AsyncStorage.clear();
              // Reset admin store
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User Info Card */}
      <Card style={styles.userCard} variant="elevated">
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={handleAvatarPress}
          disabled={isUploading || isGenerating}
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
        <Text style={styles.tapToChange}>Tap photo to change</Text>
      </Card>

      {/* Avatar Options Modal */}
      {showAvatarOptions && (
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAvatarOptions(false)}
        >
          <View style={styles.optionsCard}>
            <Text style={styles.optionsTitle}>Change Profile Picture</Text>

            <TouchableOpacity style={styles.optionItem} onPress={handlePickImage}>
              <Ionicons name="image-outline" size={24} color={COLORS.primary} />
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionText}>Choose from Library</Text>
                <Text style={styles.optionSubtext}>Upload a photo from your device</Text>
              </View>
            </TouchableOpacity>

            {isAvatarGenerationAvailable && (
              <TouchableOpacity style={styles.optionItem} onPress={handleGenerateAvatar}>
                <Ionicons name="sparkles" size={24} color={COLORS.purple[500]} />
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionText}>Auto Generate</Text>
                  <Text style={styles.optionSubtext}>Create an AI-generated avatar</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.optionItem, styles.cancelOption]}
              onPress={() => setShowAvatarOptions(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Account Section */}
      <Text style={styles.sectionTitle}>Account</Text>
      <Card style={styles.menuCard}>
        <TouchableOpacity style={styles.menuItem} onPress={handleSwitchAccount}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="swap-horizontal" size={22} color={COLORS.primary} />
            <Text style={styles.menuItemText}>Switch Account</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.text.muted} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        <TouchableOpacity style={styles.menuItem} onPress={handleSignOut}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="log-out-outline" size={22} color={COLORS.error} />
            <Text style={[styles.menuItemText, { color: COLORS.error }]}>
              Sign Out
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.text.muted} />
        </TouchableOpacity>
      </Card>

      {/* App Info */}
      <Text style={styles.sectionTitle}>App Info</Text>
      <Card style={styles.menuCard}>
        <View style={styles.menuItem}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="information-circle-outline" size={22} color={COLORS.text.secondary} />
            <Text style={styles.menuItemText}>Version</Text>
          </View>
          <Text style={styles.menuItemValue}>1.0.0</Text>
        </View>

        <View style={styles.menuDivider} />

        <View style={styles.menuItem}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="calendar-outline" size={22} color={COLORS.text.secondary} />
            <Text style={styles.menuItemText}>Season</Text>
          </View>
          <Text style={styles.menuItemValue}>2025</Text>
        </View>

        <View style={styles.menuDivider} />

        <View style={styles.menuItem}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="cloud-outline" size={22} color={COLORS.text.secondary} />
            <Text style={styles.menuItemText}>Mode</Text>
          </View>
          <Text style={styles.menuItemValue}>
            {isDemoMode ? 'Demo (Offline)' : 'Online'}
          </Text>
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
              <ActivityIndicator size="small" color={COLORS.success} />
            ) : (
              <Ionicons name="cloud-download-outline" size={22} color={COLORS.success} />
            )}
            <View>
              <Text style={[styles.menuItemText, { color: COLORS.success }]}>
                {isImporting ? 'Importing...' : 'Import from OpenF1'}
              </Text>
              <Text style={styles.menuItemSubtext}>Fetch latest race results</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.text.muted} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        <TouchableOpacity style={styles.menuItem} onPress={handleResetData}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="refresh-outline" size={22} color={COLORS.warning} />
            <Text style={[styles.menuItemText, { color: COLORS.warning }]}>
              Reset All Data
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.text.muted} />
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

  userCard: {
    alignItems: 'center',
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
  },

  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },

  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.white,
  },

  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },

  avatarLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },

  tapToChange: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: SPACING.sm,
  },

  demoBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: COLORS.warning,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 8,
  },

  demoBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.white,
  },

  userName: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginBottom: SPACING.xs,
  },

  userEmail: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },

  menuCard: {
    marginBottom: SPACING.lg,
    padding: 0,
    overflow: 'hidden',
  },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },

  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },

  menuItemText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.primary,
  },

  menuItemValue: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
  },

  menuItemSubtext: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border.default,
    marginHorizontal: SPACING.md,
  },

  debugCard: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
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
    justifyContent: 'flex-end',
    zIndex: 1000,
  },

  optionsCard: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
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
});
