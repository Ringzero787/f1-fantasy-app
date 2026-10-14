import React, { useCallback, useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { usePrefsStore } from '../../store/prefs.store';
import { useRoundReport } from '../hooks/useRoundReport';
import { MonoLabel } from './GridBits';
import { calloutNames, signedPoints, type ReportCallout, type ReportMoonshot, type RoundReport } from './roundReport';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { useMoonshotConfig } from '../hooks/useMoonshotConfig';
import { chancePct, copyText, multiplierLabel, predictionLabel } from './moonshot';
import { captureView, shareRoundReport } from './shareRoundReport';

/**
 * League round report (F-120): how everybody in the league did in one race, against each other
 * and against their own previous round. The body is shared by the two places it opens from: the
 * League tab, and the step after the weekend recap.
 */
export function RoundReportBody({ report, loading, label }: { report: RoundReport | null; loading: boolean; label: string | null }) {
  const { colors, family, scaled, mono } = useSimpleTheme();
  // Large display sizes: one callout per row, or a name has no room beside its neighbour.
  const stack = usePrefsStore((s) => s.displayScale) > 1.15;
  const drivers = useRemoteConfigStore((s) => s.drivers);
  const cfg = useMoonshotConfig();

  if (loading) return <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start', marginVertical: 12 }} />;
  if (!report) return <Text style={[mono(12, 'medium'), { color: colors.text.muted }]}>NO LEAGUE RESULT FOR THIS RACE YET.</Text>;

  const tone = (n: number) => (n > 0 ? colors.positive : n < 0 ? colors.negative : colors.text.primary);
  const vs = report.comparedToRound != null ? `RD ${report.comparedToRound}` : 'THE ROUND BEFORE';
  // `spoken` is what a screen reader says for the figure: the glyphs and emoji on screen are not words
  const card = (key: string, title: string, spokenTitle: string, c: ReportCallout | null, shown: string | null, spoken: string, valueColor: string, line: string) => c ? (
    <View
      key={key}
      accessible
      accessibilityLabel={`${spokenTitle}: ${calloutNames(c).toLowerCase()}, ${spoken}. ${line.toLowerCase()}`}
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
  const pts = (n: number) => `${Math.abs(n).toLocaleString()} points`;
  const per100 = (n: number) => n.toFixed(1);

  const driverName = (id: string) => drivers.find((d) => d.id === id)?.name ?? id;
  const called = (m: ReportMoonshot) => `${driverName(m.driverId).toUpperCase()} — ${predictionLabel(m.predictionType, m.predictionTarget)}`;
  const paid = (m: ReportMoonshot) => (m.outcome === 'VOID' ? 'VOID' : `${signedPoints(m.amount)} ${m.currency === 'POINTS' ? 'POINTS' : 'CASH'}`);
  const terms = (m: ReportMoonshot) => [m.modelProbability != null ? `${copyText(cfg, 'modelChance')} ${chancePct(m.modelProbability)}` : null, m.multiplier != null ? multiplierLabel(m.multiplier) : null].filter(Boolean).join(' · ');
  const hits = report.moonshots.filter((m) => m.outcome === 'HIT').length;
  const best = report.callOfTheRound;

  return (
    <View style={{ gap: 14 }}>
      {/* your own round first: the recap said what you scored, this says where that put you */}
      {report.me ? (
        <View style={{ gap: 2 }}>
          <MonoLabel size={10}>YOUR ROUND</MonoLabel>
          <View accessible accessibilityLabel={`You finished ${report.me.rank} of ${report.me.of} this round with ${report.me.points} points${report.me.change != null ? `, ${report.me.change >= 0 ? 'up' : 'down'} ${pts(report.me.change)} on ${vs.toLowerCase()}` : ''}`}
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12, rowGap: 4 }}>
            <Text style={{ fontFamily: family.ui.black, fontSize: scaled(34), lineHeight: scaled(36), letterSpacing: -scaled(34) * 0.04, color: colors.text.primary }}>
              P{report.me.rank}<Text style={{ fontSize: scaled(15), color: colors.text.muted }}>/{report.me.of}</Text>
            </Text>
            <Text style={[mono(14), { color: colors.text.primary }]}>{signedPoints(report.me.points)}</Text>
            {report.me.change != null ? (
              <Text style={[mono(12, 'medium'), { color: tone(report.me.change) }]}>{report.me.change > 0 ? '▲' : report.me.change < 0 ? '▼' : '—'} {Math.abs(report.me.change).toLocaleString()} VS {vs}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {report.podium.length > 0 ? (
        <View style={{ gap: 2 }}>
          <MonoLabel color={colors.primary}>PODIUM</MonoLabel>
          {report.podium.map((p) => (
            <View key={p.userId} accessible accessibilityLabel={`Place ${p.rank}: ${p.isMe ? 'you' : p.name}, ${p.points} points`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: scaled(10), borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
              <Text style={{ fontFamily: family.ui.black, fontSize: scaled(22), lineHeight: scaled(24), letterSpacing: -scaled(22) * 0.04, color: p.rank === 1 ? colors.primary : colors.text.primary, minWidth: scaled(34) }}>{String(p.rank).padStart(2, '0')}</Text>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={2} style={{ fontFamily: family.ui.black, fontSize: scaled(14), textTransform: 'uppercase', color: colors.text.primary }}>{p.isMe ? `${p.name} · YOU` : p.name}</Text>
                {p.team ? <Text numberOfLines={1} style={[mono(10, 'medium'), { color: colors.text.muted, textTransform: 'uppercase' }]}>{p.team}</Text> : null}
              </View>
              <Text style={[mono(14), { color: colors.text.primary }]}>{signedPoints(p.points)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Moonshots: the part of a round no other fantasy game has, so it sits above the tables of most and least */}
      {report.moonshots.length > 0 ? (
        <View style={{ gap: 8 }}>
          <MonoLabel color={colors.primary}>{`🚀 MOONSHOTS · ${report.moonshots.length} CALLED · ${hits} HIT`}</MonoLabel>
          {best ? (
            <View accessible accessibilityLabel={`Call of the round: ${best.who.isMe ? 'you' : best.who.name} called ${driverName(best.driverId)} ${predictionLabel(best.predictionType, best.predictionTarget).toLowerCase()} and it landed, ${pts(best.amount)}${best.currency === 'POINTS' ? '' : ' of cash'}`}
              style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 14, padding: 14, gap: 6 }}>
              <MonoLabel size={10} color={colors.primary}>CALL OF THE ROUND</MonoLabel>
              <Text numberOfLines={2} style={{ fontFamily: family.ui.black, fontSize: scaled(16), lineHeight: scaled(18), textTransform: 'uppercase', color: colors.text.primary }}>{best.who.isMe ? `${best.who.name} · YOU` : best.who.name}</Text>
              <Text style={[mono(12), { color: colors.text.primary }]}>{called(best)}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 12, rowGap: 4 }}>
                <Text style={[mono(10, 'medium'), { color: colors.text.muted }]}>{terms(best)}</Text>
                <Text style={[mono(16), { color: colors.positive }]}>{paid(best)}</Text>
              </View>
            </View>
          ) : null}
          {report.moonshots.filter((m) => m !== best).map((m) => (
            <View key={m.id} accessible accessibilityLabel={`${m.who.isMe ? 'You' : m.who.name} called ${driverName(m.driverId)} ${predictionLabel(m.predictionType, m.predictionTarget).toLowerCase()}: ${m.outcome === 'HIT' ? 'hit' : m.outcome === 'MISSED' ? 'missed' : 'void'}${m.outcome === 'VOID' ? '' : `, ${m.amount >= 0 ? 'plus' : 'minus'} ${pts(m.amount)}${m.currency === 'POINTS' ? '' : ' of cash'}`}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: scaled(8), borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
              <Text style={{ fontSize: scaled(13) }}>{m.outcome === 'HIT' ? '🔥' : m.outcome === 'MISSED' ? '💥' : '↩'}</Text>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={2} style={{ fontFamily: family.ui.black, fontSize: scaled(12), textTransform: 'uppercase', color: colors.text.primary }}>{m.who.isMe ? `${m.who.name} · YOU` : m.who.name}</Text>
                <Text numberOfLines={2} style={[mono(10, 'medium'), { color: colors.text.muted }]}>{[called(m), terms(m)].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text style={[mono(12), { color: m.outcome === 'HIT' ? colors.positive : m.outcome === 'MISSED' ? colors.negative : colors.text.muted }]}>{paid(m)}</Text>
            </View>
          ))}
        </View>
      ) : pair('shot', [
        // a leaderboard can carry settled Moonshot points without the calls behind them being readable; say that much
        card('hit', '🚀 MOONSHOT HIT', 'Moonshot hit', report.moonshotHit, report.moonshotHit ? signedPoints(report.moonshotHit.value) : null, report.moonshotHit ? `plus ${pts(report.moonshotHit.value)}` : '', colors.positive, 'BIGGEST CALL THAT LANDED'),
        card('miss', '💥 MOONSHOT MISSED', 'Moonshot missed', report.moonshotMiss, report.moonshotMiss ? signedPoints(report.moonshotMiss.value) : null, report.moonshotMiss ? `minus ${pts(report.moonshotMiss.value)}` : '', colors.negative, 'BIGGEST CALL THAT DID NOT'),
      ])}

      {pair('move', [
        card('climb', 'BIGGEST CLIMB', 'Biggest climb', report.climb, report.climb ? `▲ ${report.climb.value.toLocaleString()}` : null, report.climb ? `up ${pts(report.climb.value)}` : '', colors.positive, `MORE THAN ${vs}`),
        card('drop', 'BIGGEST DROP', 'Biggest drop', report.drop, report.drop ? `▼ ${Math.abs(report.drop.value).toLocaleString()}` : null, report.drop ? `down ${pts(report.drop.value)}` : '', colors.negative, `FEWER THAN ${vs}`),
      ])}
      {pair('score', [
        card('top', 'TOP SCORE', 'Top score', report.topScore, report.topScore ? signedPoints(report.topScore.value) : null, report.topScore ? pts(report.topScore.value) : '', colors.text.primary, 'MOST POINTS THIS ROUND'),
        card('low', 'LOW SCORE', 'Low score', report.lowScore, report.lowScore ? signedPoints(report.lowScore.value) : null, report.lowScore ? `${report.lowScore.value < 0 ? 'minus ' : ''}${pts(report.lowScore.value)}` : '', colors.text.muted, 'FEWEST POINTS THIS ROUND'),
      ])}
      {pair('value', [
        card('eff', 'BEST VALUE', 'Best value', report.mostEfficient, report.mostEfficient ? per100(report.mostEfficient.value) : null, report.mostEfficient ? `${per100(report.mostEfficient.value)} points per 100 dollars of roster` : '', colors.positive, 'POINTS PER $100 OF ROSTER'),
        card('ineff', 'LEAST VALUE', 'Least value', report.leastEfficient, report.leastEfficient ? per100(report.leastEfficient.value) : null, report.leastEfficient ? `${per100(report.leastEfficient.value)} points per 100 dollars of roster` : '', colors.text.muted, 'POINTS PER $100 OF ROSTER'),
      ])}

      <Text style={[mono(10, 'medium'), { color: colors.text.muted }]}>
        {`${report.size} ${report.size === 1 ? 'MANAGER' : 'MANAGERS'} SCORED${label ? ` · ${label}` : ''}`}
        {report.climb || report.drop ? ` · CLIMB AND DROP COMPARE RACE POINTS WITH ${vs}` : ''}
        {report.mostEfficient || report.leastEfficient ? ' · VALUE IS RACE POINTS FOR EACH $100 THE ROSTER WAS WORTH AT LOCK' : ''}
        {report.estimated ? ' · RACE-DAY POINTS ONLY' : ''}
      </Text>
    </View>
  );
}

/** Compact branded card captured for the share sheet. Dark on purpose so a light theme does not leak. */
export function RoundReportShareCard({ report, label, leagueName, inviteCode }: {
  report: RoundReport;
  label: string | null;
  leagueName: string;
  inviteCode?: string | null;
}) {
  const { family, mono } = useSimpleTheme();
  return (
    <View style={{ width: 360, backgroundColor: '#0E0E0E', padding: 24, gap: 12 }}>
      <Text style={{ fontFamily: family.ui.black, color: '#FF2E2E', fontSize: 11, letterSpacing: 3 }}>UNDERCUT</Text>
      <Text style={{ fontFamily: family.ui.black, color: '#F2F2F2', fontSize: 18, textTransform: 'uppercase' }}>{leagueName}</Text>
      {label ? <Text style={[mono(11), { color: '#7A7A7A' }]}>{label}</Text> : null}
      {report.me ? (
        <Text style={{ fontFamily: family.ui.black, color: '#F2F2F2', fontSize: 42, letterSpacing: -1.6 }}>
          P{report.me.rank}<Text style={{ fontSize: 18, color: '#7A7A7A' }}>/{report.me.of}</Text>
        </Text>
      ) : null}
      {report.me ? <Text style={[mono(14), { color: '#F2F2F2' }]}>{signedPoints(report.me.points)}</Text> : null}
      {report.podium.map((p) => (
        <View key={p.userId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: family.ui.black, color: p.rank === 1 ? '#FF2E2E' : '#F2F2F2', fontSize: 13, textTransform: 'uppercase' }}>
            {String(p.rank).padStart(2, '0')}  {p.isMe ? `${p.name} · YOU` : p.name}
          </Text>
          <Text style={[mono(12), { color: '#F2F2F2' }]}>{signedPoints(p.points)}</Text>
        </View>
      ))}
      {inviteCode ? (
        <View style={{ marginTop: 8, gap: 4 }}>
          <Text style={[mono(10), { color: '#7A7A7A' }]}>JOIN</Text>
          <Text style={[mono(18), { color: '#F2F2F2', letterSpacing: 4 }]}>{inviteCode}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The report as a bottom sheet, for the League tab. */
export function GridRoundReportSheet({ leagueId, raceId, resultIds, leagueName, inviteCode, onClose }: {
  leagueId: string;
  raceId: string;
  resultIds: string[] | null | undefined;
  leagueName?: string;
  inviteCode?: string | null;
  onClose: () => void;
}) {
  const { colors, spacing } = useSimpleTheme();
  const insets = useSafeAreaInsets();
  const state = useRoundReport(leagueId, raceId, resultIds);
  const cardRef = useRef<View>(null);
  const onShare = useCallback(() => {
    if (!state.report) return;
    const input = { report: state.report, label: state.label, leagueName: leagueName ?? 'League', inviteCode };
    void shareRoundReport(input, () => captureView(cardRef));
  }, [state.report, state.label, leagueName, inviteCode]);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* scrim behind the sheet, not around it: nested Pressables stop the sheet scrolling on iOS (F-119) */}
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={{ maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border }}>
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: Math.max(insets.bottom, 12) + 22, gap: 14 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', columnGap: 12, rowGap: 10 }}>
              <MonoLabel style={{ flexShrink: 1 }}>{`ROUND REPORT${state.label ? ` · ${state.label}` : ''}`}</MonoLabel>
              <View style={{ flexDirection: 'row', gap: 16, marginLeft: 'auto' }}>
                {state.report ? <Pressable onPress={onShare} hitSlop={12} accessibilityRole="button" accessibilityLabel="Share round report"><MonoLabel color={colors.primary}>SHARE</MonoLabel></Pressable> : null}
                <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"><MonoLabel color={colors.text.muted}>CLOSE</MonoLabel></Pressable>
              </View>
            </View>
            <RoundReportBody {...state} />
          </ScrollView>
          {state.report ? (
            <View ref={cardRef} collapsable={false} pointerEvents="none" style={{ position: 'absolute', left: -4000, top: 0 }}>
              <RoundReportShareCard report={state.report} label={state.label} leagueName={leagueName ?? 'League'} inviteCode={inviteCode} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
