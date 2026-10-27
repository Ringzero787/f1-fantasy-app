import React, { useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView } from 'react-native';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { useWeekendRecap } from '../hooks/useWeekendRecap';
import { MonoLabel, PillButton } from './GridBits';
import { useSimpleTeam } from '../hooks/useSimpleTeam';
import { useLeagueStore } from '../../store/league.store';
import { useRoundReport } from '../hooks/useRoundReport';
import { RoundReportBody, RoundReportShareCard } from './GridRoundReport';
import { captureView, shareRoundReport } from './shareRoundReport';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { useMoonshotConfig } from '../hooks/useMoonshotConfig';
import { outcomeTone, recapMoonshotLines } from './moonshot';
import { FALLBACK_NOTE, adjustmentLine, fieldedLine, roundLine, seasonLine, splitZeroPicks, zeroLine, type RecapPick } from './weekendRecap';

/**
 * One-time post-weekend recap shown after a race the user's team was scored
 * for. Self-gating via useWeekendRecap — renders null when there's nothing new
 * to show, so it's safe to mount unconditionally.
 *
 * F-130: the numbers are the server's record of the weekend (the roster as fielded, pick by pick),
 * the round and season standing come from the league's leaderboards, and the card ends with the
 * next round and the team's Moonshot on it.
 */
export function GridWeekendRecap() {
  const { colors, family, scaled, mono } = useSimpleTheme();
  const { recap, dismiss } = useWeekendRecap();
  // F-120: after "how did I do" comes "how did everyone do". The recap marks itself seen when it is
  // left, so the race the report is for is held here; the report is the same card's second step,
  // not a second modal, because iOS will not present one while the first is still going away.
  const { team } = useSimpleTeam();
  const leagueId = team?.leagueId ?? null;
  // only narrows which earlier round is compared; the report does not wait for it
  const league = useLeagueStore((s) => (leagueId ? s.leagues.find((l) => l.id === leagueId) : undefined));
  const resultIds = league?.raceResultIds;
  const [reportRaceId, setReportRaceId] = useState<string | null>(null);
  const report = useRoundReport(reportRaceId ? leagueId : null, reportRaceId, resultIds);
  const cardRef = useRef<View>(null);
  // F-127: the team's own Moonshot on the race, named like the round report names them
  const drivers = useRemoteConfigStore((s) => s.drivers);
  const moonshotCfg = useMoonshotConfig();
  if (reportRaceId) {
    const close = () => setReportRaceId(null);
    return (
      <Modal visible transparent animationType="fade" onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 380, maxHeight: '86%', backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 24, gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <MonoLabel style={{ flexShrink: 1 }}>{`ROUND REPORT${report.label ? ` · ${report.label}` : ''}`}</MonoLabel>
              {report.report ? (
                <Pressable onPress={() => void shareRoundReport({ report: report.report!, label: report.label, leagueName: league?.name ?? 'League', inviteCode: league?.inviteCode }, () => captureView(cardRef))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Share round report">
                  <MonoLabel color={colors.primary}>SHARE</MonoLabel>
                </Pressable>
              ) : null}
            </View>
            <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
              <RoundReportBody {...report} />
            </ScrollView>
            <PillButton label="DONE" variant="inverse" onPress={close} />
            {report.report ? (
              <View ref={cardRef} collapsable={false} pointerEvents="none" style={{ position: 'absolute', left: -4000, top: 0 }}>
                <RoundReportShareCard report={report.report} label={report.label} leagueName={league?.name ?? 'League'} inviteCode={league?.inviteCode} />
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    );
  }
  if (!recap) return null;
  // Offered to anyone whose team is in a league. Not gated on the league list or its list of
  // leaderboards: both load in the background, and a recap shown before they land would lose the
  // step for good once dismissed. A league with no leaderboard for the race yet says so on the
  // next step, and is asked again next time.
  const hasReport = !!leagueId;

  const { title, round, teamPoints, roster, standing, next, moonshot } = recap;
  const { scored, zeros } = splitZeroPicks(roster.picks);
  const best = scored[0] ?? null;
  const worst = scored.length >= 2 ? scored[scored.length - 1] : null;
  const showWorst = !!worst && !!best && worst.id !== best.id && worst.points < best.points;
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const ptsColor = (n: number) => (n > 0 ? colors.positive : n < 0 ? colors.primary : colors.text.muted);
  const shot = moonshot ? recapMoonshotLines(moonshot, teamPoints, drivers.find((d) => d.id === moonshot.driverId)?.name ?? moonshot.driverId, moonshotCfg) : null;
  const toneColor = { positive: colors.positive, muted: colors.text.muted, primary: colors.primary } as const;
  const shotTone = toneColor[outcomeTone(shot?.outcome)];
  const roundText = roundLine(standing);
  const seasonText = seasonLine(standing, team?.totalPoints);
  const notes = [zeroLine(zeros), adjustmentLine(roster), fieldedLine(roster), roster.fromRecord ? null : FALLBACK_NOTE].filter((n): n is string => !!n);
  const badges = (p: RecapPick) => [p.isConstructor ? 'TEAM' : null, p.isAce ? 'ACE ×2' : null, p.isReserve ? 'AUTO' : null].filter((b): b is string => !!b);
  const spokenPick = (p: RecapPick) => `${p.name}${p.isConstructor ? ', constructor' : ''}${p.isAce ? ', your Ace, doubled' : ''}${p.isReserve ? ', auto-filled' : ''}: ${sign(p.points)} points`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 380, maxHeight: '86%', backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 24, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <MonoLabel>WEEKEND RECAP</MonoLabel>
            {round != null ? <MonoLabel color={colors.primary}>{`RD ${round}`}</MonoLabel> : null}
          </View>
          <Text numberOfLines={2} style={{ fontFamily: family.ui.black, fontSize: scaled(22), lineHeight: scaled(24), letterSpacing: -scaled(22) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>{title}</Text>
          <Text accessibilityLabel={`${sign(teamPoints)} points this weekend`} style={{ fontFamily: family.ui.black, fontSize: scaled(56), lineHeight: scaled(56) * 0.95, letterSpacing: -scaled(56) * 0.05, color: teamPoints < 0 ? colors.primary : colors.text.primary, includeFontPadding: false }}>{sign(teamPoints)}</Text>
          {/* F-127: the Moonshot is the part of the weekend no roster line tells, so it comes before the scorers */}
          {shot ? (
            <View accessible accessibilityLabel={shot.spoken} style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: shotTone, padding: 14, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <MonoLabel size={10} color={colors.primary}>🚀 MOONSHOT</MonoLabel>
                <MonoLabel size={10} color={shotTone}>{shot.state}</MonoLabel>
              </View>
              <Text style={{ fontFamily: family.ui.black, fontSize: scaled(14), textTransform: 'uppercase', color: colors.text.primary }}>{shot.call}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Text style={[mono(11, 'medium'), { color: colors.text.muted }]}>{shot.finish}</Text>
                {shot.amount ? <Text style={[mono(13), { color: shotTone }]}>{shot.amount}</Text> : null}
              </View>
            </View>
          ) : null}

          {/* F-130: where the weekend left you — in the round, and in the season table after it */}
          {roundText || seasonText ? (
            <View style={{ gap: 4 }}>
              {roundText ? <MonoLabel size={10} color={standing.wonRound ? colors.positive : colors.text.primary}>{roundText}</MonoLabel> : null}
              {seasonText ? <MonoLabel size={10} color={colors.text.muted}>{seasonText}</MonoLabel> : null}
            </View>
          ) : null}

          {best && (showWorst || scored.length >= 2) ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 6 }}>
                <MonoLabel size={10}>TOP SCORER</MonoLabel>
                <Text numberOfLines={1} style={{ fontFamily: family.ui.black, fontSize: scaled(14), textTransform: 'uppercase', color: colors.text.primary }}>{best.name}</Text>
                <Text style={[mono(13), { color: ptsColor(best.points) }]}>{sign(best.points)}</Text>
              </View>
              {showWorst ? (
                <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 6 }}>
                  <MonoLabel size={10}>LOWEST</MonoLabel>
                  <Text numberOfLines={1} style={{ fontFamily: family.ui.black, fontSize: scaled(14), textTransform: 'uppercase', color: colors.text.primary }}>{worst!.name}</Text>
                  <Text style={[mono(13), { color: ptsColor(worst!.points) }]}>{sign(worst!.points)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
            {scored.map((e) => (
              <View key={e.id + (e.isConstructor ? '_c' : '')} accessible accessibilityLabel={spokenPick(e)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: family.ui.bold, fontSize: scaled(12), textTransform: 'uppercase', color: colors.text.primary, flexShrink: 1 }}>{e.name}</Text>
                  {badges(e).map((b) => <MonoLabel key={b} size={9} color={b === 'ACE ×2' ? colors.primary : colors.text.muted}>{b}</MonoLabel>)}
                </View>
                <Text style={[mono(13), { color: ptsColor(e.points) }]}>{sign(e.points)}</Text>
              </View>
            ))}
            {notes.map((n) => (
              <Text key={n} style={[mono(10, 'medium'), { color: colors.text.muted, paddingTop: 8 }]}>{n}</Text>
            ))}
          </ScrollView>
          {shot?.total ? <Text style={[mono(11, 'medium'), { color: colors.text.secondary }]}>{shot.total}</Text> : null}

          {/* F-130: the card ends looking forward: the next round, its lock and the Moonshot on it */}
          {next ? (
            <View accessible accessibilityLabel={`${next.label}. ${next.lock}.${next.moonshot ? ` ${next.moonshot.replace('🚀 ', '')}.` : ''}`} style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <MonoLabel size={10}>{next.label}</MonoLabel>
                <MonoLabel size={10} color={colors.primary}>{next.lock}</MonoLabel>
              </View>
              {next.moonshot ? <Text style={[mono(11, 'medium'), { color: colors.text.primary }]}>{next.moonshot}</Text> : null}
            </View>
          ) : null}

          {hasReport ? (
            <>
              <PillButton label="LEAGUE SCORES" variant="inverse" onPress={() => { setReportRaceId(recap.raceId); dismiss(); }} />
              <PillButton label="GOT IT" variant="muted" onPress={dismiss} />
            </>
          ) : (
            <PillButton label="GOT IT" variant="inverse" onPress={dismiss} />
          )}
        </View>
      </View>
    </Modal>
  );
}
