import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../config/constants';
import { useTheme } from '../hooks/useTheme';

interface PurchaseModalProps {
  visible: boolean;
  onClose: () => void;
  onPurchase: () => void;
  isLoading: boolean;
  title: string;
  description: string;
  price: string;
  icon: string;
  benefits: string[];
}

export function PurchaseModal({
  visible,
  onClose,
  onPurchase,
  isLoading,
  title,
  description,
  price,
  icon,
  benefits,
}: PurchaseModalProps) {
  const theme = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
                <Ionicons name={icon as any} size={24} color={theme.primary} />
              </View>
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={COLORS.text.muted} />
            </TouchableOpacity>
          </View>

          {/* Description */}
          <Text style={styles.description}>{description}</Text>

          {/* Benefits */}
          <View style={styles.benefitsList}>
            {benefits.map((benefit, index) => (
              <View key={index} style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>

          {/* Purchase Button */}
          <TouchableOpacity
            style={[styles.purchaseButton, { backgroundColor: theme.primary }]}
            onPress={onPurchase}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.text.inverse} />
            ) : (
              <Text style={styles.purchaseButtonText}>Purchase for {price}</Text>
            )}
          </TouchableOpacity>

          {/* Dismiss Button */}
          <TouchableOpacity style={styles.dismissButton} onPress={onClose}>
            <Text style={styles.dismissButtonText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },

  container: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    width: '100%',
    maxWidth: 380,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },

  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '700',
    color: COLORS.text.primary,
  },

  closeButton: {
    padding: SPACING.xs,
  },

  description: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },

  benefitsList: {
    marginBottom: SPACING.xl,
    gap: SPACING.md,
  },

  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  benefitText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.primary,
    flex: 1,
  },

  purchaseButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.button,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },

  purchaseButtonText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.inverse,
  },

  dismissButton: {
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },

  dismissButtonText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
  },
});
