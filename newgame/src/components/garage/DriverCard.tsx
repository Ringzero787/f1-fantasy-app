import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import type { Driver } from '@/types';

interface Props {
  driver: Driver;
  isStarted?: boolean;
  showReleaseButton?: boolean;
  onRelease?: () => void;
  onPress?: () => void;
  releaseValue?: number;
}

const tierColor = (tier: 'A' | 'B' | 'C') =>
  tier === 'A' ? colors.tierA : tier === 'B' ? colors.tierB : colors.tierC;

export function DriverCard({ driver, isStarted, showReleaseButton, onRelease, onPress, releaseValue }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, isStarted && styles.cardStarted, pressed && onPress && styles.pressed]}
    >
      <View style={styles.row}>
        <View style={[styles.avatar, { borderColor: tierColor(driver.tier) }]}>
          {driver.photoURL ? (
            <Image source={{ uri: driver.photoURL }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarFallback}>{driver.shortName}</Text>
          )}
        </View>

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {driver.name}
          </Text>
          <Text style={styles.team} numberOfLines={1}>
            #{driver.number} · {driver.constructorName}
          </Text>
        </View>

        <View style={styles.stats}>
          <View style={[styles.tier, { backgroundColor: tierColor(driver.tier) }]}>
            <Text style={styles.tierLabel}>{driver.tier}</Text>
          </View>
          <Text style={styles.price}>${driver.price}</Text>
          <Text style={styles.points}>{driver.fantasyPoints} pts</Text>
        </View>
      </View>

      {isStarted && (
        <View style={styles.startedBadge}>
          <Text style={styles.startedBadgeText}>STARTED</Text>
        </View>
      )}

      {showReleaseButton && onRelease && (
        <Pressable style={styles.releaseBtn} onPress={onRelease}>
          <Text style={styles.releaseBtnText}>
            Release{releaseValue !== undefined ? ` for $${releaseValue}` : ''}
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardStarted: { borderColor: colors.accent, borderWidth: 2 },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 2,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarFallback: { color: colors.text, fontWeight: '700', fontSize: fontSize.body },
  info: { flex: 1, gap: 2 },
  name: { color: colors.text, fontWeight: '700', fontSize: fontSize.bodyLarge },
  team: { color: colors.textMuted, fontSize: fontSize.caption },
  stats: { alignItems: 'flex-end', gap: 2 },
  tier: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  tierLabel: { color: '#fff', fontWeight: '800', fontSize: fontSize.caption },
  price: { color: colors.text, fontWeight: '700', fontSize: fontSize.body },
  points: { color: colors.textMuted, fontSize: fontSize.caption },
  startedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  startedBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  releaseBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
  },
  releaseBtnText: { color: colors.danger, fontSize: fontSize.caption, fontWeight: '700' },
});
