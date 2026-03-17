import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_COLORS, S_FONTS, S_SPACING, S_RADIUS } from '../theme/simpleTheme';
import { PRICING_CONFIG } from '../../config/pricing.config';

interface Props {
  visible: boolean;
  name: string;
  price: number;
  budgetRemaining: number;
  entityType: 'driver' | 'constructor';
  contractLength: number;
  onChangeContractLength: (len: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONTRACT_OPTIONS = [1, 2, 3, 4, 5, 6];

export const SimpleContractPicker = React.memo(function SimpleContractPicker({
  visible,
  name,
  price,
  budgetRemaining,
  entityType,
  contractLength,
  onChangeContractLength,
  onConfirm,
  onCancel,
}: Props) {
  const budgetAfter = budgetRemaining - price;
  const canAfford = budgetAfter >= 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {/* Handle bar */}
          <View style={styles.handle} />

          {/* Header */}
          <Text style={styles.title}>
            Add {entityType === 'driver' ? 'Driver' : 'Constructor'}
          </Text>
          <Text style={styles.name}>{name}</Text>

          {/* Price summary */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Price</Text>
              <Text style={styles.summaryValue}>${price}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Budget After</Text>
              <Text
                style={[
                  styles.summaryValue,
                  !canAfford && { color: S_COLORS.negative },
                ]}
              >
                ${budgetAfter}
              </Text>
            </View>
          </View>

          {/* Contract length */}
          <Text style={styles.sectionLabel}>Contract Length (races)</Text>
          <View style={styles.contractRow}>
            {CONTRACT_OPTIONS.map((len) => (
              <TouchableOpacity
                key={len}
                style={[
                  styles.contractBtn,
                  contractLength === len && styles.contractBtnActive,
                ]}
                onPress={() => onChangeContractLength(len)}
                activeOpacity={0.6}
              >
                <Text
                  style={[
                    styles.contractBtnText,
                    contractLength === len && styles.contractBtnTextActive,
                  ]}
                >
                  {len}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Buttons */}
          <TouchableOpacity
            style={[styles.confirmBtn, !canAfford && styles.confirmBtnDisabled]}
            onPress={onConfirm}
            disabled={!canAfford}
            activeOpacity={0.7}
          >
            <Ionicons
              name="add-circle"
              size={18}
              color={canAfford ? S_COLORS.text.inverse : S_COLORS.text.muted}
            />
            <Text
              style={[
                styles.confirmBtnText,
                !canAfford && { color: S_COLORS.text.muted },
              ]}
            >
              Add to Team
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            activeOpacity={0.6}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: S_COLORS.background,
    borderTopLeftRadius: S_RADIUS.lg,
    borderTopRightRadius: S_RADIUS.lg,
    paddingHorizontal: S_SPACING.xl,
    paddingTop: S_SPACING.md,
    paddingBottom: S_SPACING.xxl + 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: S_COLORS.border,
    alignSelf: 'center',
    marginBottom: S_SPACING.lg,
  },
  title: {
    fontSize: S_FONTS.sizes.sm,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: S_SPACING.xs,
  },
  name: {
    fontSize: S_FONTS.sizes.xl,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.text.primary,
    marginBottom: S_SPACING.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: S_COLORS.card,
    borderRadius: S_RADIUS.md,
    borderWidth: 1,
    borderColor: S_COLORS.borderLight,
    padding: S_SPACING.md,
    marginBottom: S_SPACING.lg,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: S_FONTS.sizes.xs,
    color: S_COLORS.text.muted,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: S_FONTS.sizes.lg,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.text.primary,
  },
  sectionLabel: {
    fontSize: S_FONTS.sizes.sm,
    fontWeight: S_FONTS.weights.medium,
    color: S_COLORS.text.secondary,
    marginBottom: S_SPACING.sm,
  },
  contractRow: {
    flexDirection: 'row',
    gap: S_SPACING.sm,
    marginBottom: S_SPACING.xl,
  },
  contractBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: S_SPACING.sm,
    borderRadius: S_RADIUS.sm,
    borderWidth: 1,
    borderColor: S_COLORS.border,
    backgroundColor: S_COLORS.background,
  },
  contractBtnActive: {
    backgroundColor: S_COLORS.primary,
    borderColor: S_COLORS.primary,
  },
  contractBtnText: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.secondary,
  },
  contractBtnTextActive: {
    color: S_COLORS.text.inverse,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: S_SPACING.sm,
    backgroundColor: S_COLORS.primary,
    borderRadius: S_RADIUS.md,
    paddingVertical: S_SPACING.md + 2,
    marginBottom: S_SPACING.sm,
  },
  confirmBtnDisabled: {
    backgroundColor: S_COLORS.card,
  },
  confirmBtnText: {
    fontSize: S_FONTS.sizes.lg,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.inverse,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: S_SPACING.md,
  },
  cancelBtnText: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.medium,
    color: S_COLORS.text.muted,
  },
});
