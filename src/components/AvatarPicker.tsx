import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../config/constants';
import { getAvatarGradient, getInitials } from '../utils/avatarColors';
import { useAvatarStore } from '../store/avatar.store';
import { usePurchaseStore } from '../store/purchase.store';
import { PurchaseModal } from './PurchaseModal';
import { PRODUCTS, PRODUCT_IDS } from '../config/products';
import type { AvatarType } from '../services/avatarGeneration.service';

// DiceBear styles available for each type
const AVATAR_STYLES: Record<AvatarType, { id: string; name: string }[]> = {
  league: [
    { id: 'shapes', name: 'Geometric' },
    { id: 'identicon', name: 'Identicon' },
    { id: 'rings', name: 'Rings' },
    { id: 'initials', name: 'Initials' },
    { id: 'bottts', name: 'Robots' },
    { id: 'thumbs', name: 'Thumbs' },
  ],
  team: [
    { id: 'bottts', name: 'Robots' },
    { id: 'shapes', name: 'Geometric' },
    { id: 'identicon', name: 'Identicon' },
    { id: 'thumbs', name: 'Thumbs' },
    { id: 'rings', name: 'Rings' },
    { id: 'initials', name: 'Initials' },
  ],
  user: [
    { id: 'avataaars', name: 'Avatars' },
    { id: 'bottts', name: 'Robots' },
    { id: 'fun-emoji', name: 'Emoji' },
    { id: 'thumbs', name: 'Thumbs' },
    { id: 'shapes', name: 'Geometric' },
    { id: 'initials', name: 'Initials' },
  ],
};

function generateDiceBearUrl(name: string, style: string): string {
  const seed = encodeURIComponent(name);
  return `https://api.dicebear.com/7.x/${style}/png?seed=${seed}&size=256`;
}

interface AvatarPickerProps {
  visible: boolean;
  onClose: () => void;
  name: string;
  type: AvatarType;
  currentAvatarUrl: string | null;
  onSelectAvatar: (url: string) => void;
  onGenerateAI?: () => void;
  isGeneratingAI?: boolean;
  canGenerateAI?: boolean;
  userId?: string;
}

export function AvatarPicker({
  visible,
  onClose,
  name,
  type,
  currentAvatarUrl,
  onSelectAvatar,
  onGenerateAI,
  isGeneratingAI = false,
  canGenerateAI = true,
  userId,
}: AvatarPickerProps) {
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [wasGenerating, setWasGenerating] = useState(false);
  const [showAvatarPurchase, setShowAvatarPurchase] = useState(false);

  // Purchase store
  const isPurchasing = usePurchaseStore(s => s.isPurchasing);
  const purchaseAvatarPack = usePurchaseStore(s => s.purchaseAvatarPack);

  // Avatar history & generation limits
  const avatarHistory = useAvatarStore(s => userId ? s.getHistory(userId) : []);
  const avatarRemaining = useAvatarStore(s => userId ? s.getRemaining(userId) : 10);
  const canGenerateMore = useAvatarStore(s => userId ? s.canGenerate(userId) : true);
  const addAvatar = useAvatarStore(s => s.addAvatar);
  const consumeCredit = useAvatarStore(s => s.consumeCredit);

  // When AI generation finishes, update previewUrl and save to history
  useEffect(() => {
    if (isGeneratingAI) {
      setWasGenerating(true);
    } else if (wasGenerating && currentAvatarUrl) {
      setPreviewUrl(currentAvatarUrl);
      setWasGenerating(false);
      // Save to avatar history and consume a credit
      if (userId) {
        addAvatar(userId, currentAvatarUrl);
        consumeCredit(userId);
      }
    }
  }, [isGeneratingAI, currentAvatarUrl, wasGenerating]);

  const styles_list = AVATAR_STYLES[type];
  const gradient = getAvatarGradient(name);
  const initials = getInitials(name);

  const handleStyleSelect = (styleId: string) => {
    setSelectedStyle(styleId);
    const url = generateDiceBearUrl(name, styleId);
    setPreviewUrl(url);
  };

  const handleConfirm = async () => {
    if (previewUrl) {
      setIsLoading(true);
      onSelectAvatar(previewUrl);
      setIsLoading(false);
      handleClose();
    }
  };

  const handleGenerateAI = () => {
    if (userId && !canGenerateMore) {
      setShowAvatarPurchase(true);
      return;
    }
    if (onGenerateAI) {
      onGenerateAI();
    }
  };

  const handleUploadImage = async () => {
    try {
      setIsPickingImage(true);

      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to upload a custom avatar.',
          [{ text: 'OK' }]
        );
        setIsPickingImage(false);
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        setPreviewUrl(imageUri);
        setSelectedStyle('custom');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    } finally {
      setIsPickingImage(false);
    }
  };

  const handleClose = () => {
    setSelectedStyle(null);
    setPreviewUrl(null);
    onClose();
  };

  const renderCurrentAvatar = () => {
    if (currentAvatarUrl) {
      return (
        <Image
          source={{ uri: currentAvatarUrl }}
          style={styles.currentAvatarImage}
          resizeMode="cover"
        />
      );
    }
    return (
      <LinearGradient
        colors={gradient}
        style={styles.currentAvatarPlaceholder}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.currentAvatarInitials}>{initials}</Text>
      </LinearGradient>
    );
  };

  const renderPreview = () => {
    const displayUrl = previewUrl || currentAvatarUrl;

    if (isGeneratingAI) {
      return (
        <LinearGradient
          colors={gradient}
          style={styles.previewAvatar}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <ActivityIndicator size="large" color={COLORS.white} />
          <Text style={styles.generatingText}>Generating...</Text>
        </LinearGradient>
      );
    }

    if (displayUrl) {
      return (
        <Image
          source={{ uri: displayUrl }}
          style={styles.previewAvatar}
          resizeMode="cover"
        />
      );
    }

    return (
      <LinearGradient
        colors={gradient}
        style={styles.previewAvatar}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.previewInitials}>{initials}</Text>
      </LinearGradient>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Choose Avatar</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={COLORS.gray[500]} />
            </TouchableOpacity>
          </View>

          {/* Preview */}
          <View style={styles.previewSection}>
            {renderPreview()}
            <Text style={styles.previewLabel}>
              {previewUrl ? 'Preview' : 'Current Avatar'}
            </Text>
          </View>

          {/* AI Generation Option */}
          {canGenerateAI && canGenerateMore && (
            <TouchableOpacity
              style={styles.aiGenerateButton}
              onPress={handleGenerateAI}
              disabled={isGeneratingAI}
            >
              <View style={styles.aiGenerateContent}>
                <View style={styles.aiIconContainer}>
                  <Ionicons
                    name="sparkles"
                    size={20}
                    color={COLORS.white}
                  />
                </View>
                <View style={styles.aiGenerateText}>
                  <Text style={styles.aiGenerateTitle}>
                    {isGeneratingAI ? 'Generating...' : 'Generate with AI'}
                  </Text>
                  <Text style={styles.aiGenerateSubtitle}>
                    {userId
                      ? (avatarRemaining <= (usePurchaseStore.getState().getBonusCredits(userId || '') || 0)
                          ? `${avatarRemaining} purchased credits remaining`
                          : `${avatarRemaining} of 10 remaining`)
                      : 'Create a unique avatar using AI'}
                  </Text>
                </View>
              </View>
              <View style={styles.aiRightSection}>
                {userId && !isGeneratingAI && (
                  <TouchableOpacity
                    style={styles.buyCreditsChip}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setShowAvatarPurchase(true);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="add-circle" size={14} color={COLORS.success} />
                    <Text style={styles.buyCreditsChipText}>Buy</Text>
                  </TouchableOpacity>
                )}
                {isGeneratingAI ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : userId ? (
                  <View style={styles.remainingBadge}>
                    <Text style={styles.remainingBadgeText}>{avatarRemaining}</Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={COLORS.gray[400]} />
                )}
              </View>
            </TouchableOpacity>
          )}

          {/* Buy More Credits Option — shown when free credits exhausted */}
          {canGenerateAI && !canGenerateMore && userId && (
            <TouchableOpacity
              style={styles.aiGenerateButton}
              onPress={() => setShowAvatarPurchase(true)}
            >
              <View style={styles.aiGenerateContent}>
                <View style={[styles.aiIconContainer, { backgroundColor: COLORS.success }]}>
                  <Ionicons
                    name="bag-add"
                    size={20}
                    color={COLORS.white}
                  />
                </View>
                <View style={styles.aiGenerateText}>
                  <Text style={styles.aiGenerateTitle}>Buy 20 More</Text>
                  <Text style={styles.aiGenerateSubtitle}>
                    All free credits used — get 20 more for $1.99
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.gray[400]} />
            </TouchableOpacity>
          )}

          {/* Previous Avatars Gallery */}
          {avatarHistory.length > 0 && (
            <View style={styles.historySection}>
              <Text style={styles.historySectionTitle}>Previous Avatars</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.historyScroll}
              >
                {avatarHistory.map((url, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.historyItem,
                      url === (previewUrl || currentAvatarUrl) && styles.historyItemActive,
                    ]}
                    onPress={() => {
                      setPreviewUrl(url);
                      setSelectedStyle(null);
                    }}
                  >
                    <Image source={{ uri: url }} style={styles.historyImage} />
                    {url === (previewUrl || currentAvatarUrl) && (
                      <View style={styles.historyCheck}>
                        <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Upload Custom Image Option */}
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={handleUploadImage}
            disabled={isPickingImage}
          >
            <View style={styles.aiGenerateContent}>
              <View style={styles.uploadIconContainer}>
                <Ionicons
                  name="cloud-upload"
                  size={20}
                  color={COLORS.white}
                />
              </View>
              <View style={styles.aiGenerateText}>
                <Text style={styles.aiGenerateTitle}>
                  {isPickingImage ? 'Selecting...' : 'Upload Custom Image'}
                </Text>
                <Text style={styles.aiGenerateSubtitle}>
                  Choose an image from your library
                </Text>
              </View>
            </View>
            {isPickingImage ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={COLORS.gray[400]} />
            )}
          </TouchableOpacity>

          {/* Preset Styles */}
          <View style={styles.stylesSection}>
            <Text style={styles.sectionTitle}>Or choose a style</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stylesScroll}
            >
              {styles_list.map((style) => {
                const styleUrl = generateDiceBearUrl(name, style.id);
                const isSelected = selectedStyle === style.id;

                return (
                  <TouchableOpacity
                    key={style.id}
                    style={[
                      styles.styleOption,
                      isSelected && styles.styleOptionSelected,
                    ]}
                    onPress={() => handleStyleSelect(style.id)}
                  >
                    <Image
                      source={{ uri: styleUrl }}
                      style={styles.styleImage}
                      resizeMode="cover"
                    />
                    <Text
                      style={[
                        styles.styleName,
                        isSelected && styles.styleNameSelected,
                      ]}
                    >
                      {style.name}
                    </Text>
                    {isSelected && (
                      <View style={styles.selectedBadge}>
                        <Ionicons name="checkmark" size={12} color={COLORS.white} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                (!previewUrl || isLoading) && styles.confirmButtonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!previewUrl || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.confirmButtonText}>Use This Avatar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Avatar Pack Purchase Modal */}
      <PurchaseModal
        visible={showAvatarPurchase}
        onClose={() => setShowAvatarPurchase(false)}
        onPurchase={() => {
          if (userId) {
            purchaseAvatarPack(userId);
            setShowAvatarPurchase(false);
          }
        }}
        isLoading={isPurchasing}
        title={PRODUCTS[PRODUCT_IDS.AVATAR_PACK].title}
        description={PRODUCTS[PRODUCT_IDS.AVATAR_PACK].description}
        price={PRODUCTS[PRODUCT_IDS.AVATAR_PACK].price}
        icon={PRODUCTS[PRODUCT_IDS.AVATAR_PACK].icon}
        benefits={PRODUCTS[PRODUCT_IDS.AVATAR_PACK].benefits}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },

  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[100],
  },

  title: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.gray[900],
  },

  closeButton: {
    padding: SPACING.xs,
  },

  previewSection: {
    alignItems: 'center',
    padding: SPACING.lg,
  },

  previewAvatar: {
    width: 100,
    height: 100,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  previewInitials: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.white,
  },

  generatingText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.white,
    marginTop: SPACING.xs,
  },

  previewLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
    marginTop: SPACING.sm,
  },

  currentAvatarImage: {
    width: 100,
    height: 100,
    borderRadius: BORDER_RADIUS.lg,
  },

  currentAvatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  currentAvatarInitials: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.white,
  },

  aiGenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: COLORS.primary + '10',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },

  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.accent + '10',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
  },

  uploadIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  aiGenerateContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },

  aiIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  aiGenerateText: {
    gap: 2,
  },

  aiGenerateTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[900],
  },

  aiGenerateSubtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[500],
  },

  stylesSection: {
    padding: SPACING.lg,
    paddingTop: SPACING.md,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.gray[600],
    marginBottom: SPACING.md,
  },

  stylesScroll: {
    gap: SPACING.sm,
  },

  styleOption: {
    alignItems: 'center',
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },

  styleOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },

  styleImage: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.gray[100],
  },

  styleName: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[600],
    marginTop: SPACING.xs,
  },

  styleNameSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  selectedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actions: {
    flexDirection: 'row',
    padding: SPACING.lg,
    paddingTop: 0,
    gap: SPACING.md,
  },

  cancelButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
  },

  cancelButtonText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[600],
    fontWeight: '500',
  },

  confirmButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
  },

  confirmButtonDisabled: {
    opacity: 0.5,
  },

  confirmButtonText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.white,
    fontWeight: '600',
  },

  aiGenerateButtonDisabled: {
    opacity: 0.45,
  },

  aiRightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  buyCreditsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.success + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },

  buyCreditsChipText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.success,
  },

  remainingBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },

  remainingBadgeText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },

  historySection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },

  historySectionTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.gray[600],
    marginBottom: SPACING.sm,
  },

  historyScroll: {
    gap: SPACING.sm,
  },

  historyItem: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.gray[200],
  },

  historyItemActive: {
    borderColor: COLORS.success,
  },

  historyImage: {
    width: '100%',
    height: '100%',
  },

  historyCheck: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: COLORS.white,
    borderRadius: 10,
  },
});
