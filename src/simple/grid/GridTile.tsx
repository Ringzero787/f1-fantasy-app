import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { teamAccent } from '../theme/simpleTheme';
import { MonoLabel, ColorBar } from './GridBits';
import type { GridTile as Tile } from './tileState';

export const TILE_HEIGHT = 132;

interface Props {
  tile: Tile;
  locked: boolean;
  aceLocked: boolean;
  readOnly?: boolean;
  onOpenSlot?: (slot: 'driver' | 'constructor') => void;
  onToggleAce?: (tile: Tile) => void;
}

// One cell of the Team grid: driver, constructor (red outline) or open slot.
export const GridTile = React.memo(function GridTile({ tile, locked, aceLocked, readOnly, onOpenSlot, onToggleAce }: Props) {
  const { colors, family, scaled, mono } = useSimpleTheme();
  const height = scaled(TILE_HEIGHT);
  const pad = scaled(14);

  if (tile.kind === 'empty') {
    const disabled = locked || readOnly;
    return (
      <Pressable
        onPress={disabled ? undefined : () => onOpenSlot?.(tile.slot)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={tile.slot === 'driver' ? 'Add driver' : 'Add constructor'}
        style={({ pressed }) => ({
          height,
          borderRadius: 18,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.borderStrong,
          padding: pad,
          paddingBottom: scaled(12),
          justifyContent: 'space-between',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <MonoLabel color={colors.text.muted} style={{ letterSpacing: scaled(11) * 0.14 }}>
          {tile.slot === 'driver' ? 'DRIVER' : 'TEAM'}
        </MonoLabel>
        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: family.ui.black, fontSize: scaled(22), lineHeight: scaled(22), color: disabled ? colors.text.muted : colors.primary }}>+</Text>
          <Text style={{ fontFamily: family.ui.black, fontSize: scaled(11), lineHeight: scaled(13), letterSpacing: scaled(11) * 0.06, textTransform: 'uppercase', color: colors.text.muted }}>
            {tile.slot === 'driver' ? 'Add driver' : 'Add constructor'}
          </Text>
        </View>
      </Pressable>
    );
  }

  const isCtor = tile.kind === 'constructor';
  const accent = teamAccent(tile.constructorId);
  const trendColor = tile.trend.trend === 'up' ? colors.positive : tile.trend.trend === 'down' ? colors.primary : colors.text.muted;
  const dotColor = (d: 'on' | 'off' | 'last') => d === 'on' ? colors.text.primary : d === 'last' ? colors.primary : colors.borderStrong;
  const canAce = !readOnly && !aceLocked && !!onToggleAce;

  return (
    <View
      style={{
        height,
        borderRadius: 18,
        backgroundColor: isCtor ? colors.surface : colors.card,
        borderWidth: 1,
        borderColor: isCtor ? colors.primary : colors.card,
        padding: pad,
        paddingBottom: scaled(12),
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
      accessibilityLabel={`${tile.name}, ${tile.pts} points`}
    >
      {/* top row: number / TEAM · AUTO · ACE — season pts */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <MonoLabel color={isCtor ? colors.primary : colors.text.muted} style={{ letterSpacing: scaled(11) * 0.14 }}>
            {isCtor ? 'TEAM' : tile.tag}
          </MonoLabel>
          {tile.auto ? <Pill label="AUTO" fg={colors.primary} bg="transparent" border={colors.primary} /> : null}
          {tile.ace || canAce ? (
            <Pressable
              onPress={canAce ? () => onToggleAce?.(tile) : undefined}
              disabled={!canAce}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={tile.ace ? 'Ace, tap to clear' : 'Set as ace'}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              {tile.ace
                ? <Pill label="ACE" fg="#F2F2F2" bg={colors.primary} border={colors.primary} />
                : <Pill label="ACE" fg={colors.borderStrong} bg="transparent" border={colors.borderStrong} />}
            </Pressable>
          ) : null}
        </View>
        <Text style={mono(13)}>{tile.pts}</Text>
      </View>

      {/* bottom: name · colour bar + dots · trend */}
      <View style={{ gap: 6 }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
          style={{
            fontFamily: family.ui.black,
            fontSize: scaled(tile.nameSize),
            lineHeight: scaled(tile.nameSize),
            letterSpacing: -scaled(tile.nameSize) * 0.04,
            textTransform: 'uppercase',
            color: colors.text.primary,
          }}
        >
          {tile.name}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ColorBar color={accent} width={scaled(28)} />
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {tile.dots.dots.map((d, i) => (
                <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dotColor(d) }} />
              ))}
            </View>
          </View>
          <Text style={[mono(11), { color: trendColor }]} numberOfLines={1}>
            {tile.trend.glyph} {tile.trend.last ?? '–'}
          </Text>
        </View>
      </View>
    </View>
  );
});

function Pill({ label, fg, bg, border }: { label: string; fg: string; bg: string; border: string }) {
  const { family, scaled } = useSimpleTheme();
  const fontSize = scaled(9);
  return (
    <View style={{ borderRadius: 999, borderWidth: 1, borderColor: border, backgroundColor: bg, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontFamily: family.mono.bold, fontSize, letterSpacing: fontSize * 0.12, lineHeight: fontSize + 2, color: fg }}>{label}</Text>
    </View>
  );
}
