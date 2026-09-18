import React from 'react';
import { View, Text, Modal, ScrollView } from 'react-native';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { useWeekendRecap } from '../hooks/useWeekendRecap';
import { MonoLabel, PillButton } from './GridBits';

/**
 * One-time post-weekend recap shown after a race the user's team was scored
 * for. Self-gating via useWeekendRecap — renders null when there's nothing new
 * to show, so it's safe to mount unconditionally.
 */
export function GridWeekendRecap() {
  const { colors, family, scaled, mono } = useSimpleTheme();
  const { recap, dismiss } = useWeekendRecap();
  if (!recap) return null;

  const { raceName, teamPoints, best, worst, rank, leagueSize, entities } = recap;
  const showWorst = worst && best && worst.name !== best.name && worst.points < best.points;
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const ptsColor = (n: number) => (n > 0 ? colors.positive : n < 0 ? colors.primary : colors.text.muted);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 380, maxHeight: '86%', backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 24, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <MonoLabel>WEEKEND RECAP</MonoLabel>
            {rank != null ? <MonoLabel color={colors.primary}>{`P${rank}${leagueSize ? ` / ${leagueSize}` : ''}`}</MonoLabel> : null}
          </View>
          <Text numberOfLines={2} style={{ fontFamily: family.ui.black, fontSize: scaled(22), lineHeight: scaled(24), letterSpacing: -scaled(22) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>{raceName}</Text>
          <Text style={{ fontFamily: family.ui.black, fontSize: scaled(56), lineHeight: scaled(56) * 0.95, letterSpacing: -scaled(56) * 0.05, color: teamPoints < 0 ? colors.primary : colors.text.primary, includeFontPadding: false }}>{sign(teamPoints)}</Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {best ? (
              <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 6 }}>
                <MonoLabel size={10}>TOP SCORER</MonoLabel>
                <Text numberOfLines={1} style={{ fontFamily: family.ui.black, fontSize: scaled(14), textTransform: 'uppercase', color: colors.text.primary }}>{best.name}</Text>
                <Text style={[mono(13), { color: ptsColor(best.points) }]}>{sign(best.points)}</Text>
              </View>
            ) : null}
            {showWorst ? (
              <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 6 }}>
                <MonoLabel size={10}>LOWEST</MonoLabel>
                <Text numberOfLines={1} style={{ fontFamily: family.ui.black, fontSize: scaled(14), textTransform: 'uppercase', color: colors.text.primary }}>{worst!.name}</Text>
                <Text style={[mono(13), { color: ptsColor(worst!.points) }]}>{sign(worst!.points)}</Text>
              </View>
            ) : null}
          </View>

          <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
            {entities.map((e) => (
              <View key={e.name + (e.isConstructor ? '_c' : '')} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  {e.isConstructor ? <MonoLabel size={10} color={colors.primary}>TEAM</MonoLabel> : null}
                  <Text numberOfLines={1} style={{ fontFamily: family.ui.bold, fontSize: scaled(12), textTransform: 'uppercase', color: colors.text.primary, flexShrink: 1 }}>{e.name}</Text>
                </View>
                <Text style={[mono(13), { color: ptsColor(e.points) }]}>{sign(e.points)}</Text>
              </View>
            ))}
          </ScrollView>

          <PillButton label="GOT IT" variant="inverse" onPress={dismiss} />
        </View>
      </View>
    </Modal>
  );
}
