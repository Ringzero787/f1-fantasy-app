// League member results — high-level view of another player's season, opened
// by tapping their row on the league leaderboard. Read-only: season totals
// (points / net cash / record vs Ben) plus a per-weekend breakdown. All data
// comes from tl_season_scores / tl_weekend_scores, which any authed user can
// read (server-written at settlement).

import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { leaderboardService } from '@services/leaderboard.service';
import { HelmetAvatar } from '@components/HelmetAvatar';
import { useTheme } from '@/theme';
import type { SeasonScore, WeekendScore } from '@/types';

// "hungary_2026" → "Hungary"; "las_vegas_2026" → "Las Vegas".
function raceLabel(raceId: string): string {
  return raceId
    .replace(/_\d{4}$/, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function LeagueMemberScreen() {
  const t = useTheme();
  const { uid, name, seasonId } = useLocalSearchParams<{ uid: string; name?: string; seasonId?: string }>();
  const season = seasonId || '2026';

  const [totals, setTotals] = useState<SeasonScore | null>(null);
  const [weekends, setWeekends] = useState<WeekendScore[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!uid) return;
      setLoading(true);
      Promise.all([
        leaderboardService.getMySeason(uid, season),
        leaderboardService.getMemberWeekends(uid, season),
      ])
        .then(([s, w]) => {
          if (!active) return;
          setTotals(s);
          setWeekends(w);
        })
        .catch(() => {})
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [uid, season])
  );

  const displayName = totals?.displayName ?? name ?? 'Player';
  const lost = totals ? Math.max(0, totals.callsTotal - totals.callsCorrect) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <HelmetAvatar userId={uid} displayName={displayName} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: t.fDisp, fontSize: 22, fontWeight: '700', color: t.text, letterSpacing: -0.4 }} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>
            Season {season}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 48, alignItems: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : !totals ? (
        <View style={{ marginTop: 24, padding: 18, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12 }}>
          <Text style={{ fontFamily: t.fSans, fontSize: 14, color: t.textDim, lineHeight: 20 }}>
            No settled weekends yet — results show up here after their first race settles.
          </Text>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
            <StatTile label="Season pts" value={String(totals.totalPoints)} />
            <StatTile
              label="Net cash"
              value={`${totals.totalCash >= 0 ? '+' : '−'}$${Math.abs(totals.totalCash).toFixed(0)}`}
              color={totals.totalCash >= 0 ? t.success : t.danger}
            />
            <StatTile label="Vs Ben" value={`${totals.callsCorrect}W-${lost}L`} />
          </View>

          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 24, marginBottom: 8 }}>
            Weekends · {totals.weekendsScored}
          </Text>
          <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12, overflow: 'hidden' }}>
            {weekends.length === 0 ? (
              <Text style={{ fontFamily: t.fSans, fontSize: 13, color: t.textDim, padding: 14 }}>Nothing settled yet.</Text>
            ) : (
              weekends.map((w, i) => {
                const wLost = Math.max(0, w.callsTotal - w.callsCorrect);
                return (
                  <View
                    key={w.id}
                    style={{
                      padding: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      borderBottomWidth: i === weekends.length - 1 ? 0 : 1,
                      borderBottomColor: t.lineSoft,
                    }}
                  >
                    <Text style={{ width: 34, fontFamily: t.fMono, fontSize: 12, fontWeight: '700', color: t.textMute }}>
                      R{w.round}
                    </Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontFamily: t.fSans, fontSize: 14, fontWeight: '500', color: t.text }} numberOfLines={1}>
                        {raceLabel(w.raceId)}
                      </Text>
                      <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 0.4, marginTop: 2 }}>
                        {w.callsCorrect}W-{wLost}L vs Ben · {w.points} pts
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: t.fMono,
                        fontSize: 15,
                        fontWeight: '700',
                        color: w.cash >= 0 ? t.success : t.danger,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {w.cash >= 0 ? '+' : '−'}${Math.abs(w.cash).toFixed(2)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12 }}>
      <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 1.2, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ fontFamily: t.fDisp, fontSize: 20, fontWeight: '700', color: color ?? t.text, marginTop: 6, letterSpacing: -0.4 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
