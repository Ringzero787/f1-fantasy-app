import React, { useState } from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { MonoLabel, PillButton } from './GridBits';
import { copyText, type MoonshotClientConfig } from './moonshot';

/**
 * The first-time coach marks (F-108, SPEC §20): four short cards the first time Moonshots are
 * available, shown once per account and re-openable from the sheet's info icon. Copy is the
 * server's when it provides it. A plain stepped card rather than spotlight cut-outs: the Grid UI
 * has no overlay system, and the four messages stand on their own.
 */
export function GridMoonshotCoach({ visible, cfg, tokens, onDone }: { visible: boolean; cfg: MoonshotClientConfig; tokens: number; onDone: () => void }) {
  const { colors, family, spacing, scaled, mono } = useSimpleTheme();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  if (!visible) return null;
  const steps: Array<{ glyph: string; title: string; body: string }> = [
    { glyph: '🚀', title: copyText(cfg, 'tutorial1Title'), body: copyText(cfg, 'tutorial1Body') },
    { glyph: '🎯', title: copyText(cfg, 'tutorial2Title'), body: copyText(cfg, 'tutorial2Body') },
    { glyph: '⚖️', title: copyText(cfg, 'tutorial3Title'), body: copyText(cfg, 'tutorial3Body') },
    { glyph: tokens >= 1 && tokens <= 9 ? `${tokens}\uFE0F\u20E3` : '🎟️', title: copyText(cfg, 'tutorial4Title', { n: tokens }), body: copyText(cfg, 'tutorial4Body') },
  ];
  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;
  const finish = () => { setI(0); onDone(); };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }} onPress={finish} accessibilityLabel="Close">
        <Pressable onPress={() => {}} accessible={false} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, paddingBottom: Math.max(insets.bottom, 12) + 22, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <MonoLabel color={colors.primary}>🚀 {copyText(cfg, 'tabTitle')} · {i + 1} OF {steps.length}</MonoLabel>
            <Pressable onPress={finish} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip"><MonoLabel color={colors.text.muted}>SKIP</MonoLabel></Pressable>
          </View>
          <Text style={{ fontSize: scaled(40), lineHeight: scaled(46) }}>{step.glyph}</Text>
          <Text style={{ fontFamily: family.ui.black, fontSize: scaled(24), lineHeight: scaled(26), letterSpacing: -scaled(24) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>{step.title}</Text>
          <Text style={[mono(12, 'medium'), { color: colors.text.secondary, lineHeight: scaled(18) }]}>{step.body}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {steps.map((_, k) => <View key={k} style={{ width: k === i ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: k === i ? colors.primary : colors.borderStrong }} />)}
          </View>
          <PillButton label={last ? copyText(cfg, 'tutorialStart') : 'NEXT'} variant={last ? 'primary' : 'inverse'} onPress={() => (last ? finish() : setI(i + 1))} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
