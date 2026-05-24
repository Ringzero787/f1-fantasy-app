// Track Limits design-system atoms. Ported from design_handoff_track_limits/atoms.jsx
// with React Native primitives. Type-led, mono numerics, broadcast-graphic restraint.

import { Alert, Pressable, StyleProp, StyleSheet, Text, TextStyle, TouchableOpacity, Vibration, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { hexA } from '@/theme/tokens';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import type { SessionKey } from '@/types';

// ---- TierChip — A is gold-filled; B/C outlined ----
export function TierChip({ tier, size = 'sm' }: { tier: 'A' | 'B' | 'C'; size?: 'sm' | 'md' }) {
  const t = useTheme();
  const color = tier === 'A' ? t.tierA : tier === 'B' ? t.tierB : t.tierC;
  const big = size === 'md';
  const dim = big ? 22 : 18;
  const isA = tier === 'A';
  return (
    <View
      style={{
        width: dim,
        height: dim,
        borderRadius: 4,
        backgroundColor: isA ? color : 'transparent',
        borderWidth: isA ? 0 : 1,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        ...(isA && {
          shadowColor: t.tierA,
          shadowOpacity: 0.4,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 0 },
        }),
      }}
    >
      <Text
        style={{
          fontFamily: t.fMono,
          fontWeight: '700',
          fontSize: big ? 12 : 10,
          color: isA ? '#1A1410' : color,
          letterSpacing: 0.2,
        }}
      >
        {tier}
      </Text>
    </View>
  );
}

// ---- TierMultBadge — gameplay readout: "3× per spot gained" ----
const TIER_MULTIPLIER: Record<'A' | 'B' | 'C', number> = { A: 1, B: 2, C: 3 };
export function TierMultBadge({ tier, size = 'sm' }: { tier: 'A' | 'B' | 'C'; size?: 'sm' | 'md' }) {
  const t = useTheme();
  const mult = TIER_MULTIPLIER[tier] ?? 1;
  const big = size === 'md';
  if (mult === 1) {
    return (
      <View
        style={{
          height: big ? 22 : 18,
          paddingHorizontal: 6,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: t.lineSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color: t.textMute,
            fontFamily: t.fMono,
            fontWeight: '600',
            fontSize: big ? 11 : 10,
            letterSpacing: 0.2,
          }}
        >
          1×
        </Text>
      </View>
    );
  }
  const color = tier === 'C' ? t.tierC : t.tierB;
  return (
    <View
      style={{
        height: big ? 22 : 18,
        paddingHorizontal: 6,
        borderRadius: 4,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: '#0E1116',
          fontFamily: t.fMono,
          fontWeight: '700',
          fontSize: big ? 11 : 10,
          letterSpacing: 0.2,
        }}
      >
        {mult}×
      </Text>
    </View>
  );
}

// ---- Num — tabular monospaced number ----
export function Num({
  children,
  size = 14,
  weight = '500',
  color,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  weight?: TextStyle['fontWeight'];
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const t = useTheme();
  return (
    <Text
      style={[
        {
          fontFamily: t.fMono,
          fontWeight: weight,
          fontSize: size,
          color: color || t.text,
          fontVariant: ['tabular-nums'],
          letterSpacing: -0.2,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// ---- SectionLabel — small mono ALL-CAPS section header ----
export function SectionLabel({
  children,
  trailing,
  style,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View style={[styles.sectionRow, style]}>
      <Text
        style={{
          fontFamily: t.fMono,
          fontSize: 11,
          fontWeight: '500',
          color: t.textMute,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </Text>
      {trailing && (
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 11,
            fontWeight: '500',
            color: t.textMute,
            letterSpacing: 0.8,
          }}
        >
          {trailing}
        </Text>
      )}
    </View>
  );
}

// ---- Cash — display-typography currency, "1234.56" with stylized $ + cents ----
export function Cash({ amount, size = 28, accent = false }: { amount: number; size?: number; accent?: boolean }) {
  const t = useTheme();
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100)
    .toString()
    .padStart(2, '0');
  return (
    <Text
      style={{
        fontFamily: t.fDisp,
        fontWeight: '600',
        fontSize: size,
        color: accent ? t.accent : t.text,
        letterSpacing: -0.8,
        fontVariant: ['tabular-nums'],
      }}
    >
      <Text style={{ fontWeight: '400', opacity: 0.5 }}>$</Text>
      {whole}
      <Text style={{ fontSize: size * 0.55, opacity: 0.55, fontWeight: '500' }}>.{cents}</Text>
    </Text>
  );
}

// ---- PrimaryBtn — accent fill, full width by default ----
export function PrimaryBtn({
  title,
  onPress,
  disabled,
  loading,
  full = true,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const dim = disabled || loading;
  return (
    <Pressable
      onPress={dim ? undefined : onPress}
      disabled={dim}
      style={({ pressed }) => [
        {
          width: full ? '100%' : undefined,
          height: 52,
          borderRadius: 12,
          backgroundColor: dim ? t.surface2 : t.accent,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: dim ? 0.55 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      <Text
        style={{
          color: dim ? t.textMute : '#0E1116',
          fontFamily: t.fSans,
          fontWeight: '600',
          fontSize: 15,
          letterSpacing: 0.2,
        }}
      >
        {loading ? '…' : title}
      </Text>
    </Pressable>
  );
}

// ---- GhostBtn — outlined, mono, ALL-CAPS ----
export function GhostBtn({
  title,
  onPress,
  style,
}: {
  title: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: 38,
          paddingHorizontal: 14,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: t.line,
          backgroundColor: 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: t.text,
          fontFamily: t.fMono,
          fontWeight: '500',
          fontSize: 12,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

// ---- StartedBadge — accent pill, unmistakable ----
export function StartedBadge({ scope = 'race' }: { scope?: 'race' | 'quali' }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 3,
        paddingLeft: 6,
        paddingRight: 7,
        backgroundColor: t.accent,
        borderRadius: 4,
        gap: 5,
      }}
    >
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: '#0E1116' }} />
      <Text
        style={{
          color: '#0E1116',
          fontFamily: t.fMono,
          fontSize: 9,
          fontWeight: '700',
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        {scope === 'quali' ? 'STARTED · Q' : 'STARTED'}
      </Text>
    </View>
  );
}

// ---- MemberAvatar — colored initials, deterministic id-based color, "you" override ----
const MEMBER_COLORS = ['#7C9CFF', '#F25C54', '#E0A458', '#FF8E3C', '#7BD389', '#A78BFA'];

export function MemberAvatar({
  member,
  size = 32,
}: {
  member: { id?: string; name?: string; initials?: string; you?: boolean };
  size?: number;
}) {
  const t = useTheme();
  const seed = (member.id || member.name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const idx = seed % MEMBER_COLORS.length;
  const bg = member.you ? t.accent : MEMBER_COLORS[idx];
  const initials = member.initials || (member.name || '?').charAt(0).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: '#0E1116',
          fontFamily: t.fMono,
          fontWeight: '700',
          fontSize: Math.round(size * 0.36),
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

// ---- StatusPill — settlement / ledger state pill ----
type SettlementStatus = 'awaiting_confirmation' | 'settled' | 'disputed' | 'canceled';
export function StatusPill({ status }: { status: SettlementStatus }) {
  const t = useTheme();
  const map: Record<SettlementStatus, { label: string; bg: string; fg: string; dot: string }> = {
    awaiting_confirmation: { label: 'AWAITING', bg: '#3a2d0a', fg: '#FFC857', dot: '#FFC857' },
    settled: { label: 'SETTLED', bg: '#0d2418', fg: t.success, dot: t.success },
    disputed: { label: 'DISPUTED', bg: '#2a0e0e', fg: t.danger, dot: t.danger },
    canceled: { label: 'CANCELED', bg: t.surface2, fg: t.textMute, dot: t.textMute },
  };
  const s = map[status] ?? map.canceled;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        height: 18,
        paddingHorizontal: 7,
        borderRadius: 3,
        backgroundColor: s.bg,
      }}
    >
      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: s.dot }} />
      <Text
        style={{
          color: s.fg,
          fontFamily: t.fMono,
          fontSize: 9,
          fontWeight: '700',
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        {s.label}
      </Text>
    </View>
  );
}

// ---- CashFlowStat — signed amount, color-coded ----
export function CashFlowStat({ amount, size = 14, prefix = '$' }: { amount: number; size?: number; prefix?: string }) {
  const t = useTheme();
  const positive = amount >= 0;
  const color = amount === 0 ? t.textDim : positive ? t.success : t.danger;
  return (
    <Text
      style={{
        color,
        fontFamily: t.fMono,
        fontSize: size,
        fontWeight: '700',
        letterSpacing: -0.2,
        fontVariant: ['tabular-nums'],
      }}
    >
      {positive ? '+' : '−'}
      {prefix}
      {Math.abs(amount).toFixed(2)}
    </Text>
  );
}

// ---- TypeBadge — ledger entry kind ----
type LedgerType = 'buyin' | 'race_payout' | 'season_payout' | 'manual_adjust';
export function TypeBadge({ type }: { type: LedgerType }) {
  const t = useTheme();
  const map: Record<LedgerType, { label: string; fg: string }> = {
    buyin: { label: 'BUY-IN', fg: t.textDim },
    race_payout: { label: 'RACE PAYOUT', fg: t.accent },
    season_payout: { label: 'SEASON PAYOUT', fg: t.accent },
    manual_adjust: { label: 'ADJUST', fg: t.textDim },
  };
  const s = map[type] ?? map.manual_adjust;
  return (
    <View
      style={{
        height: 16,
        paddingHorizontal: 6,
        borderRadius: 3,
        borderWidth: 1,
        borderColor: t.line,
        backgroundColor: t.surface2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: s.fg,
          fontFamily: t.fMono,
          fontSize: 9,
          fontWeight: '700',
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        {s.label}
      </Text>
    </View>
  );
}

// ---- ChevronRank — biggest-haul / down-bad indicator ----
export function ChevronRank({ kind }: { kind: 'top' | 'bottom' }) {
  const t = useTheme();
  const cfg = kind === 'top' ? { color: t.success, label: 'BIGGEST HAUL', symbol: '▲' } : { color: t.danger, label: 'DOWN BAD', symbol: '▼' };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ color: cfg.color, fontSize: 10, fontWeight: '700' }}>{cfg.symbol}</Text>
      <Text
        style={{
          color: cfg.color,
          fontFamily: t.fMono,
          fontSize: 8,
          fontWeight: '700',
          letterSpacing: 1.2,
        }}
      >
        {cfg.label}
      </Text>
    </View>
  );
}

// ---- StatusBanner — full-width attention strip ----
type BannerTone = 'warn' | 'danger' | 'info';
export function StatusBanner({
  tone = 'info',
  icon,
  title,
  sub,
  cta,
  onPress,
}: {
  tone?: BannerTone;
  icon?: string;
  title: string;
  sub?: string;
  cta?: string;
  onPress?: () => void;
}) {
  const t = useTheme();
  const toneMap: Record<BannerTone, { bg: string; fg: string; border: string }> = {
    warn: { bg: '#3a2d0a', fg: '#FFC857', border: '#5a440f' },
    danger: { bg: '#2a0e0e', fg: t.danger, border: '#4a1818' },
    info: { bg: t.surface, fg: t.textDim, border: t.line },
  };
  const c = toneMap[tone];
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: c.bg,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 10,
      }}
    >
      <Text style={{ color: c.fg, fontFamily: t.fMono, fontSize: 16, fontWeight: '700' }}>{icon || '!'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.fg, fontFamily: t.fSans, fontSize: 12, fontWeight: '700', letterSpacing: 0.2 }}>{title}</Text>
        {sub ? (
          <Text style={{ color: c.fg, fontFamily: t.fMono, fontSize: 10, letterSpacing: 0.4, marginTop: 2, opacity: 0.8 }}>
            {sub}
          </Text>
        ) : null}
      </View>
      {cta ? (
        <Text
          style={{
            color: c.fg,
            fontFamily: t.fMono,
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            opacity: 0.9,
          }}
        >
          {cta} ›
        </Text>
      ) : null}
    </Pressable>
  );
}

// ---- Sparkline — small SVG-via-Polyline form chart ----
import Svg, { Polyline, Path, Rect, Circle } from 'react-native-svg';

export function Sparkline({ data, color, width = 48, height = 14 }: { data: number[]; color?: string; width?: number; height?: number }) {
  const t = useTheme();
  if (!data || data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color || t.accent} strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

// ---- InsuranceShield — toggle indicator on a driver row ----
export function InsuranceShield({ active, onPress, size = 18 }: { active?: boolean; onPress?: () => void; size?: number }) {
  const t = useTheme();
  const color = active ? t.accent : t.textMute;
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ padding: 2 }}>
      <Svg width={size} height={size} viewBox="0 0 16 16">
        <Path
          d="M8 1.5 L13.5 3.5 L13.5 8 C13.5 11 11 13.5 8 14.5 C5 13.5 2.5 11 2.5 8 L2.5 3.5 Z"
          fill={active ? color : 'none'}
          stroke={color}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {active ? (
          <Path d="M5.5 8 L7.2 9.6 L10.5 6.2" stroke="#0E1116" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
      </Svg>
    </Pressable>
  );
}

// ---- Constructor 1-2 chip ----
export function Constructor12Chip() {
  const t = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: t.accentSoft,
        borderWidth: 1,
        borderColor: t.accentDim,
      }}
    >
      <Text
        style={{
          color: t.accent,
          fontFamily: t.fMono,
          fontSize: 9,
          fontWeight: '700',
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        1-2 → 2× pts
      </Text>
    </View>
  );
}

// ---- LineupStateBadge — STARTED · Q / Q only / BENCH ----
export function LineupStateBadge({ state, scope }: { state: 'started' | 'other_only' | 'bench'; scope?: 'qualifying' | 'race' }) {
  const t = useTheme();
  if (state === 'started') {
    return (
      <View
        style={{
          paddingHorizontal: 5,
          paddingVertical: 2,
          backgroundColor: t.accent,
          borderRadius: 3,
        }}
      >
        <Text
          style={{
            color: '#0E1116',
            fontFamily: t.fMono,
            fontSize: 8,
            fontWeight: '700',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {scope === 'qualifying' ? 'Start · Q' : 'Start · R'}
        </Text>
      </View>
    );
  }
  if (state === 'other_only') {
    return (
      <View
        style={{
          paddingHorizontal: 5,
          paddingVertical: 2,
          borderWidth: 1,
          borderColor: t.line,
          borderRadius: 3,
        }}
      >
        <Text
          style={{
            color: t.textDim,
            fontFamily: t.fMono,
            fontSize: 8,
            fontWeight: '600',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {scope === 'qualifying' ? 'Q only' : 'R only'}
        </Text>
      </View>
    );
  }
  return (
    <Text
      style={{
        color: t.textMute,
        fontFamily: t.fMono,
        fontSize: 8,
        fontWeight: '500',
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}
    >
      Bench
    </Text>
  );
}

// ---- DiceGlyph + MoneyGlyph — chip icons ----
export function DiceGlyph({ size = 14, color }: { size?: number; color?: string }) {
  const t = useTheme();
  const c = color || t.accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Rect x={2} y={2} width={10} height={10} rx={1.8} stroke={c} strokeWidth={1.2} fill="none" />
      <Circle cx={4.5} cy={4.5} r={0.85} fill={c} />
      <Circle cx={9.5} cy={4.5} r={0.85} fill={c} />
      <Circle cx={7} cy={7} r={0.85} fill={c} />
      <Circle cx={4.5} cy={9.5} r={0.85} fill={c} />
      <Circle cx={9.5} cy={9.5} r={0.85} fill={c} />
    </Svg>
  );
}

export function MoneyGlyph({ size = 12, color }: { size?: number; color?: string }) {
  const t = useTheme();
  const c = color || t.accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Circle cx={7} cy={7} r={5.5} stroke={c} strokeWidth={1.2} fill="none" />
      <Path d="M7 4.2 L7 9.8" stroke={c} strokeWidth={1.2} strokeLinecap="round" />
      <Path d="M5.6 5.4 C 5.9 4.9, 6.5 4.6, 7 4.6 C 7.8 4.6, 8.4 5.1, 8.4 5.7 C 8.4 7.1, 5.6 6.3, 5.6 7.7 C 5.6 8.3, 6.2 8.8, 7 8.8 C 7.5 8.8, 8.1 8.5, 8.4 8" stroke={c} strokeWidth={1.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// ---- BankrollChip + BetsChip — compact race-header chips ----
export function BankrollChip({ cash, onPress }: { cash: number; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: t.accentSoft,
          borderWidth: 1,
          borderColor: t.accentDim,
          borderRadius: 8,
          paddingVertical: 4,
          paddingHorizontal: 8,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <MoneyGlyph size={12} />
      <Text
        style={{
          color: t.accent,
          fontFamily: t.fMono,
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 0.2,
          fontVariant: ['tabular-nums'],
        }}
      >
        ${Math.round(cash)}
      </Text>
    </Pressable>
  );
}

export function BetsChip({ placedCount, onPress }: { placedCount: number; onPress?: () => void }) {
  const t = useTheme();
  const unbet = 2 - placedCount;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundColor: placedCount > 0 ? t.accentSoft : t.surface,
          borderWidth: 1,
          borderColor: placedCount > 0 ? t.accentDim : t.line,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <DiceGlyph size={14} />
      {unbet > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 12,
            height: 12,
            paddingHorizontal: 3,
            backgroundColor: t.success,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: t.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#0E1116', fontFamily: t.fMono, fontSize: 8, fontWeight: '800' }}>{unbet}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ---- LeagueRankPill — "Box Box Boys #2 ▲2" ----
export function LeagueRankPill({
  leagueName,
  rank,
  delta,
  onPress,
}: {
  leagueName: string;
  rank: number;
  delta?: number;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: t.textMute,
          fontFamily: t.fMono,
          fontSize: 10,
          letterSpacing: 0.6,
          maxWidth: 100,
        }}
        numberOfLines={1}
      >
        {leagueName}
      </Text>
      <Text
        style={{
          color: t.text,
          fontFamily: t.fMono,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.4,
          fontVariant: ['tabular-nums'],
        }}
      >
        #{rank}
      </Text>
      {delta != null && delta !== 0 ? (
        <Text
          style={{
            color: delta > 0 ? t.success : t.danger,
            fontFamily: t.fMono,
            fontSize: 9,
            fontWeight: '700',
          }}
        >
          {delta > 0 ? '▲' : '▼'}
          {Math.abs(delta)}
        </Text>
      ) : null}
      <Text style={{ color: t.textMute, fontSize: 11 }}>›</Text>
    </Pressable>
  );
}

// ---- AddPickerBtn — small "+ ADD" pill that opens a popover ----
export function AddPickerBtn({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          height: 24,
          paddingHorizontal: 8,
          paddingLeft: 7,
          backgroundColor: t.accent,
          borderRadius: 6,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ color: '#0E1116', fontFamily: t.fMono, fontSize: 12, fontWeight: '800' }}>+</Text>
      <Text
        style={{
          color: '#0E1116',
          fontFamily: t.fMono,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        Add
      </Text>
    </Pressable>
  );
}

// ---- SectionGroup — colored dot + label + grouped rows in a card ----
type SectionTone = 'owe' | 'owed' | 'neutral';
export function SectionGroup({
  label,
  sub,
  tone = 'neutral',
  children,
}: {
  label: string;
  sub?: string;
  tone?: SectionTone;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const dotColor = tone === 'owe' ? t.danger : tone === 'owed' ? t.success : t.textMute;
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingHorizontal: 2 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor }} />
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 10,
            fontWeight: '700',
            color: t.textDim,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
        {sub ? (
          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 0.4 }}>· {sub}</Text>
        ) : null}
      </View>
      <View
        style={{
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.line,
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

// ---- FieldLabel — for forms ----
export function FieldLabel({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text
      style={{
        fontFamily: t.fMono,
        fontSize: 10,
        color: t.textMute,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        fontWeight: '700',
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
});

// ============================================
// Ben atoms — BenLinePill, WithAgainstToggle, ActiveBetDot
// Ported from design_handoff_track_limits/ben-picks.jsx
// ============================================

// Compact inline pill: [BEN] [O/U 3.5  with/against]
// Ben's predicted range, rendered as a small intentionally-tentative pill:
//   [BEN] [GUESS  P3–P5  1.91 / 1.91]
// Faded (lower opacity, dotted boundary) to signal "this is a guess, not
// a guarantee". Pass either:
//   { lo, hi }     — preferred, range-based
//   { ou }         — legacy single-value back-compat
export function BenLinePill({
  ou,
  lo,
  hi,
  oddsWith,
  oddsAgainst,
  kind = 'driver',
  dim = false,
  showTooltip = true,
}: {
  ou?: number;
  lo?: number;
  hi?: number;
  oddsWith?: number;
  oddsAgainst?: number;
  // Constructor predictions are stored as the SUM of both drivers' finishing
  // positions (range 1–44). For display we halve and label it as an average
  // per car, so users see realistic grid positions (1–22). Math/scoring
  // continues to use the sum under the hood.
  kind?: 'driver' | 'constructor';
  dim?: boolean;
  showTooltip?: boolean;
}) {
  const t = useTheme();
  const { isTablet, scale } = useDeviceLayout();
  // Resolve to a range. If only `ou` was given (legacy), fall back to ±1.
  const rawLo = lo != null ? lo : ou != null ? Math.max(1, Math.round(ou - 1)) : null;
  const rawHi = hi != null ? hi : ou != null ? Math.round(ou + 1) : null;
  const isCtor = kind === 'constructor';
  const rangeLo = rawLo != null ? (isCtor ? Math.round(rawLo / 2) : rawLo) : null;
  const rangeHi = rawHi != null ? (isCtor ? Math.round(rawHi / 2) : rawHi) : null;
  const baseLabel =
    rangeLo != null && rangeHi != null
      ? rangeLo === rangeHi
        ? `P${rangeLo}`
        : `P${rangeLo}–P${rangeHi}`
      : '—';
  const label = isCtor && baseLabel !== '—' ? `${baseLabel} avg` : baseLabel;

  const onInfo = () => {
    const detail = isCtor
      ? `Ben's model thinks this constructor's two cars finish in ${baseLabel} on average. (Internally the bet resolves on the sum of both finishing positions.)`
      : `Ben's model thinks this driver lands in ${baseLabel}.`;
    Alert.alert(
      "Ben's guess",
      `${detail} Tap WITH if you think Ben's right, AGAINST if you think they'll fall outside that range. Stake cash to amplify; free picks still score the points leaderboard.`,
    );
  };

  // Tablet sizing: pill needs presence so the user can actually read the
  // prediction range from a normal viewing distance. All sizes go through
  // scale() so the user's display-size preference takes effect too.
  const pillH = scale(isTablet ? 30 : 22);
  const fontBen = scale(isTablet ? 12 : 9);
  const fontGuess = scale(isTablet ? 11 : 9);
  const fontLabel = scale(isTablet ? 16 : 11);
  const fontOdds = scale(isTablet ? 13 : 9);
  const padBen = scale(isTablet ? 8 : 5);
  const padBody = scale(isTablet ? 10 : 6);
  const gapBody = scale(isTablet ? 6 : 4);
  // On phone, the row is tight — driver name + pill + WITH/AGAINST toggle
  // collide on a 360dp screen. Hide odds in the pill on phone; they show
  // inside the StakeSheet when the user taps the row anyway.
  const showOdds = isTablet && oddsWith != null && oddsAgainst != null;

  return (
    <Pressable
      onPress={showTooltip ? onInfo : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        height: pillH,
        borderRadius: isTablet ? 6 : 4,
        overflow: 'hidden',
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: dim ? t.line : hexA(t.accent, 0.55),
        backgroundColor: dim ? 'transparent' : hexA(t.accent, 0.08),
        opacity: 0.92,
        alignSelf: 'flex-start',
      }}
    >
      <View
        style={{
          paddingHorizontal: padBen,
          justifyContent: 'center',
          backgroundColor: dim ? 'transparent' : hexA(t.accent, 0.18),
        }}
      >
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: fontBen,
            fontWeight: '800',
            color: dim ? t.textMute : t.accent,
            letterSpacing: 0.8,
          }}
        >
          BEN
        </Text>
      </View>
      <View
        style={{
          paddingHorizontal: padBody,
          flexDirection: 'row',
          alignItems: 'center',
          gap: gapBody,
        }}
      >
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: fontGuess,
            fontWeight: '700',
            color: t.textMute,
            letterSpacing: 0.6,
          }}
        >
          GUESS
        </Text>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: fontLabel,
            fontWeight: '700',
            color: t.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {label}
        </Text>
        {showOdds ? (
          <View
            style={{
              marginLeft: 2,
              paddingLeft: isTablet ? 8 : 5,
              borderLeftWidth: 1,
              borderLeftColor: t.line,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: t.fMono,
                fontSize: fontOdds,
                fontWeight: '700',
                color: t.accent,
                fontVariant: ['tabular-nums'],
              }}
            >
              {oddsWith!.toFixed(2)}
            </Text>
            <Text style={{ fontFamily: t.fMono, fontSize: fontOdds, color: t.textMute, marginHorizontal: 2 }}>/</Text>
            <Text
              style={{
                fontFamily: t.fMono,
                fontSize: fontOdds,
                fontWeight: '700',
                color: t.danger,
                fontVariant: ['tabular-nums'],
              }}
            >
              {oddsAgainst!.toFixed(2)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// Segmented pill matching design_handoff lineup_handoff/ben-picks.jsx. One
// Pressable, two visual halves (AGAINST left, WITH right). Single tap
// anywhere flips the side — no per-half logic, no no-op states. Sage
// (#9CAF88) for AGAINST treatment, theme accent for WITH active.
export const BEN_AGAINST = '#9CAF88';
export const BEN_AGAINST_WASH = 'rgba(156, 175, 136, 0.16)';

export function WithAgainstToggle({
  side,
  onFlip,
}: {
  side: 'with' | 'against';
  onFlip: () => void;
}) {
  const t = useTheme();
  const { isTablet, scale } = useDeviceLayout();
  const against = side === 'against';

  const h = scale(isTablet ? 36 : 28);
  const halfPadH = scale(isTablet ? 14 : 10);
  const fontSize = scale(isTablet ? 13 : 10);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={against ? 'Flip to with Ben' : 'Flip to against Ben'}
      onPress={() => {
        Vibration.vibrate(against ? 8 : 30);
        onFlip();
      }}
      android_ripple={{ color: hexA(t.text, 0.08), borderless: false }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'stretch',
        height: h,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: against ? BEN_AGAINST : t.line,
        backgroundColor: t.surface,
        overflow: 'hidden',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          paddingHorizontal: halfPadH,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: against ? BEN_AGAINST : 'transparent',
        }}
      >
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize,
            fontWeight: '800',
            color: against ? '#0E1116' : t.textMute,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Against
        </Text>
      </View>
      <View
        style={{
          paddingHorizontal: halfPadH,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: against ? 'transparent' : t.accent,
        }}
      >
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize,
            fontWeight: '800',
            color: against ? t.textMute : '#0E1116',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          With
        </Text>
      </View>
    </Pressable>
  );
}

// Locked-state badge — replaces the WITH/AGAINST toggle once a session starts.
// Padlock + frozen side + (optional) stake. Sized to match WithAgainstToggle so
// it occupies the same absolute slot on the row.
export function LockedBadge({
  side,
  stake,
  variant = 'locked',
}: {
  side: 'with' | 'against';
  stake: number;
  // 'locked' = session running (padlock). 'complete' = session finished,
  // results pending (clock). Both keep the pick frozen + visible.
  variant?: 'locked' | 'complete';
}) {
  const t = useTheme();
  const { isTablet, scale } = useDeviceLayout();
  const against = side === 'against';
  const sideColor = against ? BEN_AGAINST : t.accent;
  const h = scale(isTablet ? 36 : 28);
  const fontSize = scale(isTablet ? 13 : 10);
  const iconSize = scale(isTablet ? 13 : 11);
  const hasBet = stake > 0;
  const complete = variant === 'complete';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        height: h,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: sideColor,
        backgroundColor: t.surface,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingHorizontal: scale(6), alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2, borderRightWidth: 1, borderRightColor: t.line }}>
        {complete ? (
          <Svg width={iconSize + 1} height={iconSize + 1} viewBox="0 0 12 12">
            <Circle cx={6} cy={6} r={4.6} stroke={t.textMute} strokeWidth={1.1} fill="none" />
            <Path d="M6 3.4V6L7.8 7.2" stroke={t.textMute} strokeWidth={1.1} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : (
          <Svg width={iconSize} height={iconSize + 1} viewBox="0 0 9 11">
            <Rect x={1} y={5} width={7} height={6} rx={1} fill={t.textMute} />
            <Path d="M2.5 5V3.2a2 2 0 014 0V5" stroke={t.textMute} strokeWidth={1.1} fill="none" />
          </Svg>
        )}
      </View>
      <View style={{ paddingHorizontal: scale(8), alignItems: 'center', justifyContent: 'center', backgroundColor: sideColor }}>
        <Text style={{ fontFamily: t.fMono, fontSize, fontWeight: '800', color: '#0E1116', letterSpacing: 0.8, textTransform: 'uppercase' }}>
          {against ? 'Against' : 'With'}
        </Text>
      </View>
      {hasBet ? (
        <View style={{ paddingHorizontal: scale(7), alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: t.line }}>
          <Text style={{ fontFamily: t.fMono, fontSize, fontWeight: '800', color: t.text, letterSpacing: 0.2, fontVariant: ['tabular-nums'] }}>
            ${stake}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// Result badge — shown in the row's right slot once a session is settled.
// Green "+$X" on a winning pick, coral "MISS" on a loss.
export function ResultBadge({ won, payout }: { won: boolean; payout: number }) {
  const t = useTheme();
  const { isTablet, scale } = useDeviceLayout();
  const color = won ? t.success : '#FFB3AC';
  const border = won ? t.success : 'rgba(242,92,84,0.55)';
  const bg = won ? '#0d2418' : 'rgba(242,92,84,0.12)';
  const h = scale(isTablet ? 36 : 28);
  const fontSize = scale(isTablet ? 13 : 11);
  const label = won ? (payout > 0 ? `+$${payout.toFixed(payout < 10 ? 1 : 0)}` : 'WON') : 'MISS';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        height: h,
        paddingHorizontal: scale(10),
        borderRadius: 6,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontFamily: t.fMono, fontSize, fontWeight: '800', color, letterSpacing: 0.6, textTransform: 'uppercase', fontVariant: ['tabular-nums'] }}>
        {label}
      </Text>
    </View>
  );
}

// Phase banner — sits under the scope toggle to signal session state.
// Returns null when the session is still open. Amber=locked (running),
// cornflower=complete (finished, results pending), green=results (settled).
export function PhaseBanner({ scope, phase }: { scope: SessionKey; phase: 'open' | 'locked' | 'complete' | 'results' }) {
  const t = useTheme();
  if (phase === 'open') return null;
  const sessionLabel = scope === 'qualifying' ? 'Quali' : scope === 'sprint' ? 'Sprint' : 'Race';

  const cfg = {
    locked: {
      color: t.warn,
      bg: 'rgba(224,164,88,0.10)',
      border: 'rgba(224,164,88,0.4)',
      title: `${sessionLabel} locked`,
      body: 'Picks frozen. Results land when the session ends.',
    },
    complete: {
      color: t.accent,
      bg: hexA(t.accent, 0.1),
      border: hexA(t.accent, 0.4),
      title: `${sessionLabel} complete`,
      body: 'Results pending — scores post once the session is graded.',
    },
    results: {
      color: t.success,
      bg: 'rgba(123,211,137,0.10)',
      border: 'rgba(123,211,137,0.4)',
      title: `${sessionLabel} settled`,
      body: 'Cards show your result. Unlocks for next round soon.',
    },
  }[phase];

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: cfg.bg,
        borderWidth: 1,
        borderColor: cfg.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: cfg.color, alignItems: 'center', justifyContent: 'center' }}>
        {phase === 'locked' ? (
          <Svg width={12} height={13} viewBox="0 0 9 11">
            <Rect x={1} y={5} width={7} height={6} rx={1} fill="#0E1116" />
            <Path d="M2.5 5V3.2a2 2 0 014 0V5" stroke="#0E1116" strokeWidth={1.1} fill="none" />
          </Svg>
        ) : phase === 'complete' ? (
          <Svg width={13} height={13} viewBox="0 0 12 12">
            <Circle cx={6} cy={6} r={4.6} stroke="#0E1116" strokeWidth={1.2} fill="none" />
            <Path d="M6 3.3V6L8 7.2" stroke="#0E1116" strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : (
          <Svg width={12} height={12} viewBox="0 0 12 12">
            <Path d="M2.5 6.5L5 9L9.5 3.5" stroke="#0E1116" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: t.fMono, fontSize: 10, fontWeight: '800', color: cfg.color, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          {cfg.title}
        </Text>
        <Text style={{ fontFamily: t.fSans, fontSize: 12, color: t.text, marginTop: 2, letterSpacing: -0.1 }}>
          {cfg.body}
        </Text>
      </View>
    </View>
  );
}

// Glowing $-chip shown next to a name when stake > 0. Green when WITH, red
// when AGAINST. Includes a small filled dot for emphasis.
export function ActiveBetDot({ amount, against }: { amount: number; against: boolean }) {
  const t = useTheme();
  const color = against ? t.danger : t.success;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        height: 16,
        paddingHorizontal: 5,
        borderRadius: 8,
        backgroundColor: hexA(color, 0.14),
        borderWidth: 1,
        borderColor: color,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text
        style={{
          fontFamily: t.fMono,
          fontSize: 9,
          fontWeight: '800',
          color,
          letterSpacing: 0.4,
        }}
      >
        ${amount}
      </Text>
    </View>
  );
}
