import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import type { BagOfCash } from '@/types';

export function BagOfCashCard({ bag }: { bag: BagOfCash }) {
  const positive = bag.net > 0;
  const negative = bag.net < 0;
  const color = positive ? colors.success : negative ? colors.danger : colors.textMuted;
  const sign = positive ? '+' : negative ? '-' : '';
  const abs = Math.abs(bag.net);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Your bag</Text>
      <Text style={[styles.amount, { color }]}>
        {sign}
        {bag.currencyLabel}
        {abs}
      </Text>
      <View style={styles.subRow}>
        {bag.unsettledOwed > 0 && (
          <Text style={styles.sub}>
            <Text style={{ color: colors.success }}>{bag.currencyLabel}{bag.unsettledOwed}</Text> owed to you
          </Text>
        )}
        {bag.unsettledOwing > 0 && (
          <Text style={styles.sub}>
            You owe <Text style={{ color: colors.danger }}>{bag.currencyLabel}{bag.unsettledOwing}</Text>
          </Text>
        )}
        {bag.unsettledOwed === 0 && bag.unsettledOwing === 0 && (
          <Text style={styles.sub}>All settled up.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  label: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  amount: { fontSize: fontSize.display, fontWeight: '800' },
  subRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  sub: { color: colors.textMuted, fontSize: fontSize.caption },
});
