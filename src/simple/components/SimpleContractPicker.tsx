import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONT_FAMILY } from '../theme/simpleTheme';
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
  const { colors, spacing, scaled, display, displayUpright } = useSimpleTheme();
  const budgetAfter = budgetRemaining - price;
  const canAfford = budgetAfter >= 0;

  const styles = useMemo(() => ({
    backdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
      justifyContent: 'flex-end' as const,
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: S_RADIUS.sheet,
      borderTopRightRadius: S_RADIUS.sheet,
      paddingHorizontal: scaled(20),
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl + 8,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: S_RADIUS.full,
      backgroundColor: colors.borderLight,
      alignSelf: 'center' as const,
    },
    kicker: {
      fontSize: scaled(11.5),
      fontFamily: S_FONT_FAMILY.body.semibold,
      color: colors.text.muted,
      textTransform: 'uppercase' as const,
      letterSpacing: 1.4,
      marginTop: scaled(16),
    },
    name: {
      ...displayUpright,
      fontSize: scaled(24),
      letterSpacing: -0.5,
      color: colors.text.primary,
      marginTop: scaled(6),
      marginBottom: scaled(18),
    },
    summaryCard: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      backgroundColor: colors.surface,
      borderRadius: S_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: scaled(16),
      paddingHorizontal: scaled(18),
    },
    summaryItemRight: {
      alignItems: 'flex-end' as const,
    },
    summaryLabel: {
      fontSize: scaled(12),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
      marginBottom: 4,
    },
    summaryValue: {
      ...display,
      fontSize: scaled(22),
      letterSpacing: -0.4,
      color: colors.text.primary,
    },
    sectionLabel: {
      fontSize: scaled(14),
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.text.secondary,
      marginTop: scaled(22),
      marginBottom: scaled(10),
    },
    contractRow: {
      flexDirection: 'row' as const,
      gap: scaled(8),
    },
    contractBtn: {
      flex: 1,
      height: scaled(48),
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderRadius: S_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'transparent',
    },
    contractBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    contractBtnText: {
      fontSize: scaled(16),
      fontFamily: S_FONT_FAMILY.body.semibold,
      color: colors.text.primary,
    },
    contractBtnTextActive: {
      color: colors.text.inverse,
    },
    confirmBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: scaled(8),
      backgroundColor: colors.primary,
      borderRadius: S_RADIUS.lg,
      paddingVertical: scaled(15),
      marginTop: scaled(22),
    },
    confirmBtnDisabled: {
      backgroundColor: colors.primaryFaint,
      opacity: 0.6,
    },
    confirmBtnText: {
      fontSize: scaled(15.5),
      fontFamily: S_FONT_FAMILY.body.semibold,
      letterSpacing: 0.2,
      color: colors.text.inverse,
    },
    cancelBtn: {
      alignItems: 'center' as const,
      paddingVertical: scaled(12),
      marginTop: scaled(10),
    },
    cancelBtnText: {
      fontSize: scaled(15),
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.text.secondary,
    },
  }), [colors, spacing, scaled, display, displayUpright]);

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
          <Text style={styles.kicker}>
            Add {entityType === 'driver' ? 'Driver' : 'Constructor'}
          </Text>
          <Text style={styles.name}>{name}</Text>

          {/* Price summary */}
          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.summaryLabel}>Price</Text>
              <Text style={styles.summaryValue}>${price}</Text>
            </View>
            <View style={styles.summaryItemRight}>
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
          <Text style={styles.sectionLabel}>Contract length (races)</Text>
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
              name="add"
              size={17}
              color={canAfford ? colors.text.inverse : colors.primary}
            />
            <Text
              style={[
                styles.confirmBtnText,
                !canAfford && { color: colors.primary },
              ]}
            >
              Add to team
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
