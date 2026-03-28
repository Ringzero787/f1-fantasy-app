import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONTS } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';

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
  const { colors, fonts, spacing } = useSimpleTheme();
  const budgetAfter = budgetRemaining - price;
  const canAfford = budgetAfter >= 0;

  const styles = useMemo(() => ({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'flex-end' as const,
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: S_RADIUS.lg,
      borderTopRightRadius: S_RADIUS.lg,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl + 16,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center' as const,
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.muted,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.8,
      marginBottom: spacing.xs,
    },
    name: {
      fontSize: fonts.xl,
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.primary,
      marginBottom: spacing.lg,
    },
    summaryRow: {
      flexDirection: 'row' as const,
      backgroundColor: colors.card,
      borderRadius: S_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    summaryItem: {
      flex: 1,
      alignItems: 'center' as const,
    },
    summaryLabel: {
      fontSize: fonts.xs,
      color: colors.text.muted,
      marginBottom: 2,
    },
    summaryValue: {
      fontSize: fonts.lg,
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.primary,
    },
    sectionLabel: {
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.medium,
      color: colors.text.secondary,
      marginBottom: spacing.sm,
    },
    contractRow: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
      marginBottom: spacing.xl,
    },
    contractBtn: {
      flex: 1,
      alignItems: 'center' as const,
      paddingVertical: spacing.sm,
      borderRadius: S_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    contractBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    contractBtnText: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.secondary,
    },
    contractBtnTextActive: {
      color: colors.text.inverse,
    },
    confirmBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: S_RADIUS.md,
      paddingVertical: spacing.md + 2,
      marginBottom: spacing.sm,
    },
    confirmBtnDisabled: {
      backgroundColor: colors.card,
    },
    confirmBtnText: {
      fontSize: fonts.lg,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.inverse,
    },
    cancelBtn: {
      alignItems: 'center' as const,
      paddingVertical: spacing.md,
    },
    cancelBtnText: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.medium,
      color: colors.text.muted,
    },
  }), [colors, fonts, spacing]);

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
                  !canAfford && { color: colors.negative },
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
              color={canAfford ? colors.text.inverse : colors.text.muted}
            />
            <Text
              style={[
                styles.confirmBtnText,
                !canAfford && { color: colors.text.muted },
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
