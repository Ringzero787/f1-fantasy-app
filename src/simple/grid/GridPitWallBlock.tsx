/**
 * What the Pit Wall Pass bought, on the driver you are looking at (F-084).
 *
 * The app already downloads this with every projection; until now it kept six numbers and showed
 * one. The portal has a three-tab slide-over for the same data, and this is deliberately not that:
 * it is a block inside the sheet the player already opened, so the analysis arrives where they are
 * rather than behind another navigation step.
 *
 * Nothing here decides who may see it. The caller renders it only for a pass holder, and the shaping
 * in `driverDetail` leaves out anything the worker did not publish, so an empty figure never
 * becomes a zero on screen.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { MonoLabel } from './GridBits';
import { driverDetail, hasDetail } from '../../pitwall/driverDetail';
import type { Projection } from '../../pitwall/projections';

export function GridPitWallBlock({ projection, rounds, round }: { projection: Projection | null; rounds: string[]; round: number }) {
  const { colors, family, scaled, mono } = useSimpleTheme();
  const d = driverDetail(projection, rounds);
  if (!hasDetail(d) || !d) return null;

  const head = (text: string) => <MonoLabel size={10} style={{ letterSpacing: scaled(10) * 0.14 }}>{text}</MonoLabel>;

  const cell = (label: string, value: string, note?: string) => (
    <View key={label} style={{ gap: 3, minWidth: scaled(72) }}>
      {head(label)}
      <Text style={{ fontFamily: family.ui.black, fontSize: scaled(17), lineHeight: scaled(19), letterSpacing: -scaled(17) * 0.03, color: colors.text.primary }}>{value}</Text>
      {note ? <Text style={[mono(9), { color: colors.text.muted }]}>{note}</Text> : null}
    </View>
  );

  return (
    <View
      style={{ gap: 14, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.primary }}
      accessibilityLabel={`Pit Wall analysis${round ? ` for round ${round}` : ''}`}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <MonoLabel color={colors.primary}>PIT WALL</MonoLabel>
        {round ? <MonoLabel size={10} color={colors.text.muted}>{`RD ${round}`}</MonoLabel> : null}
      </View>

      {d.range ? (
        <View style={{ gap: 7 }}>
          {head('PROJECTED POINTS')}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <Text style={{ fontFamily: family.ui.black, fontSize: scaled(34), lineHeight: scaled(34), letterSpacing: -scaled(34) * 0.05, color: colors.text.primary }}>{Math.round(d.range.med)}</Text>
            <Text style={[mono(10), { color: colors.text.muted, paddingBottom: scaled(5) }]}>{`${Math.round(d.range.floor)} TO ${Math.round(d.range.ceil)}`}</Text>
          </View>
          {/* The bar is the honest part: a median with no spread behind it reads as a promise. */}
          <View
            accessibilityLabel={`Floor ${Math.round(d.range.floor)}, median ${Math.round(d.range.med)}, ceiling ${Math.round(d.range.ceil)}`}
            style={{ height: scaled(6), borderRadius: 3, backgroundColor: colors.borderLight, justifyContent: 'center' }}
          >
            <View style={{ position: 'absolute', left: `${d.range.at * 100}%`, width: scaled(3), height: scaled(12), borderRadius: 2, backgroundColor: colors.primary, marginLeft: -scaled(1.5) }} />
          </View>
          <Text style={[mono(9), { color: colors.text.muted }]}>MIDDLE 70% OF THE SIMULATION</Text>
        </View>
      ) : null}

      {d.chances.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 10 }}>
          {d.chances.map((c) => cell(c.label, c.value, c.note))}
        </View>
      ) : null}

      {d.money.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderLight }}>
          {d.money.map((m) => cell(m.label, m.value, m.note))}
        </View>
      ) : null}

      {d.fit.length ? (
        <View style={{ gap: 7, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderLight }}>
          {head('CIRCUIT FIT · NEXT ROUNDS')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 8 }}>
            {d.fit.map((f) => (
              <View key={f.round} style={{ gap: 3, alignItems: 'flex-start' }}>
                <Text style={[mono(9), { color: colors.text.muted }]} numberOfLines={1}>{f.round.toUpperCase()}</Text>
                <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={`${f.round}: ${f.score} out of 5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <View key={n} style={{ width: scaled(5), height: scaled(5), borderRadius: 1, backgroundColor: n <= f.score ? colors.primary : colors.borderStrong }} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {d.splits.length ? (
        <View style={{ gap: 7, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderLight }}>
          {head('AVERAGE BY CIRCUIT')}
          {d.splits.map((s) => (
            <View key={s.cls} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <Text style={[mono(10), { color: colors.text.muted, flexShrink: 1 }]} numberOfLines={1}>{s.label.toUpperCase()}</Text>
              <Text style={mono(12)}>{`${Math.round(s.avg)} · ${s.n} RD`}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {d.mix.length ? (
        <View style={{ gap: 7, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderLight }}>
          {head('WHERE THE POINTS CAME FROM')}
          <View style={{ flexDirection: 'row', height: scaled(6), borderRadius: 3, overflow: 'hidden', gap: 2 }}>
            {d.mix.map((m, i) => (
              <View key={m.label} style={{ flex: m.pct, backgroundColor: i === 0 ? colors.primary : colors.borderStrong }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
            {d.mix.map((m) => <Text key={m.label} style={[mono(9), { color: colors.text.muted }]}>{`${m.label} ${m.pct}%`}</Text>)}
          </View>
        </View>
      ) : null}
    </View>
  );
}
