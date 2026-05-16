import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  cash: number;
  totalPoints?: number;
  streak?: { wins: number; losses: number };
}

export function CashHeader({ cash, totalPoints, streak }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.cashBlock}>
        <Text style={styles.label}>Bankroll</Text>
        <Text style={styles.cash}>${cash}</Text>
      </View>
      {totalPoints !== undefined && (
        <View style={styles.statBlock}>
          <Text style={styles.label}>Season pts</Text>
          <Text style={styles.stat}>{totalPoints}</Text>
        </View>
      )}
      {streak && (streak.wins > 0 || streak.losses > 0) && (
        <View style={styles.statBlock}>
          <Text style={styles.label}>Streak</Text>
          <Text style={[styles.stat, { color: streak.wins > 0 ? colors.success : colors.danger }]}>
            {streak.wins > 0 ? `+${streak.wins}` : `-${streak.losses}`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  cashBlock: { gap: 2 },
  statBlock: { gap: 2, alignItems: 'flex-end' },
  label: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cash: { color: colors.success, fontSize: fontSize.heading, fontWeight: '800' },
  stat: { color: colors.text, fontSize: fontSize.title, fontWeight: '700' },
});
