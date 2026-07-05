import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONT_FAMILY, S_DISPLAY_SKEW, teamAccent, shadeHex } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { demoDrivers } from '../../data/demoData';

// ── Racing numbers ────────────────────────────────────────────────────────────
const DRIVER_NUMBERS: Record<string, number> = Object.fromEntries(
  demoDrivers.map((d) => [d.id, d.number])
);

export function driverNumber(driverId: string): number | null {
  return DRIVER_NUMBERS[driverId] ?? null;
}

// 3-letter constructor codes for the Race Day tiles
const CONSTRUCTOR_CODES: Record<string, string> = {
  mclaren: 'MCL',
  ferrari: 'FER',
  mercedes: 'MER',
  red_bull: 'RED',
  williams: 'WIL',
  haas: 'HAA',
  aston_martin: 'AMR',
  alpine: 'ALP',
  rb: 'RB',
  racing_bulls: 'RB',
  audi: 'AUD',
  cadillac: 'CAD',
};

export function constructorCode(constructorId: string): string {
  return CONSTRUCTOR_CODES[constructorId] ?? constructorId.slice(0, 3).toUpperCase();
}

// Short display names — roster cards use these so they never truncate.
// The Market list keeps full official names.
const CONSTRUCTOR_SHORT_NAMES: Record<string, string> = {
  mclaren: 'McLaren',
  ferrari: 'Ferrari',
  mercedes: 'Mercedes',
  red_bull: 'Red Bull',
  williams: 'Williams',
  haas: 'Haas',
  aston_martin: 'Aston Martin',
  alpine: 'Alpine',
  rb: 'RB',
  racing_bulls: 'RB',
  audi: 'Audi',
  cadillac: 'Cadillac',
};

export function constructorShortName(constructorId: string, fallback?: string): string {
  return CONSTRUCTOR_SHORT_NAMES[constructorId] ?? fallback ?? constructorId;
}

// ── Driver tile — timing-tower style: team-color gradient, racing number ─────
interface DriverTileProps {
  driverId: string;
  shortName: string;
  constructorId: string;
  isAce?: boolean;
  size?: number;
}

export function DriverTile({ driverId, shortName, constructorId, isAce, size = 40 }: DriverTileProps) {
  const { colors, scaled } = useSimpleTheme();
  const accent = teamAccent(constructorId);
  const num = driverNumber(driverId);
  const s = scaled(size);

  return (
    <View style={{ width: s, height: s }}>
      <LinearGradient
        colors={[accent, shadeHex(accent, -34)]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{
          width: s,
          height: s,
          borderRadius: S_RADIUS.md,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.14)',
        }}
      >
        <Text
          style={{
            fontFamily: S_FONT_FAMILY.display.bold,
            fontSize: scaled(17),
            lineHeight: scaled(18),
            letterSpacing: -0.5,
            color: '#FFFFFF',
            transform: S_DISPLAY_SKEW as unknown as { skewX: string }[],
            textShadowColor: 'rgba(0,0,0,0.25)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 2,
          }}
        >
          {num ?? '–'}
        </Text>
        <Text
          style={{
            fontFamily: S_FONT_FAMILY.body.bold,
            fontSize: scaled(7.5),
            letterSpacing: 1.2,
            color: 'rgba(255,255,255,0.85)',
            marginTop: 2,
          }}
        >
          {shortName}
        </Text>
      </LinearGradient>
      {isAce && (
        <View
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.ace,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.card,
          }}
        >
          <Ionicons name="star" size={9} color={colors.text.inverse === '#FFFFFF' ? '#1F1E1B' : '#FFFFFF'} />
        </View>
      )}
    </View>
  );
}

// ── Constructor tile — 3-letter code on the same gradient ───────────────────
interface ConstructorTileProps {
  constructorId: string;
  size?: number;
}

export function ConstructorTile({ constructorId, size = 40 }: ConstructorTileProps) {
  const { scaled } = useSimpleTheme();
  const accent = teamAccent(constructorId);
  const s = scaled(size);

  return (
    <LinearGradient
      colors={[accent, shadeHex(accent, -34)]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{
        width: s,
        height: s,
        borderRadius: S_RADIUS.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
      }}
    >
      <Text
        style={{
          fontFamily: S_FONT_FAMILY.display.bold,
          fontSize: scaled(14),
          letterSpacing: 0.5,
          color: '#FFFFFF',
          transform: S_DISPLAY_SKEW as unknown as { skewX: string }[],
          textShadowColor: 'rgba(0,0,0,0.25)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 2,
        }}
      >
        {constructorCode(constructorId)}
      </Text>
    </LinearGradient>
  );
}

// ── Section label — uppercase micro-type with the red /// chevrons ───────────
interface SectionLabelProps {
  children: React.ReactNode;
  accessory?: React.ReactNode;
  style?: object;
}

export function SectionLabel({ children, accessory, style }: SectionLabelProps) {
  const { colors, scaled } = useSimpleTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 14,
          marginBottom: 2,
          marginHorizontal: 16,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text
          style={{
            color: colors.primary,
            fontFamily: S_FONT_FAMILY.body.bold,
            fontSize: scaled(11.5),
            letterSpacing: -1,
          }}
        >
          {'///'}
        </Text>
        <Text
          style={{
            fontFamily: S_FONT_FAMILY.body.bold,
            fontSize: scaled(11.5),
            color: colors.text.muted,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
          }}
        >
          {children}
        </Text>
      </View>
      {accessory}
    </View>
  );
}

// ── Speed-line texture — faint diagonal stripes over the stat bar ────────────
// (repeating-linear-gradient equivalent, built from skewed hairline views)
export function SpeedLines() {
  const { colors } = useSimpleTheme();
  const lines = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <View
          style={{
            flexDirection: 'row',
            position: 'absolute',
            left: -80,
            top: -40,
            bottom: -40,
            transform: [{ rotate: '25deg' }],
          }}
        >
          {lines.map((i) => (
            <View
              key={i}
              style={{
                width: 2,
                marginLeft: 26,
                backgroundColor: colors.speedLine,
                height: 300,
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
