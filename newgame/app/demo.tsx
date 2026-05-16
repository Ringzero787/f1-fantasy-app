// Demo / Debug screen — shortcut buttons to exercise every flow without
// having to wait for race weekends, accumulate cash, or finesse Firestore by hand.

import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, deleteDoc, doc, getDoc, getDocs, increment, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuthStore } from '@store/auth.store';
import { useGarageStore } from '@store/garage.store';
import { useShopStore } from '@store/shop.store';
import { useInsuranceStore } from '@store/insurance.store';
import { useBetsStore } from '@store/bets.store';
import { authService } from '@services/auth.service';
import { garageService } from '@services/garage.service';
import { dataService } from '@services/data.service';
import { picksService } from '@services/picks.service';
import { useTheme } from '@/theme';
import { SectionLabel } from '@components/tl';
import { SESSION_WEIGHT } from '@/types';
import type { BenLine, BenSessionDoc, SessionKey, BenSide } from '@/types';

export default function DemoScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const refreshGarage = useGarageStore((s) => s.refresh);
  const resetGarage = useGarageStore((s) => s.reset);
  const resetShop = useShopStore((s) => s.reset);
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]}>
        <Stack.Screen options={{ title: 'Demo' }} />
        <Text style={{ padding: 20, color: t.text }}>Sign in first.</Text>
      </SafeAreaView>
    );
  }

  const wrap = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      Alert.alert(`${label} failed`, err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const resetOnboarding = () =>
    wrap('Reset onboarding', async () => {
      await updateDoc(doc(db, 'tl_users', user.id), {
        hasOnboarded: false,
        updatedAt: serverTimestamp(),
      });
      setUser({ ...user, hasOnboarded: false });
      router.replace('/onboarding');
    });

  const rerollGarage = () =>
    wrap('Re-roll garage', async () => {
      // Wipe transaction subcollection so initial roll can record fresh.
      const txSnap = await getDocs(collection(db, 'tl_garages', user.id, 'transactions'));
      await Promise.all(txSnap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'tl_garages', user.id));
      resetGarage();
      resetShop();
      const fresh = await garageService.performInitialRoll(user.id);
      useGarageStore.setState({ garage: fresh });
    });

  const addCash = (amount: number) =>
    wrap(`Add $${amount}`, async () => {
      await updateDoc(doc(db, 'tl_garages', user.id), {
        cash: increment(amount),
        totalCashEarned: increment(amount),
        updatedAt: serverTimestamp(),
      });
      await refreshGarage(user.id);
    });

  const mockRaceFinish = () =>
    wrap('Mock race finish', async () => {
      // Write a synthetic tl_scores entry for the latest race using whatever
      // drivers/constructors the user owns. The Cloud Function would normally do
      // this; we fake it client-side so the Results screen has something to render.
      const race = await dataService.getUpcomingRace();
      if (!race) throw new Error('No upcoming race in catalog to use as target');
      const garage = useGarageStore.getState().garage;
      if (!garage) throw new Error('Load your garage first');
      const drivers = await dataService.getDriversByIds(garage.rosteredDriverIds.slice(0, 2));
      const constructors = await dataService.getConstructorsByIds(garage.rosteredConstructorIds.slice(0, 1));
      const fakePoints = 87;
      const fakeCash = 42;
      // tl_scores is rule-locked to server writes. Skip the score write and just
      // bump the garage to simulate a settled race weekend.
      await updateDoc(doc(db, 'tl_garages', user.id), {
        cash: increment(fakeCash),
        totalPoints: increment(fakePoints),
        totalCashEarned: increment(fakeCash),
        raceWinStreak: increment(1),
        lastStreakRaceId: race.id,
        updatedAt: serverTimestamp(),
      });
      await refreshGarage(user.id);
      Alert.alert(
        'Mock race finish applied',
        `+${fakePoints} pts · +$${fakeCash}\nStarted: ${drivers.map((d) => d.shortName).join(', ')}, ${constructors[0]?.shortName ?? '—'}`
      );
    });

  const seedBenLines = () =>
    wrap('Seed Ben lines', async () => {
      // Writes placeholder ben_lines docs for the upcoming race so the new
      // betting strip UI has something to render before Ben's pipeline is live.
      // NB: requires admin-only write rule disabled or a temporary client write;
      // currently the rule denies client writes — this will surface a
      // "permission denied" error in production, which is intentional.
      const race = await dataService.getUpcomingRace();
      if (!race) throw new Error('No upcoming race');
      const garage = useGarageStore.getState().garage;
      if (!garage) throw new Error('Garage not loaded');
      const drivers = await dataService.getDriversByIds(garage.rosteredDriverIds);
      const constructors = await dataService.getConstructorsByIds(garage.rosteredConstructorIds);
      const sessions = ['qualifying', 'race'] as const;
      for (const s of sessions) {
        const entities: Record<string, unknown> = {};
        drivers.forEach((d, i) => {
          entities[d.id] = {
            entityId: d.id,
            entityKind: 'driver',
            line: 3.5 + i * 2,
            withOdds: 1.91,
            againstOdds: 1.91,
          };
        });
        constructors.forEach((c, i) => {
          entities[c.id] = {
            entityId: c.id,
            entityKind: 'constructor',
            line: 12.5 + i * 3,
            withOdds: 1.95,
            againstOdds: 1.85,
          };
        });
        await setDoc(doc(db, 'ben_lines', `${race.id}_${s}`), {
          raceId: race.id,
          session: s,
          entities,
          posted: true,
          postedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      Alert.alert(
        'Seeded',
        `Ben lines written for ${race.name} (qualifying + race). Lineup tab should now show betting strips.`
      );
    });

  const mockSettleRace = () =>
    wrap('Mock settle race', async () => {
      // Fabricates results for each line, decides outcomes, settles the current
      // user's picks client-side, and writes weekend + season scores. Mirrors
      // tlSettleWeekend's math without needing the admin-only Cloud Function.
      const race = await dataService.getUpcomingRace();
      if (!race) throw new Error('No upcoming race');
      const garage = useGarageStore.getState().garage;
      if (!garage) throw new Error('Garage not loaded');

      const sessions: SessionKey[] = ['qualifying', 'race', 'sprint'];
      let weekendPoints = 0;
      let weekendCash = 0;
      let callsCorrect = 0;
      let callsTotal = 0;

      const picks = await picksService.getOrCreate(user.id, race.id);

      for (const session of sessions) {
        const snap = await getDoc(doc(db, 'ben_lines', `${race.id}_${session}`));
        if (!snap.exists()) continue;
        const sessionDoc = { id: snap.id, ...snap.data() } as BenSessionDoc;
        const weight = SESSION_WEIGHT[session];

        // Fabricate random finishing positions for every entity and decide
        // outcomes. Drivers: 1-22; constructors: sum 5-40.
        const updatedEntities: Record<string, BenLine> = { ...sessionDoc.entities };
        for (const [entityId, line] of Object.entries(updatedEntities)) {
          const isDriver = line.entityKind === 'driver';
          const result = isDriver
            ? Math.floor(Math.random() * 22) + 1
            : Math.floor(Math.random() * 36) + 5;
          const isInteger = line.line % 1 === 0;
          const outcome: BenSide | 'push' =
            isInteger && result === line.line ? 'push' : result <= line.line ? 'with' : 'against';
          updatedEntities[entityId] = { ...line, result, outcome };
        }
        await updateDoc(doc(db, 'ben_lines', `${race.id}_${session}`), {
          entities: updatedEntities,
          settledAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Settle each pick in this session for the current user.
        const sessionPicks = picks.picks?.[session] ?? {};
        for (const [entityId, p] of Object.entries(sessionPicks)) {
          const line = updatedEntities[entityId];
          if (!line || line.result == null || line.outcome == null) continue;
          callsTotal++;
          if (line.outcome === 'push') {
            // Push: stake refunded, no points credit, cash delta = 0.
            continue;
          }
          const won = p.side === line.outcome;
          if (won) {
            callsCorrect++;
            const odds = p.side === 'with' ? line.withOdds : line.againstOdds;
            const payout = Math.round(p.stake * odds);
            weekendCash += payout - p.stake;
            weekendPoints += weight;
          } else {
            weekendCash -= p.stake;
          }
        }

        // Account for unstaked WITH-Ben defaults that won — they still score
        // player points even though there's no pick doc entry. Drivers/constructors
        // the user didn't explicitly set a pick for default to WITH/$0.
        const rosterIds = [...garage.rosteredDriverIds, ...garage.rosteredConstructorIds];
        for (const entityId of rosterIds) {
          if (sessionPicks[entityId]) continue; // already counted above
          const line = updatedEntities[entityId];
          if (!line || line.outcome == null) continue;
          callsTotal++;
          if (line.outcome === 'push') continue;
          if (line.outcome === 'with') {
            // Default WITH pick won — score the credit even without a stake.
            callsCorrect++;
            weekendPoints += weight;
          }
        }
      }

      const cashDelta = Math.round(weekendCash * 100) / 100;
      const pointsTotal = Math.round(weekendPoints * 100) / 100;

      // Write the settled fields on the picks doc.
      await updateDoc(doc(db, 'tl_picks', `${user.id}_${race.id}`), {
        settled: true,
        settledAt: serverTimestamp(),
        weekendPoints: pointsTotal,
        weekendCash: cashDelta,
        callsCorrect,
        callsTotal,
      });

      // Weekend score → leaderboard.
      await setDoc(doc(db, 'tl_weekend_scores', `${user.id}_${race.id}`), {
        userId: user.id,
        displayName: user.displayName,
        raceId: race.id,
        seasonId: race.seasonId,
        round: race.round,
        points: pointsTotal,
        cash: cashDelta,
        callsCorrect,
        callsTotal,
        createdAt: serverTimestamp(),
      });

      // Season totals (incremental).
      await setDoc(
        doc(db, 'tl_season_scores', `${user.id}_${race.seasonId}`),
        {
          userId: user.id,
          displayName: user.displayName,
          seasonId: race.seasonId,
          totalPoints: increment(pointsTotal),
          totalCash: increment(cashDelta),
          callsCorrect: increment(callsCorrect),
          callsTotal: increment(callsTotal),
          weekendsScored: increment(1),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Apply cash to garage.
      if (cashDelta !== 0) {
        await updateDoc(doc(db, 'tl_garages', user.id), {
          cash: increment(cashDelta),
          totalCashEarned: increment(Math.max(0, cashDelta)),
          updatedAt: serverTimestamp(),
        });
        await refreshGarage(user.id);
      }

      Alert.alert(
        'Race settled',
        `${callsCorrect}/${callsTotal} calls correct · ${pointsTotal} pts · ${cashDelta >= 0 ? '+' : ''}$${cashDelta} cash. Standings + Results screen should populate.`
      );
    });

  const probeBetsPermission = () =>
    wrap('Probe bets permission', async () => {
      const race = await dataService.getUpcomingRace();
      if (!race) throw new Error('No upcoming race');
      const id = `${user.id}_${race.id}_probe`;
      try {
        await setDoc(
          doc(db, 'tl_bets', id),
          {
            userId: user.id,
            raceId: race.id,
            totalStaked: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await deleteDoc(doc(db, 'tl_bets', id));
        Alert.alert('OK', 'tl_bets create + delete succeeded.');
      } catch (err) {
        Alert.alert(
          'tl_bets write rejected',
          err instanceof Error ? err.message : String(err)
        );
      }
    });

  const clearLocalState = () =>
    wrap('Clear local stores', async () => {
      resetGarage();
      resetShop();
      useInsuranceStore.setState({ byRaceId: {} });
      useBetsStore.setState({ byRaceId: {} });
      Alert.alert('Cleared', 'In-memory stores cleared. App will refetch on next render.');
    });

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]}>
      <Stack.Screen options={{ title: 'Demo & Debug', headerStyle: { backgroundColor: t.bg } }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 11, letterSpacing: 1, marginBottom: 16 }}>
          Signed in as {user.email}{'\n'}uid: {user.id}
        </Text>

        <SectionLabel>Wizard</SectionLabel>
        <Group>
          <Btn label="Replay onboarding wizard" sub="Flip hasOnboarded=false and route" onPress={resetOnboarding} disabled={busy} />
          <Btn label="Re-roll garage from scratch" sub="Deletes tl_garages doc + transactions, then rolls" onPress={rerollGarage} disabled={busy} />
        </Group>

        <SectionLabel>Economy</SectionLabel>
        <Group>
          <Btn label="Add $250 cash" onPress={() => addCash(250)} disabled={busy} />
          <Btn label="Add $1000 cash" onPress={() => addCash(1000)} disabled={busy} />
          <Btn label="Add $5000 cash" onPress={() => addCash(5000)} disabled={busy} />
        </Group>

        <SectionLabel>Race weekend</SectionLabel>
        <Group>
          <Btn label="Seed Ben lines for upcoming race" sub="Writes placeholder O/U lines for Q + R so the betting UI has data" onPress={seedBenLines} disabled={busy} />
          <Btn label="Mock-settle the race" sub="Fabricates results, settles your picks, writes weekend + season scores" onPress={mockSettleRace} disabled={busy} />
          <Btn label="Apply mock race finish (legacy)" sub="+87 pts, +$42 to garage; updates streak" onPress={mockRaceFinish} disabled={busy} />
          <Btn label="Open Standings" onPress={() => router.push('/standings')} disabled={busy} />
          <Btn label="Open Results screen" onPress={() => router.push('/results')} disabled={busy} />
        </Group>

        <SectionLabel>Diagnostics</SectionLabel>
        <Group>
          <Btn label="Probe bet write permission" sub="Round-trips a tl_bets create+delete; shows the rule error" onPress={probeBetsPermission} disabled={busy} />
          <Btn label="Clear in-memory stores" onPress={clearLocalState} disabled={busy} />
          <Btn label="Open Onboarding screen (no flag flip)" onPress={() => router.push('/onboarding')} disabled={busy} />
          <Btn label="Open Store" onPress={() => router.push('/store')} disabled={busy} />
        </Group>

        <View style={{ height: 12 }} />
        <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 10, lineHeight: 16, letterSpacing: 0.4 }}>
          Tip: actions here write to the live Firestore project. Use a test account.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: t.line,
        marginHorizontal: 4,
        marginBottom: 14,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function Btn({
  label,
  sub,
  onPress,
  disabled,
}: {
  label: string;
  sub?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          paddingVertical: 13,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: t.lineSoft,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={{ fontFamily: t.fSans, fontSize: 14, fontWeight: '600', color: t.text }}>{label}</Text>
      {sub ? (
        <Text style={{ marginTop: 2, fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 0.3 }}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
