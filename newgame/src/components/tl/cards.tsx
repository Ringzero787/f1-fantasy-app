// Reusable card patterns from the design handoff: DriverPortrait, ConstructorPortrait,
// RaceHeader, BagSplit, ActionTile.

import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { CONSTRUCTOR_COLORS } from '@/theme/tokens';
import type { Driver, Constructor, Race } from '@/types';

export function DriverPortrait({ driver, size = 56, started = false }: { driver: Driver; size?: number; started?: boolean }) {
  const t = useTheme();
  const teamShort = (driver.constructorName || '').slice(0, 3).toUpperCase();
  const color = (CONSTRUCTOR_COLORS as Record<string, string>)[teamShort] || t.accent;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        backgroundColor: t.surface2,
        borderWidth: 1,
        borderColor: t.line,
        overflow: 'hidden',
      }}
    >
      {/* team stripe */}
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: color }} />
      {/* faded number */}
      <Text
        style={{
          position: 'absolute',
          right: -4,
          bottom: -8,
          fontFamily: t.fDisp,
          fontWeight: '800',
          fontSize: size * 0.85,
          color,
          opacity: started ? 0.35 : 0.2,
          letterSpacing: -2,
        }}
      >
        {driver.number}
      </Text>
      {/* short code */}
      <Text
        style={{
          position: 'absolute',
          top: 6,
          left: 9,
          fontFamily: t.fMono,
          fontSize: 10,
          fontWeight: '700',
          color: t.text,
          letterSpacing: 0.8,
        }}
      >
        {driver.shortName}
      </Text>
    </View>
  );
}

export function ConstructorPortrait({ constructor, size = 56 }: { constructor: Constructor; size?: number }) {
  const t = useTheme();
  const color = (CONSTRUCTOR_COLORS as Record<string, string>)[constructor.shortName] || constructor.primaryColor || t.accent;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        backgroundColor: t.surface2,
        borderWidth: 1,
        borderColor: t.line,
        overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 12, backgroundColor: color }} />
      <Text
        style={{
          position: 'absolute',
          top: 8,
          right: 10,
          left: 20,
          fontFamily: t.fMono,
          fontSize: 10,
          fontWeight: '700',
          color: t.text,
          letterSpacing: 1.2,
        }}
      >
        {constructor.shortName}
      </Text>
      <Text
        style={{
          position: 'absolute',
          bottom: 6,
          right: 8,
          fontFamily: t.fDisp,
          fontWeight: '700',
          fontSize: 11,
          color: t.textDim,
          opacity: 0.7,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        TEAM
      </Text>
    </View>
  );
}

// RaceHeader — Round NN · Country / display title / circuit name + optional rank chip
export function RaceHeader({ race }: { race: Race | null | undefined }) {
  const t = useTheme();
  if (!race) {
    return (
      <View style={{ padding: 20 }}>
        <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          No upcoming race
        </Text>
      </View>
    );
  }
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 10,
            fontWeight: '500',
            color: t.textMute,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          Round {String(race.round).padStart(2, '0')}
        </Text>
        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: t.textMute }} />
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 10,
            fontWeight: '500',
            color: t.textMute,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {race.country}
        </Text>
      </View>
      <Text
        style={{
          marginTop: 4,
          fontFamily: t.fDisp,
          fontWeight: '600',
          fontSize: 22,
          letterSpacing: -0.6,
          color: t.text,
        }}
      >
        {race.name}
      </Text>
      <Text style={{ fontFamily: t.fSans, fontSize: 12, color: t.textDim, marginTop: 2 }}>{race.circuitName}</Text>
    </View>
  );
}

// BagSplit — owed/owing tile pair
export function BagSplit({ label, amount, positive, currency = '$' }: { label: string; amount: number; positive: boolean; currency?: string }) {
  const t = useTheme();
  const color = amount === 0 ? t.textMute : positive ? t.success : t.danger;
  return (
    <View
      style={{
        flex: 1,
        padding: 12,
        borderRadius: 8,
        backgroundColor: t.surface2,
        borderWidth: 1,
        borderColor: t.lineSoft,
      }}
    >
      <Text
        style={{
          fontFamily: t.fMono,
          fontSize: 9,
          color: t.textMute,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontFamily: t.fMono,
          fontSize: 18,
          fontWeight: '700',
          color,
          letterSpacing: -0.3,
          fontVariant: ['tabular-nums'],
        }}
      >
        {positive ? '+' : '−'}
        {currency}
        {amount.toFixed(2)}
      </Text>
    </View>
  );
}

// ActionTile — used in the bag-of-cash 2x2 action grid
export function ActionTile({
  label,
  sub,
  primary,
  badge,
  onPress,
  style,
}: {
  label: string;
  sub: string;
  primary?: boolean;
  badge?: number | null;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          padding: 14,
          minHeight: 72,
          backgroundColor: primary ? t.accentSoft : t.surface,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {badge != null && badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 5,
            borderRadius: 9,
            backgroundColor: t.danger,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontFamily: t.fMono, fontSize: 10, fontWeight: '700' }}>{badge}</Text>
        </View>
      ) : null}
      <Text style={{ fontFamily: t.fSans, fontSize: 14, fontWeight: '600', color: primary ? t.accent : t.text, letterSpacing: -0.1 }}>
        {label}
      </Text>
      <Text style={{ marginTop: 4, fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 0.4 }}>{sub}</Text>
    </Pressable>
  );
}
