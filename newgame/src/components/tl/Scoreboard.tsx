// Scoreboard — weekend money/points summary. A compact trigger chip lives in
// the Lineup header; tapping it opens a full overlay broken down by session.
//
// All numbers are derived from the picks doc the lineup already subscribes to:
//   - settled sessions read `settledOutcomes[scope]` (won/payout/stake)
//   - open / locked sessions read pending `picks[scope]` stakes (× Ben's odds)
// so the scoreboard needs no extra fetch.

import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';
import { BEN_AGAINST } from './atoms';
import type { BenSessionDoc, PicksDoc, SessionKey } from '@/types';
import { benLineLo, benLineHi } from '@/types';

export interface ScoreEntity {
  id: string;
  name: string;
}

export interface ScopeSummaryLine {
  id: string;
  name: string;
  kind: 'driver' | 'constructor';
  side: 'with' | 'against';
  stake: number;
  settled: boolean;
  won?: boolean;
  delta?: number; // realised profit/loss on a settled pick
  pendingPayout?: number; // gross payout if a pending stake wins
  result?: number; // realised finishing position (display value; halved for constructors)
  ouLabel?: string; // Ben's predicted range for display, e.g. "P3–P5"
  bestBet?: boolean; // one of Ben's 3 featured picks (boosted against-side terms)
}

export interface ScopeSummary {
  settled: boolean;
  atRisk: number;
  net: number;
  won: number; // gross $ won across hits (payouts)
  lost: number; // gross $ lost across misses (stakes)
  hits: number;
  misses: number;
  points: number;
  lines: ScopeSummaryLine[];
}

// Ben's predicted range as a display label. Constructor lines store the SUM of
// both cars' positions, so halve for display (matching BenLinePill).
function rangeLabel(line: BenSessionDoc['entities'][string] | undefined, kind: 'driver' | 'constructor'): string | undefined {
  if (!line) return undefined;
  const lo = benLineLo(line);
  const hi = benLineHi(line);
  if (!lo && !hi) return undefined;
  const dLo = kind === 'constructor' ? Math.round(lo / 2) : lo;
  const dHi = kind === 'constructor' ? Math.round(hi / 2) : hi;
  return dLo === dHi ? `P${dLo}` : `P${dLo}–P${dHi}`;
}

const SCOPE_LABEL: Record<SessionKey, string> = {
  qualifying: 'Qualifying',
  race: 'Race',
  sprint: 'Sprint',
};

export function summarizeScope(
  scope: SessionKey,
  picksDoc: PicksDoc | null,
  benSession: BenSessionDoc | null,
  drivers: ScoreEntity[],
  constructors: ScoreEntity[],
): ScopeSummary {
  const outcomes = picksDoc?.settledOutcomes?.[scope];
  const settled = !!outcomes && Object.keys(outcomes).length > 0;
  let atRisk = 0;
  let net = 0;
  let won = 0;
  let lost = 0;
  let hits = 0;
  let misses = 0;
  let points = 0;
  const lines: ScopeSummaryLine[] = [];

  const collect = (items: ScoreEntity[], kind: 'driver' | 'constructor') => {
    for (const item of items) {
      const line = benSession?.entities?.[item.id];
      const outcome = outcomes?.[item.id];
      if (settled && outcome) {
        const delta = outcome.won ? outcome.payout - outcome.stake : -outcome.stake;
        net += delta;
        points += outcome.pointsCredit ?? 0;
        if (outcome.won) {
          hits++;
          won += outcome.payout;
        } else {
          misses++;
          lost += outcome.stake;
        }
        const resultDisp =
          outcome.result != null && kind === 'constructor' ? Math.round(outcome.result / 2) : outcome.result;
        lines.push({
          id: item.id,
          name: item.name,
          kind,
          side: outcome.side,
          stake: outcome.stake,
          settled: true,
          won: outcome.won,
          delta,
          result: resultDisp,
          ouLabel: rangeLabel(line, kind),
          bestBet: outcome.bestBet ?? line?.bestBet,
        });
        continue;
      }
      const pick = picksDoc?.picks?.[scope]?.[item.id];
      const stake = pick?.stake ?? 0;
      if (stake <= 0) continue;
      const side = pick?.side ?? 'with';
      const odds = (side === 'against' ? line?.againstOdds : line?.withOdds) ?? 2;
      // Pending payout mirrors settlement: against a best bet, profit × 1.5.
      const gross = stake * odds;
      const pendingPayout =
        side === 'against' && line?.bestBet ? stake + (gross - stake) * 1.5 : gross;
      atRisk += stake;
      lines.push({ id: item.id, name: item.name, kind, side, stake, settled: false, pendingPayout, bestBet: line?.bestBet });
    }
  };
  collect(drivers, 'driver');
  collect(constructors, 'constructor');

  return { settled, atRisk, net, won, lost, hits, misses, points, lines };
}

function chipAmount(summaries: ScopeSummary[]): { label: string; settled: boolean; positive: boolean } | null {
  const anySettled = summaries.some((s) => s.settled);
  if (anySettled) {
    const net = summaries.reduce((sum, s) => sum + (s.settled ? s.net : 0), 0);
    return { label: `${net >= 0 ? '+' : '−'}$${Math.abs(net).toFixed(0)}`, settled: true, positive: net >= 0 };
  }
  const exposure = summaries.reduce((sum, s) => sum + s.atRisk, 0);
  if (exposure > 0) return { label: `$${exposure} live`, settled: false, positive: true };
  return null;
}

export function ScoreboardChip({ summaries, onPress }: { summaries: ScopeSummary[]; onPress: () => void }) {
  const t = useTheme();
  const amount = chipAmount(summaries);
  const tone = amount?.settled ? (amount.positive ? t.success : '#FFB3AC') : t.accent;
  const bg = amount?.settled ? (amount.positive ? '#0d2418' : 'rgba(242,92,84,0.12)') : t.surface;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        height: 28,
        paddingHorizontal: 9,
        borderRadius: 8,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: amount ? tone : t.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
        <Rect x={1.5} y={1.5} width={9} height={9} rx={1.5} stroke={amount ? tone : t.textMute} strokeWidth={1.2} />
        <Path d="M3.5 7L5.5 5L7 6.5L9 4" stroke={amount ? tone : t.textMute} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <Text style={{ fontFamily: t.fMono, fontSize: 10, fontWeight: '800', color: amount ? tone : t.textMute, letterSpacing: 0.6, textTransform: 'uppercase', fontVariant: ['tabular-nums'] }}>
        {amount?.label ?? 'Score'}
      </Text>
    </Pressable>
  );
}

export function Scoreboard({
  visible,
  onClose,
  scopes,
  summaries,
  onOpenRecap,
}: {
  visible: boolean;
  onClose: () => void;
  scopes: SessionKey[];
  summaries: Record<string, ScopeSummary>;
  // When provided and some scope is settled, shows a "View full recap" button
  // that opens the paged Session Summary.
  onOpenRecap?: () => void;
}) {
  const t = useTheme();
  const list = scopes.map((s) => ({ scope: s, summary: summaries[s] })).filter((x) => x.summary);
  const settledAny = list.some((x) => x.summary.settled);
  const totalNet = list.reduce((sum, x) => sum + (x.summary.settled ? x.summary.net : 0), 0);
  const totalPoints = list.reduce((sum, x) => sum + (x.summary.settled ? x.summary.points : 0), 0);
  const totalExposure = list.reduce((sum, x) => sum + x.summary.atRisk, 0);
  const heroColor = !settledAny ? t.accent : totalNet >= 0 ? t.success : '#FFB3AC';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 64, paddingHorizontal: 12 }}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420, maxHeight: '88%', backgroundColor: t.bg, borderRadius: 16, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
          {/* hero */}
          <View style={{ padding: 20, paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={{ fontFamily: t.fMono, fontSize: 10, fontWeight: '800', color: heroColor, letterSpacing: 1.4, textTransform: 'uppercase' }}>
                {settledAny ? 'Weekend so far' : 'Weekend exposure'}
              </Text>
              <Pressable onPress={onClose} hitSlop={10} style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: t.textDim, fontFamily: t.fMono, fontSize: 15, fontWeight: '700' }}>×</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
              <Text style={{ fontFamily: t.fDisp, fontWeight: '700', fontSize: 38, letterSpacing: -1, color: t.text, fontVariant: ['tabular-nums'] }}>
                {settledAny ? `${totalNet >= 0 ? '+' : '−'}$${Math.abs(totalNet).toFixed(0)}` : `$${totalExposure}`}
              </Text>
              {settledAny ? (
                <Text style={{ fontFamily: t.fMono, fontSize: 11, color: t.textMute, fontWeight: '700', marginLeft: 8 }}>· {totalPoints} PTS</Text>
              ) : null}
            </View>
            {!settledAny ? (
              <Text style={{ fontFamily: t.fMono, fontSize: 11, color: t.textDim, marginTop: 4 }}>
                {totalExposure > 0 ? 'Cash locked against Ben across all picks' : 'No money on the line yet'}
              </Text>
            ) : null}
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 18 }}>
            {list.map(({ scope, summary }) => (
              <ScopeBlock key={scope} label={SCOPE_LABEL[scope]} summary={summary} />
            ))}
            {settledAny && onOpenRecap ? (
              <Pressable
                onPress={onOpenRecap}
                style={({ pressed }) => ({
                  marginTop: 14,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: t.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: '#0E1116', fontFamily: t.fMono, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>
                  View full recap
                </Text>
              </Pressable>
            ) : null}
            <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 0.4, textAlign: 'center', marginTop: 14, lineHeight: 14 }}>
              Correct calls score points · cash settles per stake × odds
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ScopeBlock({ label, summary }: { label: string; summary: ScopeSummary }) {
  const t = useTheme();
  const staked = summary.lines.filter((l) => l.settled || l.stake > 0);
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontFamily: t.fMono, fontSize: 10, fontWeight: '800', color: t.textMute, letterSpacing: 1.4, textTransform: 'uppercase' }}>{label}</Text>
        {summary.settled ? (
          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textDim, letterSpacing: 0.4 }}>
            {summary.hits}W · {summary.misses}L · {summary.points} pts
          </Text>
        ) : summary.atRisk > 0 ? (
          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textDim, letterSpacing: 0.4 }}>${summary.atRisk} at risk</Text>
        ) : null}
      </View>
      {staked.length === 0 ? (
        <View style={{ padding: 12, borderRadius: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.lineSoft }}>
          <Text style={{ fontFamily: t.fSans, fontSize: 12, color: t.textDim, textAlign: 'center' }}>No money on the line</Text>
        </View>
      ) : (
        <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 10, overflow: 'hidden' }}>
          {staked.map((l, i) => {
            const against = l.side === 'against';
            const sideColor = against ? BEN_AGAINST : t.accent;
            return (
              <View key={`${l.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: i === staked.length - 1 ? 0 : 1, borderBottomColor: t.lineSoft }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: t.fSans, fontSize: 13, fontWeight: '600', color: t.text }}>{l.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: `${sideColor}24` }}>
                      <Text style={{ fontFamily: t.fMono, fontSize: 8, fontWeight: '800', color: sideColor, letterSpacing: 0.8, textTransform: 'uppercase' }}>{against ? 'Against' : 'With'}</Text>
                    </View>
                    {l.stake > 0 ? <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute }}>${l.stake}</Text> : null}
                  </View>
                </View>
                {l.settled ? (
                  <Text style={{ fontFamily: t.fMono, fontSize: 14, fontWeight: '800', color: l.won ? t.success : '#FFB3AC', fontVariant: ['tabular-nums'] }}>
                    {l.won ? `+$${(l.delta ?? 0).toFixed((l.delta ?? 0) < 10 ? 1 : 0)}` : `−$${Math.abs(l.delta ?? 0).toFixed(0)}`}
                  </Text>
                ) : (
                  <Text style={{ fontFamily: t.fMono, fontSize: 11, color: t.textDim, fontVariant: ['tabular-nums'] }}>→ ${(l.pendingPayout ?? 0).toFixed(0)}</Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
