import React from 'react';
import { View, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { MonoLabel } from './GridBits';
import { chancePct, copyText, currencyWord, liveChip, liveState, multiplierLabel, predictionLabel, settledLine, signed, statusLabel, type BoardCall, type MoonshotCall, type MoonshotClientConfig } from './moonshot';

/**
 * Race day (F-108, SPEC §17): "🚀 YOUR MOONSHOT" with the driver's current position from the live
 * feed and a state chip — IN / OUT / ONE POSITION AWAY / PENDING — then the settled line once the
 * race is scored. Below it, the league-mates' locked Moonshots in a row, so there is something
 * specific to watch for everyone at the table.
 */
export function GridMoonshotLive({ call, board, positions, cfg, driverName, nameOf, updatedAt, onOpen, style }: {
  call: MoonshotCall | null;
  board: BoardCall[];
  positions: Map<string, number>;
  cfg: MoonshotClientConfig;
  driverName: (driverId: string) => string;
  /** a league-mate's display name, from the member list */
  nameOf: (userId: string) => string;
  updatedAt: number | null;
  onOpen?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, family, scaled, mono } = useSimpleTheme();
  const chipTone = (s: ReturnType<typeof liveState>) => (s === 'IN' ? colors.positive : s === 'OUT' ? colors.primary : s === 'CLOSE' ? colors.warning : colors.text.muted);
  const rivals = board.filter((b) => !call || b.id !== call.id);
  if (!call && rivals.length === 0) return null;

  const mine = call ? (() => {
    const pos = positions.get(call.driverId) ?? null;
    const settled = call.result != null;
    const state = liveState(call, pos);
    const tone = settled ? (call.result === 'HIT' ? colors.positive : call.result === 'VOID' ? colors.text.muted : colors.primary) : chipTone(state);
    return (
      <Pressable onPress={onOpen} disabled={!onOpen} accessibilityRole="button" accessibilityLabel={`${copyText(cfg, 'yourMoonshot')}, ${driverName(call.driverId)}, ${settled ? call.result : liveChip(state, cfg)}`}
        style={{ borderWidth: 1, borderColor: tone, borderRadius: 14, paddingVertical: scaled(12), paddingHorizontal: scaled(14), gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ borderRadius: 999, backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontFamily: family.mono.bold, fontSize: scaled(10), letterSpacing: scaled(10) * 0.12, color: '#F2F2F2' }}>🚀 {copyText(cfg, 'yourMoonshot')}</Text>
          </View>
          <View style={{ borderRadius: 999, borderWidth: 1, borderColor: tone, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontFamily: family.mono.bold, fontSize: scaled(10), letterSpacing: scaled(10) * 0.12, color: tone }}>{settled ? statusLabel(call.result as 'HIT' | 'MISSED' | 'VOID', cfg) : liveChip(state, cfg)}</Text>
          </View>
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: family.ui.black, fontSize: scaled(16), letterSpacing: scaled(16) * 0.02, textTransform: 'uppercase', color: colors.text.primary }}>
          {driverName(call.driverId)} · {predictionLabel(call.predictionType, call.predictionTarget)}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={[mono(11, 'medium'), { color: colors.text.secondary }]}>
            {settled ? settledLine(call, driverName(call.driverId), cfg) : `CURRENT POSITION ${pos ? `P${pos}` : '—'} · ${call.stakeAmount.toLocaleString()} ${currencyWord(call.stakeCurrency)} ${copyText(cfg, 'atRisk')} · ${copyText(cfg, 'reward')} ${signed(call.potentialReward)}`}
          </Text>
        </View>
        {!settled ? <MonoLabel size={10} color={colors.text.muted}>{updatedAt ? `LIVE · UPDATED ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'WAITING FOR LIVE TIMING'}</MonoLabel> : null}
      </Pressable>
    );
  })() : null;

  return (
    <View style={[{ gap: 10 }, style]}>
      {mine}
      {rivals.length > 0 ? (
        <View style={{ gap: 8 }}>
          <MonoLabel color={colors.text.muted}>LEAGUE MOONSHOTS · {rivals.length}</MonoLabel>
          {rivals.map((b) => {
            const pos = positions.get(b.driverId) ?? null;
            const settled = b.result != null;
            const state = liveState(b, pos);
            const tone = settled ? (b.result === 'HIT' ? colors.positive : b.result === 'VOID' ? colors.text.muted : colors.primary) : chipTone(state);
            return (
              <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={1} style={{ fontFamily: family.ui.black, fontSize: scaled(12), letterSpacing: scaled(12) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>
                    {(b.displayName ?? nameOf(b.userId)).toUpperCase()} · {driverName(b.driverId)} — {predictionLabel(b.predictionType, b.predictionTarget)}
                  </Text>
                  <Text style={[mono(10, 'medium'), { color: colors.text.muted }]}>
                    {b.stakeAmount.toLocaleString()} {currencyWord(b.stakeCurrency)} · {chancePct(b.modelProbability)} · {multiplierLabel(b.multiplier)} · {copyText(cfg, 'hit')} {signed(b.potentialReward)}{pos ? ` · P${pos}` : ''}
                  </Text>
                </View>
                <Text style={[mono(10), { color: tone }]}>{settled ? statusLabel(b.result as 'HIT' | 'MISSED' | 'VOID', cfg) : liveChip(state, cfg)}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
