// Results — recap of the most recently settled race for the current user.
// Shows your Ben picks per session with line vs actual, side, stake, payout,
// and the running totals (points, cash, calls).
//
// Replaces the old fantasy-points recap (driver-by-driver Q/R points). Now
// the unit of meaning is the pick, not the started driver.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuthStore } from '@store/auth.store';
import { dataService } from '@services/data.service';
import { useTheme } from '@/theme';
import { CONSTRUCTOR_COLORS } from '@/theme/tokens';
import { Num, BenLinePill } from '@components/tl';
import type {
  BenLine,
  BenSessionDoc,
  Constructor,
  Driver,
  PicksDoc,
  Race,
  SessionKey,
  WeekendScore,
} from '@/types';

interface SessionView {
  session: SessionKey;
  lines: Record<string, BenLine>;
  picks: Record<
    string,
    {
      side: 'with' | 'against';
      stake: number;
      result?: number;
      outcome?: 'with' | 'against';
      won?: boolean;
    }
  >;
}

interface RecapData {
  race: Race;
  weekendScore: WeekendScore | null;
  sessions: SessionView[];
  driverById: Record<string, Driver>;
  constructorById: Record<string, Constructor>;
}

async function loadRecap(userId: string): Promise<RecapData | null> {
  // Most recent settled weekend for this user.
  const settledQ = query(
    collection(db, 'tl_weekend_scores'),
    where('userId', '==', userId),
    orderBy('round', 'desc'),
    limit(1)
  );
  const settledSnap = await getDocs(settledQ);
  let raceId: string | null = null;
  let weekendScore: WeekendScore | null = null;
  if (!settledSnap.empty) {
    const d = settledSnap.docs[0];
    weekendScore = { id: d.id, ...d.data() } as WeekendScore;
    raceId = weekendScore.raceId;
  }
  // If nothing settled yet, fall back to upcoming race so user sees the empty
  // template rather than a blank screen.
  let race: Race | null = null;
  if (raceId) {
    const raceSnap = await getDoc(doc(db, 'races', raceId));
    if (raceSnap.exists()) race = { id: raceSnap.id, ...raceSnap.data() } as Race;
  }
  if (!race) {
    race = await dataService.getUpcomingRace();
    if (race) raceId = race.id;
  }
  if (!race || !raceId) return null;

  // Pull this user's picks for that race.
  const picksSnap = await getDoc(doc(db, 'tl_picks', `${userId}_${raceId}`));
  const picksDoc = picksSnap.exists() ? ({ id: picksSnap.id, ...picksSnap.data() } as PicksDoc) : null;

  // Pull Ben's settled lines for each session.
  const sessions: SessionKey[] = ['qualifying', 'race', 'sprint'];
  const sessionViews: SessionView[] = [];
  const entityIds = new Set<string>();
  for (const s of sessions) {
    const lineSnap = await getDoc(doc(db, 'ben_lines', `${raceId}_${s}`));
    if (!lineSnap.exists()) continue;
    const lineDoc = lineSnap.data() as BenSessionDoc;
    const lines = lineDoc.entities ?? {};
    const sessionPicks = picksDoc?.picks?.[s] ?? {};
    const view: SessionView['picks'] = {};
    for (const entityId of Object.keys(lines)) {
      const line = lines[entityId];
      entityIds.add(entityId);
      const userPick = sessionPicks[entityId];
      const side = userPick?.side ?? 'with';
      view[entityId] = {
        side,
        stake: userPick?.stake ?? 0,
        result: line.result,
        outcome: line.outcome,
        won: line.outcome ? side === line.outcome : undefined,
      };
    }
    sessionViews.push({ session: s, lines, picks: view });
  }

  // Hydrate driver/constructor entities for display names + team colours.
  const allEntities = [...entityIds];
  const drivers = await dataService.getDriversByIds(allEntities);
  const constructors = await dataService.getConstructorsByIds(allEntities);
  const driverById: Record<string, Driver> = {};
  drivers.forEach((d) => (driverById[d.id] = d));
  const constructorById: Record<string, Constructor> = {};
  constructors.forEach((c) => (constructorById[c.id] = c));

  return { race, weekendScore, sessions: sessionViews, driverById, constructorById };
}

export default function ResultsScreen() {
  const t = useTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const d = await loadRecap(userId);
        if (!cancelled) setData(d);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Recap', headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text }} />
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Recap', headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text }} />
        <View style={styles.center}>
          <Text style={{ fontFamily: t.fMono, fontSize: 12, color: t.textMute, letterSpacing: 1, textTransform: 'uppercase' }}>
            No race data
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { race, weekendScore, sessions, driverById, constructorById } = data;
  const settled = !!weekendScore;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Recap', headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Hero */}
        <View style={{ paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: t.lineSoft }}>
          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.accent, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: '700' }}>
            R{String(race.round).padStart(2, '0')} · {race.country} · {settled ? 'Settled' : 'Pending'}
          </Text>
          <Text style={{ marginTop: 4, fontFamily: t.fDisp, fontSize: 26, fontWeight: '700', letterSpacing: -0.6, color: t.text }}>
            {race.name}
          </Text>
          {settled && weekendScore ? (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
              <Stat label="Points" value={String(weekendScore.points)} color={t.accent} />
              <Stat label="Cash" value={`${weekendScore.cash >= 0 ? '+' : ''}$${weekendScore.cash}`} color={weekendScore.cash >= 0 ? t.success : t.danger} />
              <Stat label="Calls" value={`${weekendScore.callsCorrect}/${weekendScore.callsTotal}`} color={t.text} />
            </View>
          ) : (
            <Text style={{ marginTop: 10, fontFamily: t.fSans, fontSize: 12, color: t.textDim, lineHeight: 18 }}>
              No weekend score yet. Run a race settlement to see your picks graded.
            </Text>
          )}
        </View>

        {/* Sessions */}
        {sessions.length === 0 ? (
          <View style={{ paddingTop: 40, alignItems: 'center' }}>
            <Text style={{ fontFamily: t.fMono, fontSize: 11, color: t.textMute, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700' }}>
              No Ben lines for this race
            </Text>
            <Text style={{ marginTop: 8, fontFamily: t.fSans, fontSize: 12, color: t.textDim, textAlign: 'center', maxWidth: 280 }}>
              Once Ben posts lines and a race settles, this screen shows every pick you made and how it landed.
            </Text>
          </View>
        ) : (
          sessions.map((view) => (
            <SessionBlock
              key={view.session}
              view={view}
              driverById={driverById}
              constructorById={constructorById}
            />
          ))
        )}

        {/* Footer actions */}
        <View style={{ marginTop: 20, gap: 8 }}>
          <Pressable
            onPress={() => router.push('/standings')}
            style={({ pressed }) => [
              {
                height: 44,
                borderRadius: 10,
                backgroundColor: t.accent,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ fontFamily: t.fMono, fontSize: 12, fontWeight: '800', color: '#0E1116', letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Standings
            </Text>
          </Pressable>
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
            <Text style={{ fontFamily: t.fMono, fontSize: 12, fontWeight: '700', color: t.text, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Back
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface }}>
      <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '700' }}>
        {label}
      </Text>
      <View style={{ marginTop: 2 }}>
        <Num size={20} weight="800" color={color}>
          {value}
        </Num>
      </View>
    </View>
  );
}

function SessionBlock({
  view,
  driverById,
  constructorById,
}: {
  view: SessionView;
  driverById: Record<string, Driver>;
  constructorById: Record<string, Constructor>;
}) {
  const t = useTheme();
  const sessionLabel = view.session === 'qualifying' ? 'Qualifying' : view.session === 'race' ? 'Race' : 'Sprint';
  const entries = useMemo(() => {
    return Object.entries(view.picks).map(([id, pick]) => {
      const line = view.lines[id];
      const driver = driverById[id];
      const team = constructorById[id];
      return { id, pick, line, driver, team };
    });
  }, [view, driverById, constructorById]);

  const totalCalls = entries.filter((e) => e.pick.outcome != null).length;
  const won = entries.filter((e) => e.pick.won).length;
  const lost = totalCalls - won;

  return (
    <View style={{ marginTop: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontFamily: t.fMono, fontSize: 11, color: t.textMute, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '700' }}>
          {sessionLabel}
        </Text>
        <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textDim, letterSpacing: 0.8 }}>
          <Text style={{ color: t.success, fontWeight: '700' }}>{won}W</Text>
          <Text style={{ color: t.textMute }}> / </Text>
          <Text style={{ color: t.danger, fontWeight: '700' }}>{lost}L</Text>
          <Text style={{ color: t.textMute }}> · {totalCalls} calls</Text>
        </Text>
      </View>
      <View style={{ gap: 6 }}>
        {entries.map(({ id, pick, line, driver, team }) => (
          <PickRow
            key={id}
            line={line}
            side={pick.side}
            stake={pick.stake}
            result={pick.result}
            outcome={pick.outcome}
            won={pick.won}
            driver={driver}
            team={team}
          />
        ))}
      </View>
    </View>
  );
}

function PickRow({
  line,
  side,
  stake,
  result,
  outcome,
  won,
  driver,
  team,
}: {
  line: BenLine;
  side: 'with' | 'against';
  stake: number;
  result?: number;
  outcome?: 'with' | 'against';
  won?: boolean;
  driver?: Driver;
  team?: Constructor;
}) {
  const t = useTheme();
  const isDriver = !!driver;
  const name = isDriver ? driver!.name : team?.name ?? line.entityId;
  const teamShort = isDriver ? (driver!.constructorName || '').slice(0, 3).toUpperCase() : team?.shortName ?? '';
  const teamColor =
    (CONSTRUCTOR_COLORS as Record<string, string>)[teamShort] || team?.primaryColor || t.accent;

  let statusColor = t.textMute;
  let statusLabel = '—';
  if (won === true) {
    statusColor = t.success;
    statusLabel = 'Won';
  } else if (won === false) {
    statusColor = t.danger;
    statusLabel = 'Lost';
  }
  void outcome;

  const odds = side === 'with' ? line.withOdds : line.againstOdds;
  const payout = won && stake > 0 ? Math.round(stake * odds) : 0;
  const cashDelta = won ? payout - stake : -stake;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 10,
        borderRadius: 10,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.line,
      }}
    >
      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: teamColor }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: t.fDisp, fontWeight: '600', fontSize: 13, color: t.text }} numberOfLines={1}>
          {name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <BenLinePill
            lo={line.predictedLo}
            hi={line.predictedHi}
            ou={line.line}
            oddsWith={line.withOdds}
            oddsAgainst={line.againstOdds}
          />
          <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 0.8 }}>
            actual {result != null ? `P${result}` : '—'}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 10,
            fontWeight: '800',
            color: side === 'against' ? t.danger : t.accent,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          {side === 'against' ? 'Against' : 'With'}
        </Text>
        <Text style={{ fontFamily: t.fMono, fontSize: 10, fontWeight: '700', color: statusColor, marginTop: 2 }}>
          {statusLabel}
        </Text>
        {stake > 0 ? (
          <Text style={{ fontFamily: t.fMono, fontSize: 10, fontWeight: '700', color: cashDelta >= 0 ? t.success : t.danger, marginTop: 2 }}>
            {cashDelta >= 0 ? '+' : ''}${cashDelta}
          </Text>
        ) : (
          <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, marginTop: 2 }}>free</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
