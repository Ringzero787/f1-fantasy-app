import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Image, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { getInitials } from '../../utils/avatarColors';

// ── Mono section label ─────────────────────────────────────────────────────
// 11px JetBrains Mono 700, tracking 0.18em, uppercase, muted by default.
export function MonoLabel({ children, color, size, style, numberOfLines }: {
  children: React.ReactNode;
  color?: string;
  size?: number;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const { label, scaled } = useSimpleTheme();
  const fontSize = size ? scaled(size) : label.fontSize;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[label, { fontSize, letterSpacing: fontSize * 0.18 }, color ? { color } : null, style]}
    >
      {children}
    </Text>
  );
}

// ── Avatar chip ────────────────────────────────────────────────────────────
// text.primary fill with inverse initials; shows the photo when there is one.
export function initialsOf(name?: string | null): string {
  return name ? getInitials(name) : '·';
}

export function GridAvatar({ name, imageUrl, size = 36, onPress, style }: {
  name?: string | null;
  imageUrl?: string | null;
  size?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, family, scaled } = useSimpleTheme();
  const [broken, setBroken] = useState(false);
  const s = scaled(size);
  const body = imageUrl && !broken ? (
    <Image
      source={{ uri: imageUrl }}
      onError={() => setBroken(true)}
      style={{ width: s, height: s, borderRadius: 999 }}
      accessibilityIgnoresInvertColors
    />
  ) : (
    <View style={{ width: s, height: s, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: family.ui.black, fontSize: Math.round(s / 3), color: colors.text.inverse }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Profile"
      hitSlop={8}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }, style]}
    >
      {body}
    </Pressable>
  );
}

// ── Segmented pill (tab bar, DARK/LIGHT, PTS/$) ────────────────────────────
// `card` track, 4px padding, active segment text.primary fill + inverse label.
export function SegmentPill<T extends string>({ segments, value, onChange, size = 12, padY = 14, style }: {
  segments: { key: T; label: string; badge?: boolean }[];
  value: T;
  onChange: (key: T) => void;
  size?: number;
  padY?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, family, scaled } = useSimpleTheme();
  const fontSize = scaled(size);
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: 999, padding: 4 }, style]}>
      {segments.map((seg) => {
        const active = seg.key === value;
        return (
          <Pressable
            key={seg.key}
            onPress={() => onChange(seg.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: scaled(padY),
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              backgroundColor: active ? colors.text.primary : 'transparent',
              opacity: pressed && !active ? 0.6 : 1,
            })}
          >
            <Text style={{ fontFamily: family.ui.black, fontSize, letterSpacing: fontSize * 0.08, color: active ? colors.text.inverse : colors.text.muted }}>
              {seg.label}
            </Text>
            {seg.badge && !active ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Pill button (SAVE LINEUP, SIGN OUT, JOIN LEAGUE …) ─────────────────────
export function PillButton({ label, onPress, variant = 'primary', disabled, style }: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'muted' | 'outline' | 'inverse';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, family, scaled } = useSimpleTheme();
  const look = useMemo(() => {
    switch (variant) {
      case 'primary': return { bg: colors.primary, fg: '#F2F2F2', border: colors.primary };
      case 'inverse': return { bg: colors.text.primary, fg: colors.text.inverse, border: colors.text.primary };
      case 'outline': return { bg: 'transparent', fg: colors.text.muted, border: colors.borderStrong };
      default: return { bg: colors.card, fg: colors.text.muted, border: colors.card };
    }
  }, [variant, colors]);
  const fontSize = scaled(12);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      style={({ pressed }) => [{
        paddingVertical: scaled(18),
        borderRadius: 999,
        alignItems: 'center',
        backgroundColor: look.bg,
        borderWidth: 1,
        borderColor: look.border,
        opacity: pressed ? 0.75 : 1,
      }, style]}
    >
      <Text style={{ fontFamily: family.ui.black, fontSize, letterSpacing: fontSize * 0.08, color: look.fg }}>{label}</Text>
    </Pressable>
  );
}

// ── Screen header ──────────────────────────────────────────────────────────
// Mono status row (left muted / right red or muted) over the 26px title.
export function ScreenHeader({ statusLeft, statusRight, statusRightAccent = true, onStatusLeftPress, title, titleNode, right, children }: {
  statusLeft: string;
  statusRight?: string;
  statusRightAccent?: boolean;
  onStatusLeftPress?: () => void;
  title?: string;
  titleNode?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { colors, spacing, title: titleStyle } = useSimpleTheme();
  const left = (
    <MonoLabel color={colors.text.muted}>{statusLeft}</MonoLabel>
  );
  return (
    <View style={{ paddingHorizontal: spacing.xl, gap: 6 }}>
      {/* wraps at large display sizes so neither status is cut off */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', columnGap: 12, rowGap: 4 }}>
        {onStatusLeftPress ? (
          <Pressable onPress={onStatusLeftPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={statusLeft.replace(/^[←→]\s*/, '')}>{left}</Pressable>
        ) : left}
        {statusRight ? (
          <MonoLabel color={statusRightAccent ? colors.primary : colors.text.muted} numberOfLines={1}>
            {statusRight}
          </MonoLabel>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        {titleNode ?? (
          <Text style={[titleStyle, { flex: 1, minWidth: 0 }]} numberOfLines={1}>{title}</Text>
        )}
        {right ? <View style={{ flexShrink: 0 }}>{right}</View> : null}
      </View>
      {children}
    </View>
  );
}

// ── Team-colour bar (28×3 on tiles, 20×3 in picker rows) ───────────────────
export function ColorBar({ color, width = 28 }: { color: string; width?: number }) {
  return <View style={{ width, height: 3, borderRadius: 2, backgroundColor: color }} />;
}
