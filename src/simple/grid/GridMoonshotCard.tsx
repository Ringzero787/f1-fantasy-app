import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { MonoLabel } from './GridBits';
import { callOpen, chancePct, copyText, currencyWord, multiplierLabel, outcomeLine, predictionLabel, settledLine, type MoonshotCall, type MoonshotClientConfig } from './moonshot';

/**
 * This race's Moonshot on the Team screen (F-108): driver, prediction, chance, risk, reward in one
 * red-bordered card. Before lock it opens the sheet (where Cancel lives); after lock the controls
 * are gone and the card just says so — the server refuses either way, this only hides them.
 */
export function GridMoonshotCard({ call, cfg, driverName, onOpen, style }: {
  call: MoonshotCall;
  cfg: MoonshotClientConfig;
  driverName: string;
  onOpen: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, family, scaled, mono } = useSimpleTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);
  const open = callOpen(call, now);
  const settled = call.result != null;
  const tone = settled ? (call.result === 'HIT' ? colors.positive : call.result === 'VOID' ? colors.text.muted : colors.primary) : colors.primary;
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${copyText(cfg, 'yourMoonshot')}, ${driverName}, ${predictionLabel(call.predictionType, call.predictionTarget)}`}
      style={({ pressed }) => [{ borderWidth: 1, borderColor: tone, borderRadius: 14, paddingVertical: scaled(12), paddingHorizontal: scaled(14), gap: 6, opacity: pressed ? 0.75 : 1 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ borderRadius: 999, backgroundColor: tone, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontFamily: family.mono.bold, fontSize: scaled(10), letterSpacing: scaled(10) * 0.12, color: '#F2F2F2' }}>🚀 {copyText(cfg, 'yourMoonshot')}</Text>
        </View>
        <MonoLabel color={colors.text.muted}>{settled ? '' : open ? copyText(cfg, 'locksAt') : 'LOCKED'}</MonoLabel>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: family.ui.black, fontSize: scaled(14), letterSpacing: scaled(14) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>
        {driverName} — {predictionLabel(call.predictionType, call.predictionTarget)} · {chancePct(call.modelProbability)} · {call.rewardBand} {multiplierLabel(call.multiplier)}
      </Text>
      <Text style={[mono(11, 'medium'), { color: settled ? tone : colors.text.secondary }]}>
        {settled ? settledLine(call, driverName, cfg) : `${call.stakeAmount.toLocaleString()} ${currencyWord(call.stakeCurrency)} ${copyText(cfg, 'atRisk')} · ${outcomeLine(call.stakeAmount, call.potentialReward, cfg)}`}
      </Text>
      {!settled ? <MonoLabel size={10} color={colors.text.muted}>{open ? `TAP TO VIEW OR ${copyText(cfg, 'cancelCall')}` : copyText(cfg, 'lockedCall')}</MonoLabel> : null}
    </Pressable>
  );
}
