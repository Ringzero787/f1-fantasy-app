// Standings — two tabs: this Weekend and Season. Reads tl_weekend_scores +
// tl_season_scores (written by tlSettleWeekend Cloud Function). Empty until
// Ben posts lines, players make picks, the race runs, and settlement is run.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@store/auth.store';
import { useUpcomingRace } from '@/hooks/useUpcomingRace';
import { leaderboardService } from '@services/leaderboard.service';
import { useTheme } from '@/theme';
import type { SeasonScore, WeekendScore } from '@/types';

type StandingsView = 'weekend' | 'season';

export default function StandingsScreen() {
  const t = useTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const { data: upcomingRace } = useUpcomingRace();
  const seasonId = upcomingRace?.seasonId ?? '2026';

  const [view, setView] = useState<StandingsView>('weekend');
  const [weekend, setWeekend] = useState<WeekendScore[] | null>(null);
  const [season, setSeason] = useState<SeasonScore[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!upcomingRace) return;
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        if (view === 'weekend') {
          const data = await leaderboardService.getWeekend(upcomingRace.id);
          if (!cancelled) setWeekend(data);
        } else {
          const data = await leaderboardService.getSeason(seasonId);
          if (!cancelled) setSeason(data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, upcomingRace, seasonId]);

  const list = view === 'weekend' ? weekend : season;
  const isEmpty = list?.length === 0;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Standings', headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text }} />
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: t.surface,
            borderRadius: 10,
            padding: 3,
            borderWidth: 1,
            borderColor: t.line,
            gap: 3,
          }}
        >
          <ViewBtn
            label="This weekend"
            sub={upcomingRace ? `R${upcomingRace.round} ${upcomingRace.country}` : ''}
            active={view === 'weekend'}
            onPress={() => setView('weekend')}
          />
          <ViewBtn
            label="Season"
            sub={seasonId}
            active={view === 'season'}
            onPress={() => setView('season')}
          />
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
        <View
          style={{
            flexDirection: 'row',
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderBottomWidth: 1,
            borderBottomColor: t.lineSoft,
            gap: 8,
          }}
        >
          <ColLabel style={{ width: 30 }}>#</ColLabel>
          <ColLabel style={{ flex: 1 }}>Player</ColLabel>
          <ColLabel style={{ width: 50, textAlign: 'right' }}>Calls</ColLabel>
          <ColLabel style={{ width: 60, textAlign: 'right' }}>Cash</ColLabel>
          <ColLabel style={{ width: 60, textAlign: 'right' }}>Pts</ColLabel>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={t.accent} />
          </View>
        ) : isEmpty ? (
          <View style={{ paddingVertical: 32, alignItems: 'center', gap: 8 }}>
            <Text
              style={{
                fontFamily: t.fMono,
                fontSize: 11,
                color: t.textMute,
                letterSpacing: 1,
                textTransform: 'uppercase',
                fontWeight: '700',
              }}
            >
              No standings yet
            </Text>
            <Text style={{ fontFamily: t.fSans, fontSize: 12, color: t.textDim, textAlign: 'center', maxWidth: 280 }}>
              Standings populate when {view === 'weekend' ? "the weekend's race settles" : 'season races settle'}. Make picks on the Lineup tab and check back after race day.
            </Text>
          </View>
        ) : (
          (list || []).map((row, i) => {
            const isMe = userId && row.userId === userId;
            return (
              <View
                key={row.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                  backgroundColor: isMe ? t.accentSoft : 'transparent',
                  borderBottomWidth: 1,
                  borderBottomColor: t.lineSoft,
                  borderRadius: isMe ? 6 : 0,
                }}
              >
                <Text style={{ width: 30, fontFamily: t.fMono, fontWeight: '800', color: i < 3 ? t.accent : t.text, fontSize: 13 }}>
                  {i + 1}
                </Text>
                <Text style={{ flex: 1, fontFamily: t.fDisp, fontWeight: '600', fontSize: 13, color: t.text }} numberOfLines={1}>
                  {row.displayName}
                </Text>
                <Text style={{ width: 50, textAlign: 'right', fontFamily: t.fMono, fontSize: 11, color: t.textDim }}>
                  {row.callsCorrect}/{row.callsTotal}
                </Text>
                <Text style={{ width: 60, textAlign: 'right', fontFamily: t.fMono, fontSize: 11, color: t.textDim, fontWeight: '600' }}>
                  ${'cash' in row ? row.cash : (row as SeasonScore).totalCash}
                </Text>
                <Text style={{ width: 60, textAlign: 'right', fontFamily: t.fMono, fontSize: 13, color: t.text, fontWeight: '800' }}>
                  {'points' in row ? row.points : (row as SeasonScore).totalPoints}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={{ padding: 16 }}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            {
              height: 44,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: t.line,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={{ fontFamily: t.fMono, fontSize: 12, fontWeight: '700', letterSpacing: 1, color: t.text, textTransform: 'uppercase' }}>
            Back
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function ViewBtn({ label, sub, active, onPress }: { label: string; sub: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: active ? t.accent : 'transparent',
        gap: 1,
      }}
    >
      <Text
        style={{
          color: active ? '#0E1116' : t.textDim,
          fontFamily: t.fSans,
          fontWeight: '600',
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: active ? '#0E1116' : t.textMute,
          fontFamily: t.fMono,
          fontSize: 9,
          fontWeight: '600',
          letterSpacing: 1,
          textAlign: 'center',
          opacity: active ? 0.6 : 0.7,
        }}
      >
        {sub}
      </Text>
    </Pressable>
  );
}

function ColLabel({ children, style }: { children: React.ReactNode; style?: object }) {
  const t = useTheme();
  return (
    <Text
      style={[
        {
          fontFamily: t.fMono,
          fontSize: 9,
          color: t.textMute,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          fontWeight: '700',
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
