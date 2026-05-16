import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  active: 'qualifying' | 'race';
  onChange: (scope: 'qualifying' | 'race') => void;
  qualifyingLocked?: boolean;
  raceLocked?: boolean;
}

export function SessionTabs({ active, onChange, qualifyingLocked, raceLocked }: Props) {
  return (
    <View style={styles.row}>
      <TabButton
        label="Qualifying"
        active={active === 'qualifying'}
        locked={qualifyingLocked}
        onPress={() => onChange('qualifying')}
      />
      <TabButton
        label="Race"
        active={active === 'race'}
        locked={raceLocked}
        onPress={() => onChange('race')}
      />
    </View>
  );
}

function TabButton({
  label,
  active,
  locked,
  onPress,
}: {
  label: string;
  active: boolean;
  locked?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      {locked && (
        <View style={styles.lockBadge}>
          <Text style={styles.lockBadgeText}>LOCKED</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 4, gap: 4 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
  },
  tabActive: { backgroundColor: colors.bgInput },
  tabLabel: { color: colors.textMuted, fontWeight: '700', fontSize: fontSize.body },
  tabLabelActive: { color: colors.text },
  lockBadge: { backgroundColor: colors.danger, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  lockBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
});
