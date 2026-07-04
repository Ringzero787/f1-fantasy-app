// Session Summary — a paged recap that auto-pops the first time a session
// settles. One page per newly-settled scope + a weekend wrap when 2+ settled.
// "Seen" state persists in AsyncStorage (keyed by raceId+scope) so it never
// re-pops; reopenable via the Scoreboard's "View full recap" button.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/theme';
import { BEN_AGAINST } from './atoms';
import type { ScopeSummary, ScopeSummaryLine } from './Scoreboard';
import type { SeasonScore, SessionKey } from '@/types';

const SEEN_KEY = 'tl-summary-seen-v1';
const SCOPE_LABEL: Record<SessionKey, string> = { qualifying: 'Qualifying', race: 'Race', sprint: 'Sprint' };

// Detect newly-settled scopes and drive the auto-pop. `settledScopes` is the
// list of sessions currently in the results phase.
export function useSessionSummary(raceId: string | undefined, settledScopes: SessionKey[]) {
  const [seen, setSeen] = useState<Record<string, boolean> | null>(null);
  const [open, setOpen] = useState(false);
  const [manualScopes, setManualScopes] = useState<SessionKey[] | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SEEN_KEY)
      .then((raw) => {
        if (!active) return;
        try {
          setSeen(raw ? JSON.parse(raw) : {});
        } catch {
          setSeen({});
        }
      })
      .catch(() => active && setSeen({}));
    return () => {
      active = false;
    };
  }, []);

  const settledKey = settledScopes.join(',');
  const unseen = useMemo(() => {
    if (!seen || !raceId) return [] as SessionKey[];
    return settledScopes.filter((s) => !seen[`${raceId}-${s}`]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, raceId, settledKey]);

  useEffect(() => {
    if (unseen.length > 0) {
      setManualScopes(null);
      setOpen(true);
    }
  }, [unseen.length]);

  const persistSeen = useCallback(
    (toMark: SessionKey[]) => {
      if (!raceId) return;
      const base = seen ?? {};
      const next = { ...base };
      toMark.forEach((s) => {
        next[`${raceId}-${s}`] = true;
      });
      setSeen(next);
      AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next)).catch(() => {});
    },
    [seen, raceId],
  );

  const close = useCallback(() => {
    setOpen(false);
    if (!manualScopes) persistSeen(unseen); // only persist when it auto-popped
    setManualScopes(null);
  }, [manualScopes, unseen, persistSeen]);

  // Reopen on demand with all settled scopes (even already-seen ones).
  const openManually = useCallback(() => {
    if (settledScopes.length === 0) return;
    setManualScopes(settledScopes);
    setOpen(true);
  }, [settledKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { open, scopes: manualScopes ?? unseen, close, openManually };
}

export function SessionSummary({
  visible,
  scopes,
  summaries,
  season,
  onClose,
}: {
  visible: boolean;
  scopes: SessionKey[];
  summaries: Record<string, ScopeSummary>;
  /** Running season totals (post-settlement) — gives the weekend wrap its
   *  week-to-week context. Null until the first settled weekend. */
  season?: SeasonScore | null;
  onClose: () => void;
}) {
  const t = useTheme();
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (visible) setPage(0);
  }, [visible]);

  if (!visible || scopes.length === 0) return null;

  const pages: Array<{ kind: 'scope'; scope: SessionKey } | { kind: 'weekend' }> = [
    ...scopes.map((s) => ({ kind: 'scope' as const, scope: s })),
    ...(scopes.length > 1 ? [{ kind: 'weekend' as const }] : []),
  ];
  const total = pages.length;
  const cur = pages[Math.min(page, total - 1)];
  const next = () => (page < total - 1 ? setPage((p) => p + 1) : onClose());
  const prev = () => page > 0 && setPage((p) => p - 1);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
        <View style={{ width: '100%', maxWidth: 400, height: '92%', maxHeight: 760, backgroundColor: t.bg, borderRadius: 18, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
          {/* progress dots */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, paddingTop: 14, paddingBottom: 8 }}>
            {pages.map((_, i) => (
              <View key={i} style={{ width: i === page ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: i <= page ? t.accent : t.surface2 }} />
            ))}
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={{ position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 7, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            <Text style={{ color: t.textDim, fontFamily: t.fMono, fontSize: 15, fontWeight: '700' }}>×</Text>
          </Pressable>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {cur.kind === 'scope' ? (
              <ScopePage scope={cur.scope} summary={summaries[cur.scope]} />
            ) : (
              <WeekendPage scopes={scopes} summaries={summaries} season={season} />
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: t.lineSoft }}>
            {page > 0 ? (
              <Pressable onPress={prev} style={{ paddingHorizontal: 14, height: 44, borderRadius: 10, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: t.textDim, fontFamily: t.fMono, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>‹ Back</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={next} style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 10, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ color: '#0E1116', fontFamily: t.fMono, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                {page < total - 1 ? 'Next ›' : 'Got it'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ScopePage({ scope, summary }: { scope: SessionKey; summary?: ScopeSummary }) {
  const t = useTheme();
  if (!summary) return null;
  const won = summary.net >= 0;
  const heroColor = won ? t.success : '#FFB3AC';

  return (
    <View style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
      <Text style={{ fontFamily: t.fMono, fontSize: 11, fontWeight: '800', color: heroColor, letterSpacing: 1.6, textTransform: 'uppercase' }}>
        {SCOPE_LABEL[scope]} · Settled
      </Text>
      <Text style={{ fontFamily: t.fDisp, fontWeight: '700', fontSize: 30, letterSpacing: -0.8, color: t.text, marginTop: 6, marginBottom: 14 }}>
        {won ? 'Cashed in.' : 'Tough scope.'}
      </Text>

      {/* hero */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, padding: 16, borderRadius: 14, backgroundColor: won ? '#0d2418' : 'rgba(242,92,84,0.12)', borderWidth: 1, borderColor: heroColor }}>
        <Text style={{ fontFamily: t.fDisp, fontWeight: '700', fontSize: 50, color: heroColor, letterSpacing: -1.6, fontVariant: ['tabular-nums'] }}>
          {won ? '+' : '−'}${Math.abs(summary.net).toFixed(0)}
        </Text>
        <Text style={{ fontFamily: t.fMono, fontSize: 16, color: t.textMute, fontWeight: '600' }}>M</Text>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'flex-end' }}>
          {/* The won hero card is always dark green, so its text must be light
              regardless of theme (t.text is dark in light theme → invisible). */}
          <Text style={{ fontFamily: t.fMono, fontSize: 9, fontWeight: '800', color: won ? 'rgba(255,255,255,0.65)' : t.textMute, letterSpacing: 1.2, textTransform: 'uppercase' }}>Points</Text>
          <Text style={{ fontFamily: t.fDisp, fontWeight: '700', fontSize: 22, color: won ? '#FFFFFF' : t.text, fontVariant: ['tabular-nums'] }}>{summary.points}</Text>
        </View>
      </View>

      {/* hits / misses */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <View style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: 'rgba(123,211,137,0.10)', borderWidth: 1, borderColor: t.success }}>
          <Text style={{ fontFamily: t.fMono, fontSize: 9, fontWeight: '800', color: t.success, letterSpacing: 1.2, textTransform: 'uppercase' }}>Hits</Text>
          <Text style={{ fontFamily: t.fDisp, fontWeight: '700', fontSize: 24, color: t.text, marginTop: 4, fontVariant: ['tabular-nums'] }}>{summary.hits}</Text>
          <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.success, marginTop: 2 }}>+${summary.won.toFixed(1)}M won</Text>
        </View>
        <View style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: 'rgba(242,92,84,0.10)', borderWidth: 1, borderColor: 'rgba(242,92,84,0.4)' }}>
          <Text style={{ fontFamily: t.fMono, fontSize: 9, fontWeight: '800', color: '#FFB3AC', letterSpacing: 1.2, textTransform: 'uppercase' }}>Misses</Text>
          <Text style={{ fontFamily: t.fDisp, fontWeight: '700', fontSize: 24, color: t.text, marginTop: 4, fontVariant: ['tabular-nums'] }}>{summary.misses}</Text>
          <Text style={{ fontFamily: t.fMono, fontSize: 9, color: '#FFB3AC', marginTop: 2 }}>−${summary.lost.toFixed(1)}M lost</Text>
        </View>
      </View>

      <BestWorst lines={summary.lines} />

      <Text style={{ fontFamily: t.fMono, fontSize: 10, fontWeight: '800', color: t.textMute, letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>All picks</Text>
      <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 10, overflow: 'hidden' }}>
        {summary.lines.map((l, i) => {
          const w = l.won;
          const sideColor = l.side === 'against' ? BEN_AGAINST : t.accent;
          const isLast = i === summary.lines.length - 1;
          return (
            <View key={`${l.kind}-${l.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: t.lineSoft, opacity: w === false ? 0.85 : 1 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: w ? t.success : '#FFB3AC' }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: t.fSans, fontSize: 13, fontWeight: '600', color: t.text }}>
                  {l.bestBet ? '★ ' : ''}{l.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: `${sideColor}24` }}>
                    <Text style={{ fontFamily: t.fMono, fontSize: 8, fontWeight: '800', color: sideColor, letterSpacing: 0.8, textTransform: 'uppercase' }}>{l.side === 'against' ? 'Against' : 'With'}</Text>
                  </View>
                  <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 0.4 }}>
                    {l.stake > 0 ? `$${l.stake}M` : 'no stake'}
                    {l.ouLabel && l.result != null ? ` · ${l.ouLabel} → P${l.result}` : ''}
                  </Text>
                </View>
              </View>
              <Text style={{ fontFamily: t.fMono, fontWeight: '800', fontSize: 13, color: w ? t.success : '#FFB3AC', fontVariant: ['tabular-nums'] }}>
                {w ? `+$${(l.delta ?? 0).toFixed(1)}M` : l.stake > 0 ? `−$${Math.abs(l.delta ?? l.stake).toFixed(0)}M` : '—'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function BestWorst({ lines }: { lines: ScopeSummaryLine[] }) {
  const t = useTheme();
  const realised = lines.filter((l) => l.won != null);
  if (realised.length < 2) return null;
  const best = realised.reduce((a, b) => ((b.delta ?? 0) > (a.delta ?? 0) ? b : a));
  const worst = realised.reduce((a, b) => ((b.delta ?? 0) < (a.delta ?? 0) ? b : a));
  if ((best.delta ?? 0) === (worst.delta ?? 0)) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
      <Callout label="Big winner" name={best.name} delta={best.delta ?? 0} positive />
      <Callout label="Hurt the most" name={worst.name} delta={worst.delta ?? 0} />
    </View>
  );
}

function Callout({ label, name, delta, positive }: { label: string; name: string; delta: number; positive?: boolean }) {
  const t = useTheme();
  const color = positive ? t.success : '#FFB3AC';
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.lineSoft }}>
      <Text style={{ fontFamily: t.fMono, fontSize: 9, fontWeight: '800', color, letterSpacing: 1.2, textTransform: 'uppercase' }}>{label}</Text>
      <Text numberOfLines={1} style={{ fontFamily: t.fDisp, fontWeight: '700', fontSize: 16, color: t.text, marginTop: 4 }}>{name}</Text>
      <Text style={{ fontFamily: t.fMono, fontSize: 11, fontWeight: '800', color, marginTop: 2, fontVariant: ['tabular-nums'] }}>
        {delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}M
      </Text>
    </View>
  );
}

function WeekendPage({
  scopes,
  summaries,
  season,
}: {
  scopes: SessionKey[];
  summaries: Record<string, ScopeSummary>;
  season?: SeasonScore | null;
}) {
  const t = useTheme();
  const data = scopes.map((s) => ({ scope: s, summary: summaries[s] })).filter((x) => x.summary);
  const net = data.reduce((a, d) => a + d.summary.net, 0);
  const points = data.reduce((a, d) => a + d.summary.points, 0);
  const hits = data.reduce((a, d) => a + d.summary.hits, 0);
  const misses = data.reduce((a, d) => a + d.summary.misses, 0);
  const won = net >= 0;
  const heroColor = won ? t.success : '#FFB3AC';

  return (
    <View style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
      <Text style={{ fontFamily: t.fMono, fontSize: 11, fontWeight: '800', color: heroColor, letterSpacing: 1.6, textTransform: 'uppercase' }}>Weekend wrap</Text>
      <Text style={{ fontFamily: t.fDisp, fontWeight: '700', fontSize: 30, letterSpacing: -0.8, color: t.text, marginTop: 6, marginBottom: 14 }}>
        {won ? 'You beat Ben.' : 'Ben beat you.'}
      </Text>

      <View style={{ padding: 18, borderRadius: 14, backgroundColor: won ? '#0d2418' : 'rgba(242,92,84,0.15)', borderWidth: 1.5, borderColor: heroColor }}>
        <Text style={{ fontFamily: t.fMono, fontSize: 9, fontWeight: '800', color: t.textMute, letterSpacing: 1.4, textTransform: 'uppercase' }}>Net to bankroll</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
          <Text style={{ fontFamily: t.fDisp, fontWeight: '700', fontSize: 60, color: heroColor, letterSpacing: -2.5, fontVariant: ['tabular-nums'] }}>
            {won ? '+' : '−'}${Math.abs(net).toFixed(0)}
          </Text>
          <Text style={{ fontFamily: t.fDisp, fontSize: 22, color: t.textMute, fontWeight: '600' }}>M</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.lineSoft }}>
          <Text style={{ fontFamily: t.fMono, fontSize: 11, color: won ? 'rgba(255,255,255,0.8)' : t.textDim }}>{points} pts earned</Text>
          <Text style={{ fontFamily: t.fMono, fontSize: 11, color: won ? 'rgba(255,255,255,0.8)' : t.textDim }}>{hits}W · {misses}L</Text>
        </View>
      </View>

      <View style={{ marginTop: 14, gap: 6 }}>
        {data.map(({ scope, summary }) => {
          const sw = summary.net >= 0;
          return (
            <View key={scope} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>
              <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: sw ? t.success : '#FFB3AC' }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: t.fSans, fontSize: 13, fontWeight: '600', color: t.text }}>{SCOPE_LABEL[scope]}</Text>
                <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, marginTop: 2 }}>{summary.hits}W · {summary.misses}L · {summary.points} pts</Text>
              </View>
              <Text style={{ fontFamily: t.fMono, fontWeight: '800', fontSize: 14, color: sw ? t.success : '#FFB3AC', fontVariant: ['tabular-nums'] }}>
                {sw ? '+' : '−'}${Math.abs(summary.net).toFixed(0)}M
              </Text>
            </View>
          );
        })}
      </View>

      {/* Season-so-far — the week-to-week trend at a glance. */}
      {season ? (
        <View style={{ marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.lineSoft }}>
          <Text style={{ fontFamily: t.fMono, fontSize: 9, fontWeight: '800', color: t.textMute, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Season so far · {season.weekendsScored} weekend{season.weekendsScored === 1 ? '' : 's'}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <View>
              <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 0.8, textTransform: 'uppercase' }}>Net cash</Text>
              <Text style={{ fontFamily: t.fDisp, fontWeight: '700', fontSize: 18, color: season.totalCash >= 0 ? t.success : '#FFB3AC', fontVariant: ['tabular-nums'] }}>
                {season.totalCash >= 0 ? '+' : '−'}${Math.abs(season.totalCash).toFixed(0)}M
              </Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 0.8, textTransform: 'uppercase' }}>Points</Text>
              <Text style={{ fontFamily: t.fDisp, fontWeight: '700', fontSize: 18, color: t.text, fontVariant: ['tabular-nums'] }}>{season.totalPoints}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 0.8, textTransform: 'uppercase' }}>Calls</Text>
              <Text style={{ fontFamily: t.fDisp, fontWeight: '700', fontSize: 18, color: t.text, fontVariant: ['tabular-nums'] }}>
                {season.callsCorrect}–{Math.max(0, season.callsTotal - season.callsCorrect)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 0.4, textAlign: 'center', marginTop: 16, lineHeight: 15 }}>
        Cards below hold your win/loss until Ben posts the next race's lines.
      </Text>
    </View>
  );
}
