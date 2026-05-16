import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  title: string;
  description: string;
  priceUsdCents: number;
  badge?: string;
  ownedLabel?: string;
  disabled?: boolean;
  onPress: () => void;
}

export function StoreItemCard({ title, description, priceUsdCents, badge, ownedLabel, disabled, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.card, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.description} numberOfLines={2}>
          {description}
        </Text>
      </View>
      <View style={styles.priceCol}>
        {ownedLabel ? (
          <Text style={styles.owned}>{ownedLabel}</Text>
        ) : (
          <Text style={styles.price}>{formatPrice(priceUsdCents)}</Text>
        )}
      </View>
    </Pressable>
  );
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  titleRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  title: { color: colors.text, fontSize: fontSize.bodyLarge, fontWeight: '700' },
  description: { color: colors.textMuted, fontSize: fontSize.caption },
  badge: { backgroundColor: colors.success, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  priceCol: { alignItems: 'flex-end' },
  price: { color: colors.accent, fontWeight: '800', fontSize: fontSize.bodyLarge },
  owned: { color: colors.success, fontWeight: '800', fontSize: fontSize.caption, letterSpacing: 0.5 },
});
