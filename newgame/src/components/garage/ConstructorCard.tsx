import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import type { Constructor } from '@/types';

interface Props {
  constructor: Constructor;
  isStarted?: boolean;
  showReleaseButton?: boolean;
  onRelease?: () => void;
  onPress?: () => void;
  releaseValue?: number;
}

export function ConstructorCard({ constructor, isStarted, showReleaseButton, onRelease, onPress, releaseValue }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: constructor.primaryColor || colors.accent },
        isStarted && styles.cardStarted,
        pressed && onPress && styles.pressed,
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.swatch, { backgroundColor: constructor.primaryColor || colors.accent }]} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {constructor.name}
          </Text>
          <Text style={styles.sub}>
            {constructor.shortName} · {constructor.nationality}
          </Text>
        </View>
        <View style={styles.stats}>
          <Text style={styles.price}>${constructor.price}</Text>
          <Text style={styles.points}>{constructor.fantasyPoints} pts</Text>
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
    borderLeftWidth: 5,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardStarted: { borderColor: colors.accent, borderWidth: 2 },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  swatch: { width: 12, height: 40, borderRadius: radius.sm },
  info: { flex: 1, gap: 2 },
  name: { color: colors.text, fontWeight: '700', fontSize: fontSize.bodyLarge },
  sub: { color: colors.textMuted, fontSize: fontSize.caption },
  stats: { alignItems: 'flex-end', gap: 2 },
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
