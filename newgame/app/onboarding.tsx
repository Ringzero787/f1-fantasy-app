// Opening wizard — three stages.
//
//   1. Welcome    — "Beat Ben's book." Explain WITH / AGAINST. Show the toggle.
//   2. Roll       — single roll of 4 drivers + 2 constructors. 3 macro re-rolls.
//   3. Done       — "Garage open." Hands off to the lineup tab.
//
// Mechanics: ROLL_BUDGET defines max spend. Each entity is selected weighted
// by price so a balanced mix shows up. Whatever's left over becomes the
// player's starting cash. commitRoll persists the chosen IDs as both owned
// and rostered.

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@store/auth.store';
import { authService } from '@services/auth.service';
import { garageService, garageConfig } from '@services/garage.service';
import { dataService } from '@services/data.service';
import { useGarageStore } from '@store/garage.store';
import { pickN, rollInitialDriverMix } from '@utils/rarity';
import { useTheme } from '@/theme';
import { CONSTRUCTOR_COLORS } from '@/theme/tokens';
import { TierChip, PrimaryBtn, Num, WithAgainstToggle } from '@components/tl';
import type { Driver, Constructor } from '@/types';

const WORDMARK_WHITE = require('../assets/wordmark-white.png');
const WORDMARK_BLACK = require('../assets/wordmark-black.png');

const DRIVER_SLOTS = garageConfig.ROSTER_DRIVER_SLOTS; // 4
const CONSTRUCTOR_SLOTS = garageConfig.ROSTER_CONSTRUCTOR_SLOTS; // 2
const BUDGET = garageConfig.ROLL_BUDGET; // $1000
const MACRO_REROLLS = 3; // user wants three re-rolls now

type Stage = 'welcome' | 'roll' | 'done';

interface Hand {
  drivers: Driver[];
  constructors: Constructor[];
}

function spent(hand: Hand): number {
  const d = hand.drivers.reduce((s, x) => s + (x.price ?? 0), 0);
  const c = hand.constructors.reduce((s, x) => s + (x.price ?? 0), 0);
  return Math.round(d + c);
}

function budgetLeft(hand: Hand): number {
  return Math.max(0, BUDGET - spent(hand));
}

// Single-roll selection that mirrors the legacy garage initial roll: A/B/C
// tier mix is randomized per session, picks within a tier weighted by price.
function rollHand(allDrivers: Driver[], allConstructors: Constructor[]): Hand {
  const mix = rollInitialDriverMix();
  const aTier = allDrivers.filter((d) => d.tier === 'A');
  const bTier = allDrivers.filter((d) => d.tier === 'B');
  const cTier = allDrivers.filter((d) => d.tier === 'C');
  const pickFromTier = (pool: Driver[], n: number, fallback: Driver[]) => {
    const picked = pickN(pool, n, (d) => d.price + 1);
    const remaining = n - picked.length;
    if (remaining > 0) {
      const fb = fallback.filter((d) => !picked.find((p) => p.id === d.id));
      picked.push(...pickN(fb, remaining, (d) => d.price + 1));
    }
    return picked;
  };
  const drivers = [
    ...pickFromTier(aTier, mix.a, [...bTier, ...cTier]),
    ...pickFromTier(bTier, mix.b, [...aTier, ...cTier]),
    ...pickFromTier(cTier, mix.c, [...bTier, ...aTier]),
  ].slice(0, DRIVER_SLOTS);
  const constructors = pickN(allConstructors, CONSTRUCTOR_SLOTS, (c) => Math.max(c.price, 5));
  return { drivers, constructors };
}

export default function OnboardingScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [stage, setStage] = useState<Stage>('welcome');
  const [submitting, setSubmitting] = useState(false);
  const [allDrivers, setAllDrivers] = useState<Driver[] | null>(null);
  const [allConstructors, setAllConstructors] = useState<Constructor[] | null>(null);
  const [hand, setHand] = useState<Hand | null>(null);
  const [rerollsLeft, setRerollsLeft] = useState(MACRO_REROLLS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, c] = await Promise.all([dataService.getActiveDrivers(), dataService.getActiveConstructors()]);
        if (!cancelled) {
          setAllDrivers(d);
          setAllConstructors(c);
        }
      } catch {
        // ignore — UI will show "loading…" indefinitely if data fetch fails
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // First entry into roll stage: deal a hand.
  useEffect(() => {
    if (stage !== 'roll') return;
    if (hand) return;
    if (!allDrivers || !allConstructors) return;
    setHand(rollHand(allDrivers, allConstructors));
  }, [stage, hand, allDrivers, allConstructors]);

  const onReroll = () => {
    if (rerollsLeft <= 0 || !allDrivers || !allConstructors) return;
    Vibration.vibrate([0, 30, 50, 30]);
    setHand(rollHand(allDrivers, allConstructors));
    setRerollsLeft((n) => n - 1);
  };

  const onLockIn = async () => {
    if (!hand || !user) return;
    setSubmitting(true);
    try {
      const driverIds = hand.drivers.map((d) => d.id);
      const constructorIds = hand.constructors.map((c) => c.id);
      await garageService.commitRoll(user.id, driverIds, constructorIds, budgetLeft(hand));
      await useGarageStore.getState().loadOrInitialize(user.id);
      await authService.markOnboarded(user.id);
      setUser({ ...user, hasOnboarded: true });
      setStage('done');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('commitRoll failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      {stage === 'welcome' ? <WelcomeStage onNext={() => setStage('roll')} /> : null}
      {stage === 'roll' ? (
        <RollStage
          hand={hand}
          rerollsLeft={rerollsLeft}
          onReroll={onReroll}
          onLockIn={onLockIn}
          submitting={submitting}
        />
      ) : null}
      {stage === 'done' ? <DoneStage onContinue={() => router.replace('/(tabs)')} /> : null}
    </SafeAreaView>
  );
}

// ---------- Welcome ----------

function WelcomeStage({ onNext }: { onNext: () => void }) {
  const t = useTheme();
  const [demoSide, setDemoSide] = useState<'with' | 'against'>('with');
  return (
    <View style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 32, justifyContent: 'space-between' }}>
      <View>
        <Image source={t.dark ? WORDMARK_WHITE : WORDMARK_BLACK} style={{ height: 22, width: 140, resizeMode: 'contain' }} />
        <Text
          style={{
            marginTop: 32,
            fontFamily: t.fMono,
            fontSize: 11,
            color: t.accent,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            fontWeight: '700',
          }}
        >
          Welcome, strategist
        </Text>
        <Text
          style={{
            marginTop: 12,
            fontFamily: t.fDisp,
            fontWeight: '700',
            fontSize: 40,
            lineHeight: 42,
            letterSpacing: -1.2,
            color: t.text,
          }}
        >
          Beat Ben's{'\n'}book.
        </Text>
        <Text style={{ marginTop: 18, fontFamily: t.fSans, fontSize: 14.5, color: t.textDim, lineHeight: 22 }}>
          Ben — our bookmaker — sets an over/under line on every driver and constructor. You're WITH Ben by default. Tap to flip AGAINST if you think he's wrong.
        </Text>

        {/* Live toggle demo */}
        <View
          style={{
            marginTop: 22,
            padding: 14,
            borderRadius: 12,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.line,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: t.fMono, fontSize: 9, fontWeight: '800', color: demoSide === 'with' ? t.accent : t.danger, letterSpacing: 1, textTransform: 'uppercase' }}>
              {demoSide === 'with' ? 'Verstappen · with Ben' : 'Verstappen · against Ben'}
            </Text>
            <Text
              style={{
                marginTop: 4,
                fontFamily: t.fSans,
                fontSize: 12,
                color: t.textDim,
                lineHeight: 17,
              }}
            >
              Ben says: finishes under P3.5. You{' '}
              <Text style={{ color: t.text, fontWeight: '700' }}>
                {demoSide === 'with' ? 'agree' : 'disagree'}
              </Text>
              . Tap the toggle to see how it feels.
            </Text>
          </View>
          <WithAgainstToggle side={demoSide} onFlip={() => setDemoSide((s) => (s === 'with' ? 'against' : 'with'))} />
        </View>

        <Text style={{ marginTop: 18, fontFamily: t.fSans, fontSize: 13.5, color: t.textDim, lineHeight: 20 }}>
          Stake real virtual cash if you're confident — or play free, points still count either way. Roll your starting hand next: <Text style={{ color: t.text, fontWeight: '700' }}>4 drivers + 2 constructors</Text>, up to ${BUDGET}. You can buy more in the shop later.
        </Text>
      </View>

      <PrimaryBtn title="Roll my opening hand" onPress={onNext} />
    </View>
  );
}

// ---------- Roll ----------

function RollStage({
  hand,
  rerollsLeft,
  onReroll,
  onLockIn,
  submitting,
}: {
  hand: Hand | null;
  rerollsLeft: number;
  onReroll: () => void;
  onLockIn: () => void;
  submitting: boolean;
}) {
  const t = useTheme();
  // Subtle fade-in for the whole hand on each roll.
  const fade = useRef(new Animated.Value(0)).current;
  const key = hand
    ? [...hand.drivers.map((d) => d.id), ...hand.constructors.map((c) => c.id)].join('|')
    : 'empty';
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [fade, key]);

  if (!hand) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const remaining = budgetLeft(hand);
  const pct = Math.max(0, Math.min(1, remaining / BUDGET));

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 }}>
      {/* Header: title left, bankroll right */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 4, marginBottom: 10 }}>
        <View>
          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.accent, letterSpacing: 1.6, fontWeight: '700', textTransform: 'uppercase' }}>
            The opening roll
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontFamily: t.fDisp,
              fontSize: 22,
              fontWeight: '700',
              letterSpacing: -0.6,
              color: t.text,
            }}
          >
            Six picks. {rerollsLeft} re-roll{rerollsLeft === 1 ? '' : 's'}.
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '700' }}>
            Bankroll
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
            <Text style={{ fontFamily: t.fDisp, fontSize: 14, color: t.textDim, fontWeight: '500' }}>$</Text>
            <Num size={30} weight="800">
              {remaining}
            </Num>
          </View>
        </View>
      </View>

      {/* Budget bar */}
      <View style={{ height: 4, borderRadius: 2, backgroundColor: t.surface2, overflow: 'hidden', marginBottom: 14 }}>
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: pct > 0.5 ? t.accent : pct > 0.2 ? t.warn : t.danger }} />
      </View>

      {/* Hand — drivers (2x2) + constructors (1x2) */}
      <Animated.View style={{ flex: 1, opacity: fade, gap: 8 }}>
        <View style={{ flex: 3, gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
            <HandTile kind="D" item={hand.drivers[0]} />
            <HandTile kind="D" item={hand.drivers[1]} />
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
            <HandTile kind="D" item={hand.drivers[2]} />
            <HandTile kind="D" item={hand.drivers[3]} />
          </View>
        </View>
        <View style={{ flex: 1.4, flexDirection: 'row', gap: 8 }}>
          <HandTile kind="C" item={hand.constructors[0]} />
          <HandTile kind="C" item={hand.constructors[1]} />
        </View>
      </Animated.View>

      {/* Actions */}
      <View style={{ gap: 8, marginTop: 12 }}>
        <Pressable
          onPress={onReroll}
          disabled={rerollsLeft <= 0 || submitting}
          style={({ pressed }) => [
            {
              height: 44,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: t.accent,
              backgroundColor: t.surface2,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: rerollsLeft <= 0 ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={{ fontSize: 16, color: t.accent }}>↻</Text>
          <Text style={{ fontFamily: t.fMono, fontSize: 12, fontWeight: '700', color: t.accent, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            {rerollsLeft > 0 ? `Re-roll the deck (${rerollsLeft})` : 'No re-rolls left'}
          </Text>
        </Pressable>
        <PrimaryBtn title={submitting ? 'Locking…' : 'Lock it in'} onPress={onLockIn} disabled={submitting} />
        <Text
          style={{
            textAlign: 'center',
            fontFamily: t.fMono,
            fontSize: 9,
            color: t.textMute,
            letterSpacing: 0.6,
          }}
        >
          Leftover bankroll = your starting cash for the shop.
        </Text>
      </View>
    </View>
  );
}

function HandTile({ kind, item }: { kind: 'D' | 'C'; item: Driver | Constructor | undefined }) {
  const t = useTheme();
  if (!item) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: t.surface2,
          borderRadius: 14,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: t.line,
        }}
      />
    );
  }
  const isDriver = kind === 'D';
  const driver = isDriver ? (item as Driver) : null;
  const constructor = isDriver ? null : (item as Constructor);
  const teamShort = isDriver ? (driver!.constructorName || '').slice(0, 3).toUpperCase() : constructor!.shortName;
  const teamColor = (CONSTRUCTOR_COLORS as Record<string, string>)[teamShort] || constructor?.primaryColor || t.accent;
  const tier = isDriver ? driver!.tier : ('B' as const);
  const isATier = tier === 'A';
  const number = isDriver ? driver!.number ?? null : null;
  const cost = item.price ?? 0;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.surface,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: isATier ? t.tierAEdge : t.line,
        overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: isDriver ? 5 : 46, backgroundColor: teamColor }} />
      {isDriver && number != null ? (
        <Text
          style={{
            position: 'absolute',
            right: -6,
            top: 0,
            fontFamily: t.fDisp,
            fontWeight: '800',
            fontSize: 160,
            lineHeight: 150,
            color: teamColor,
            opacity: 0.18,
            letterSpacing: -6,
          }}
        >
          {number}
        </Text>
      ) : null}
      <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
        <TierChip tier={tier} />
      </View>
      <Text
        style={{
          position: 'absolute',
          left: 12,
          top: isDriver ? 12 : 60,
          fontFamily: t.fMono,
          fontSize: 10,
          fontWeight: '800',
          color: isDriver ? teamColor : t.textDim,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        }}
        numberOfLines={1}
      >
        {isDriver ? driver!.constructorName : 'Constructor'}
      </Text>
      {!isDriver ? (
        <Text
          style={{
            position: 'absolute',
            left: 12,
            top: 14,
            fontFamily: t.fMono,
            fontSize: 12,
            fontWeight: '800',
            color: '#0E1116',
            letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
        >
          {constructor!.shortName}
        </Text>
      ) : null}
      <View style={{ position: 'absolute', left: 12, right: 12, bottom: 36 }}>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 11,
            color: t.textDim,
            letterSpacing: 1.2,
            fontWeight: '700',
          }}
        >
          {isDriver ? driver!.shortName : constructor!.shortName}
        </Text>
        <Text
          style={{
            marginTop: 2,
            fontFamily: t.fDisp,
            fontWeight: '700',
            fontSize: 16,
            color: t.text,
            letterSpacing: -0.4,
            lineHeight: 18,
          }}
          numberOfLines={2}
        >
          {isDriver ? driver!.name : constructor!.name}
        </Text>
      </View>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 30,
          backgroundColor: t.bg,
          borderTopWidth: 1,
          borderTopColor: t.line,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 10,
        }}
      >
        <Text style={{ fontFamily: t.fMono, fontSize: 8, fontWeight: '700', color: t.textMute, letterSpacing: 1.4, textTransform: 'uppercase' }}>
          Cost
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
          <Text style={{ fontFamily: t.fDisp, fontSize: 11, color: t.textDim, fontWeight: '500' }}>−$</Text>
          <Num size={17} weight="800" color={t.danger}>
            {cost}
          </Num>
        </View>
      </View>
    </View>
  );
}

// ---------- Done ----------

function DoneStage({ onContinue }: { onContinue: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 40, justifyContent: 'space-between' }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 11,
            color: t.accent,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            fontWeight: '700',
          }}
        >
          Hand locked
        </Text>
        <Text
          style={{
            marginTop: 14,
            fontFamily: t.fDisp,
            fontWeight: '700',
            fontSize: 40,
            letterSpacing: -1.2,
            lineHeight: 42,
            color: t.text,
          }}
        >
          You're on the grid.
        </Text>
        <Text style={{ marginTop: 18, fontFamily: t.fSans, fontSize: 14.5, color: t.textDim, lineHeight: 22, maxWidth: 290 }}>
          Your roster's set. Head to the Lineup tab to make your picks — WITH or AGAINST Ben for every driver and constructor.
        </Text>
      </View>
      <PrimaryBtn title="Make my first picks" onPress={onContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
