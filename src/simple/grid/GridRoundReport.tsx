import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { usePrefsStore } from '../../store/prefs.store';
import { useRoundReport } from '../hooks/useRoundReport';
import { MonoLabel } from './GridBits';
import { calloutNames, signedPoints, type ReportCallout, type RoundReport } from './roundReport';

/**
 * League round report (F-120): how everybody in the league did in one race, against each other
 * and against their own previous round. The body is shared by the two places it opens from: the
 * League tab, and the step after the weekend recap.
 */
export function RoundReportBody({ report, loading, label }: { report: RoundReport | null; loading: boolean; label: string | null }) {
  const { colors, family, scaled, mono } = useSimpleTheme();
  // Large display sizes: one callout per row, or a name has no room beside its neighbour.
  const stack = usePrefsStore((s) => s.displayScale) > 1.15;

  if (loading) return <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start', marginVertical: 12 }} />;
  if (!report) return <Text style={[mono(12, 'medium'), { color: colors.text.muted }]}>NO LEAGUE RESULT FOR THIS RACE YET.</Text>;

  const tone = (n: number) => (n > 0 ? colors.positive : n < 0 ? colors.negative : colors.text.primary);
  const card = (key: string, title: string, c: ReportCallout | null, shown: string | null, valueColor: string, line: string) => c ? (
    <View
      key={key}
      accessible
      accessibilityLabel={`${title}: ${calloutNames(c)}, ${shown}. ${line}`}
      style={{ flex: stack ? undefined : 1, minWidth: 0, backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, borderColor: c.includesMe ? colors.primary : 'transparent' }}
    >
      <MonoLabel size={10}>{title}</MonoLabel>
      <Text style={[mono(18), { color: valueColor }]}>{shown}</Text>
      <Text numberOfLines={2} style={{ fontFamily: family.ui.black, fontSize: scaled(13), lineHeight: scaled(15), textTransform: 'uppercase', color: colors.text.primary }}>{calloutNames(c)}</Text>
      <Text style={[mono(10, 'medium'), { color: colors.text.muted }]}>{line}</Text>
    </View>
  ) : null;
  // A pair sits side by side; when only one of the two has anything to say it takes the row.
  const pair = (key: string, cards: React.ReactNode[]) => {
    const shown = cards.filter(Boolean);
    return shown.length ? <View key={key} style={{ flexDirection: stack ? 'column' : 'row', gap: 10 }}>{shown}</View> : null;
  };
  const vs = report.comparedToRound != null ? `VS RD ${report.comparedToRound}` : 'VS THE ROUND BEFORE';

  return (
    <View style={{ gap: 14 }}>
      {/* your own round first: the recap said what you scored, this says where that put you */}
      {report.me ? (
        <View accessible accessibilityLabel={`You finished ${report.me.rank} of ${report.me.of} with ${report.me.points} points${report.me.change != null ? `, ${signedPoints(report.me.change)} against your previous round` : ''}`}
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12, rowGap: 4 }}>
          <Text style={{ fontFamily: family.ui.black, fontSize: scaled(34), lineHeight: scaled(36), letterSpacing: -scaled(34) * 0.04, color: colors.text.primary }}>
            P{report.me.rank}<Text style={{ fontSize: scaled(15), color: colors.text.muted }}>/{report.me.of}</Text>
          </Text>
          <Text style={[mono(14), { color: colors.text.primary }]}>{signedPoints(report.me.points)}</Text>
          {report.me.change != null ? (
            <Text style={[mono(12, 'medium'), { color: tone(report.me.change) }]}>{report.me.change > 0 ? '▲' : report.me.change < 0 ? '▼' : '—'} {Math.abs(report.me.change).toLocaleString()} {vs}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 2 }}>
        <MonoLabel color={colors.primary}>PODIUM</MonoLabel>
        {report.podium.map((p) => (
          <View key={p.userId} accessible accessibilityLabel={`Place ${p.rank}: ${p.isMe ? 'you' : p.name}, ${p.points} points`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: scaled(10), borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
            <Text style={{ fontFamily: family.ui.black, fontSize: scaled(22), lineHeight: scaled(24), letterSpacing: -scaled(22) * 0.04, color: p.rank === 1 ? colors.primary : colors.text.primary, minWidth: scaled(34) }}>{String(p.rank).padStart(2, '0')}</Text>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text numberOfLines={1} style={{ fontFamily: family.ui.black, fontSize: scaled(14), textTransform: 'uppercase', color: colors.text.primary }}>{p.isMe ? `${p.name} · YOU` : p.name}</Text>
              {p.team ? <Text numberOfLines={1} style={[mono(10, 'medium'), { color: colors.text.muted, textTransform: 'uppercase' }]}>{p.team}</Text> : null}
            </View>
            <Text style={[mono(14), { color: colors.text.primary }]}>{signedPoints(p.points)}</Text>
          </View>
        ))}
      </View>

      {pair('move', [
        card('climb', 'BIGGEST CLIMB', report.climb, report.climb ? `▲ ${report.climb.value.toLocaleString()}` : null, colors.positive, `MORE THAN LAST ROUND`),
        card('drop', 'BIGGEST DROP', report.drop, report.drop ? `▼ ${Math.abs(report.drop.value).toLocaleString()}` : null, colors.negative, `FEWER THAN LAST ROUND`),
      ])}
      {pair('score', [
        card('top', 'TOP SCORE', report.topScore, report.topScore ? signedPoints(report.topScore.value) : null, colors.text.primary, 'MOST POINTS THIS ROUND'),
        card('low', 'LOW SCORE', report.lowScore, report.lowScore ? signedPoints(report.lowScore.value) : null, colors.text.muted, 'FEWEST POINTS THIS ROUND'),
      ])}
      {pair('shot', [
        card('hit', '🚀 MOONSHOT HIT', report.moonshotHit, report.moonshotHit ? signedPoints(report.moonshotHit.value) : null, colors.positive, 'BIGGEST CALL THAT LANDED'),
        card('miss', '💥 MOONSHOT MISSED', report.moonshotMiss, report.moonshotMiss ? signedPoints(report.moonshotMiss.value) : null, colors.negative, 'BIGGEST CALL THAT DID NOT'),
      ])}

      <Text style={[mono(10, 'medium'), { color: colors.text.muted }]}>
        {`${report.size} ${report.size === 1 ? 'MANAGER' : 'MANAGERS'} SCORED${label ? ` · ${label}` : ''}`}
        {report.climb || report.drop ? ` · CLIMB AND DROP COMPARE RACE POINTS ${vs}` : ''}
        {report.estimated ? ' · RACE-DAY POINTS ONLY' : ''}
      </Text>
    </View>
  );
}

/** The report as a bottom sheet, for the League tab. */
export function GridRoundReportSheet({ leagueId, raceId, resultIds, onClose }: { leagueId: string; raceId: string; resultIds: string[] | null | undefined; onClose: () => void }) {
  const { colors, spacing } = useSimpleTheme();
  const insets = useSafeAreaInsets();
  const state = useRoundReport(leagueId, raceId, resultIds);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* scrim behind the sheet, not around it: nested Pressables stop the sheet scrolling on iOS (F-119) */}
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={{ maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border }}>
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: Math.max(insets.bottom, 12) + 22, gap: 14 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', columnGap: 12, rowGap: 10 }}>
              <MonoLabel style={{ flexShrink: 1 }}>{`ROUND REPORT${state.label ? ` · ${state.label}` : ''}`}</MonoLabel>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={{ marginLeft: 'auto' }}><MonoLabel color={colors.text.muted}>CLOSE</MonoLabel></Pressable>
            </View>
            <RoundReportBody {...state} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
