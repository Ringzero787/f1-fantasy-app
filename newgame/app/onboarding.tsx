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
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { CONSTRUCTOR_COLORS } from '@/theme/tokens';
import { TierChip, PrimaryBtn, Num, WithAgainstToggle } from '@components/tl';
import type { Driver, Constructor } from '@/types';

const WORDMARK_WHITE = require('../assets/wordmark-white.png');
const WORDMARK_BLACK = require('../assets/wordmark-black.png');

const DRIVER_SLOTS = garageConfig.ROSTER_DRIVER_SLOTS; // 4
const CONSTRUCTOR_SLOTS = garageConfig.ROSTER_CONSTRUCTOR_SLOTS; // 2
const STARTING_CASH = garageConfig.ROLL_STARTING_CASH; // $100 flat
const MACRO_REROLLS = garageConfig.ROLL_MACRO_REROLLS; // 3 re-rolls

// Shake/rattle timing. SHAKE_DURATION is total wall-clock; PIP_INTERVAL is
// how often the die face cycles during shake (drives the visible rattle).
const SHAKE_DURATION = 1500;
const PIP_INTERVAL = 80;

type Stage = 'welcome' | 'roll' | 'done';

interface Hand {
  drivers: Driver[];
  constructors: Constructor[];
}

function handCost(hand: Hand): number {
  const d = hand.drivers.reduce((s, x) => s + (x.price ?? 0), 0);
  const c = hand.constructors.reduce((s, x) => s + (x.price ?? 0), 0);
  return Math.round(d + c);
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

  // RollStage manages its own shaking phase + start gate; we hand it the pools
  // and a setter to receive the settled hand. No auto-deal — first hand comes
  // from a die tap.
  const startRollAndDeal = (cb: (h: Hand) => void) => {
    if (!allDrivers || !allConstructors) return;
    cb(rollHand(allDrivers, allConstructors));
  };

  const onReroll = (cb: () => void) => {
    if (rerollsLeft <= 0) return;
    setRerollsLeft((n) => n - 1);
    cb();
  };

  const onLockIn = async () => {
    if (!hand || !user) return;
    setSubmitting(true);
    try {
      const driverIds = hand.drivers.map((d) => d.id);
      const constructorIds = hand.constructors.map((c) => c.id);
      // Flat $100 starting bankroll — roll itself isn't budget-constrained.
      await garageService.commitRoll(user.id, driverIds, constructorIds, STARTING_CASH);
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
          ready={!!allDrivers && !!allConstructors}
          rerollsLeft={rerollsLeft}
          onDeal={(cb) => startRollAndDeal((h) => { setHand(h); cb && cb(); })}
          onUseReroll={() => onReroll(() => undefined)}
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
          Stake real virtual cash if you're confident — or play free, points still count either way. Roll your starting hand next: <Text style={{ color: t.text, fontWeight: '700' }}>4 drivers + 2 constructors</Text>. You start with <Text style={{ color: t.text, fontWeight: '700' }}>${STARTING_CASH}</Text> to spend in the shop.
        </Text>
      </View>

      <PrimaryBtn title="Roll my opening hand" onPress={onNext} />
    </View>
  );
}

// ---------- Roll ----------

type RollPhase = 'idle' | 'shaking' | 'showing';

function RollStage({
  hand,
  ready,
  rerollsLeft,
  onDeal,
  onUseReroll,
  onLockIn,
  submitting,
}: {
  hand: Hand | null;
  ready: boolean;
  rerollsLeft: number;
  onDeal: (then?: () => void) => void;
  onUseReroll: () => void;
  onLockIn: () => void;
  submitting: boolean;
}) {
  const t = useTheme();
  const { isTablet } = useDeviceLayout();
  const [phase, setPhase] = useState<RollPhase>(hand ? 'showing' : 'idle');
  const [diceFace, setDiceFace] = useState(6);

  // Master screen-shake value (drives both root translateX and Y).
  const shakeX = useRef(new Animated.Value(0)).current;
  const shakeY = useRef(new Animated.Value(0)).current;
  // Idle pulse on the deck-call dice (subtle vertical bob).
  const idleBob = useRef(new Animated.Value(0)).current;

  // Hand fade-in
  const fade = useRef(new Animated.Value(0)).current;
  const handKey = hand
    ? [...hand.drivers.map((d) => d.id), ...hand.constructors.map((c) => c.id)].join('|')
    : 'empty';
  useEffect(() => {
    if (phase !== 'showing') return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [fade, handKey, phase]);

  // Idle bob loop while waiting for tap
  useEffect(() => {
    if (phase !== 'idle') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(idleBob, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(idleBob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, idleBob]);

  const startRattle = () => {
    if (!ready || phase === 'shaking') return;
    setPhase('shaking');

    // Compose a rapid, rough screen-shake. translateX swings ±10–14, translateY
    // half that — looks like the phone is being rolled in the palm.
    const xSeq = Animated.sequence(
      Array.from({ length: 14 }).map((_, i) => {
        const sign = i % 2 === 0 ? 1 : -1;
        const decay = 1 - (i / 18);
        return Animated.timing(shakeX, {
          toValue: sign * 14 * decay,
          duration: 70 + Math.random() * 30,
          easing: Easing.inOut(Easing.linear),
          useNativeDriver: true,
        });
      }).concat([Animated.timing(shakeX, { toValue: 0, duration: 80, useNativeDriver: true })])
    );
    const ySeq = Animated.sequence(
      Array.from({ length: 14 }).map((_, i) => {
        const sign = i % 2 === 0 ? -1 : 1;
        const decay = 1 - (i / 18);
        return Animated.timing(shakeY, {
          toValue: sign * 7 * decay,
          duration: 70 + Math.random() * 30,
          easing: Easing.inOut(Easing.linear),
          useNativeDriver: true,
        });
      }).concat([Animated.timing(shakeY, { toValue: 0, duration: 80, useNativeDriver: true })])
    );
    Animated.parallel([xSeq, ySeq]).start();

    // Haptic rattle that overlaps the shake.
    Vibration.vibrate([0, 35, 60, 35, 60, 35, 60, 35, 60, 35, 60, 50]);

    // Cycle the die face every ~80ms during shake.
    const tick = setInterval(() => {
      setDiceFace((f) => {
        let next = f;
        while (next === f) next = 1 + Math.floor(Math.random() * 6);
        return next;
      });
    }, PIP_INTERVAL);

    // Settle after SHAKE_DURATION — request a new hand, show it.
    setTimeout(() => {
      clearInterval(tick);
      onDeal(() => {
        setPhase('showing');
        Vibration.vibrate(20);
      });
    }, SHAKE_DURATION);
  };

  const onReroll = () => {
    if (rerollsLeft <= 0 || phase === 'shaking') return;
    onUseReroll();
    // Drop back to shaking immediately for the visual moment.
    setPhase('shaking');
    setTimeout(() => startRattleInternal(), 30);
  };

  // Splits startRattle into a runnable pass that doesn't gate on phase==='idle'.
  const startRattleInternal = () => {
    // Reuse the same animation pipeline as startRattle. Cheap to duplicate; we
    // could refactor but readability wins for a one-off ceremony.
    Animated.parallel([
      Animated.sequence(
        Array.from({ length: 14 }).map((_, i) => {
          const sign = i % 2 === 0 ? 1 : -1;
          const decay = 1 - (i / 18);
          return Animated.timing(shakeX, {
            toValue: sign * 14 * decay,
            duration: 70 + Math.random() * 30,
            easing: Easing.inOut(Easing.linear),
            useNativeDriver: true,
          });
        }).concat([Animated.timing(shakeX, { toValue: 0, duration: 80, useNativeDriver: true })])
      ),
      Animated.sequence(
        Array.from({ length: 14 }).map((_, i) => {
          const sign = i % 2 === 0 ? -1 : 1;
          const decay = 1 - (i / 18);
          return Animated.timing(shakeY, {
            toValue: sign * 7 * decay,
            duration: 70 + Math.random() * 30,
            easing: Easing.inOut(Easing.linear),
            useNativeDriver: true,
          });
        }).concat([Animated.timing(shakeY, { toValue: 0, duration: 80, useNativeDriver: true })])
      ),
    ]).start();
    Vibration.vibrate([0, 35, 60, 35, 60, 35, 60, 35, 60, 35, 60, 50]);
    const tick = setInterval(() => {
      setDiceFace((f) => {
        let next = f;
        while (next === f) next = 1 + Math.floor(Math.random() * 6);
        return next;
      });
    }, PIP_INTERVAL);
    setTimeout(() => {
      clearInterval(tick);
      onDeal(() => {
        setPhase('showing');
        Vibration.vibrate(20);
      });
    }, SHAKE_DURATION);
  };

  if (!ready) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const cost = hand ? handCost(hand) : 0;
  const bobY = idleBob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

  return (
    <Animated.View
      style={{
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 16,
        transform: [{ translateX: shakeX }, { translateY: shakeY }],
      }}
    >
      {/* Header: title left, bankroll right */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 4, marginBottom: isTablet ? 24 : 14 }}>
        <View>
          <Text style={{ fontFamily: t.fMono, fontSize: isTablet ? 15 : 10, color: t.accent, letterSpacing: 1.8, fontWeight: '700', textTransform: 'uppercase' }}>
            The opening roll
          </Text>
          <Text
            style={{
              marginTop: isTablet ? 8 : 4,
              fontFamily: t.fDisp,
              fontSize: isTablet ? 38 : 22,
              fontWeight: '700',
              letterSpacing: -0.6,
              color: t.text,
            }}
          >
            {phase === 'idle'
              ? 'Tap the die.'
              : phase === 'shaking'
                ? 'Rolling…'
                : `Six picks. ${rerollsLeft} re-roll${rerollsLeft === 1 ? '' : 's'}.`}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: t.fMono, fontSize: isTablet ? 13 : 9, color: t.textMute, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '700' }}>
            Starting cash
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
            <Text style={{ fontFamily: t.fDisp, fontSize: isTablet ? 22 : 14, color: t.textDim, fontWeight: '500' }}>$</Text>
            <Num size={isTablet ? 48 : 30} weight="800">
              {STARTING_CASH}
            </Num>
          </View>
        </View>
      </View>

      {/* Center area — die during idle/shaking, hand during showing */}
      <View style={{ flex: 1 }}>
        {phase === 'showing' && hand ? (
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
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: isTablet ? 28 : 18 }}>
            <Animated.View style={{ transform: phase === 'idle' ? [{ translateY: bobY }] : [] }}>
              <PipDie face={diceFace} size={isTablet ? 220 : 140} shaking={phase === 'shaking'} onPress={startRattle} />
            </Animated.View>
            <Text
              style={{
                fontFamily: t.fMono,
                fontSize: isTablet ? 16 : 10,
                color: t.textMute,
                letterSpacing: 2,
                textTransform: 'uppercase',
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              {phase === 'idle' ? '↑ Tap to roll your deck ↑' : 'Shaking the cup…'}
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      {phase === 'showing' && hand ? (
        <View style={{ gap: isTablet ? 12 : 8, marginTop: isTablet ? 18 : 12 }}>
          <Pressable
            onPress={onReroll}
            disabled={rerollsLeft <= 0 || submitting}
            style={({ pressed }) => [
              {
                height: isTablet ? 64 : 44,
                borderRadius: isTablet ? 14 : 12,
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
            <Text style={{ fontSize: isTablet ? 22 : 16, color: t.accent }}>↻</Text>
            <Text style={{ fontFamily: t.fMono, fontSize: isTablet ? 17 : 12, fontWeight: '700', color: t.accent, letterSpacing: 1.4, textTransform: 'uppercase' }}>
              {rerollsLeft > 0 ? `Re-roll the deck (${rerollsLeft})` : 'No re-rolls left'}
            </Text>
          </Pressable>
          <PrimaryBtn title={submitting ? 'Locking…' : 'Lock it in'} onPress={onLockIn} disabled={submitting} />
          <Text
            style={{
              textAlign: 'center',
              fontFamily: t.fMono,
              fontSize: isTablet ? 13 : 9,
              color: t.textMute,
              letterSpacing: 0.8,
              marginTop: isTablet ? 4 : 0,
            }}
          >
            Hand worth ${cost} · you start with ${STARTING_CASH} for the shop.
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

// Real 6-sided die. Cycles its face via the `face` prop; pip pattern picked
// from a static map so the rattle reads as a real die spinning.
function PipDie({ face, size = 92, shaking, onPress }: { face: number; size?: number; shaking?: boolean; onPress?: () => void }) {
  const t = useTheme();
  const PATTERNS: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const pips = PATTERNS[face] || [4];
  const pipSize = size * 0.16;
  return (
    <Pressable onPress={onPress} disabled={!onPress || shaking}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.18,
          backgroundColor: '#FAF7F0',
          padding: size * 0.13,
          shadowColor: '#000',
          shadowOpacity: 0.55,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 14 },
          elevation: 8,
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.08)',
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            flexWrap: 'wrap',
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <View
              key={i}
              style={{
                width: '33.333%',
                height: '33.333%',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {pips.includes(i) ? (
                <View
                  style={{
                    width: pipSize,
                    height: pipSize,
                    borderRadius: pipSize / 2,
                    backgroundColor: '#14110B',
                  }}
                />
              ) : null}
            </View>
          ))}
        </View>
      </View>
      {/* Soft accent glow under the die when idle */}
      {!shaking && onPress ? (
        <View
          style={{
            position: 'absolute',
            left: -10,
            right: -10,
            bottom: -20,
            height: 20,
            borderRadius: 999,
            backgroundColor: t.accent,
            opacity: 0.15,
          }}
        />
      ) : null}
    </Pressable>
  );
}

function HandTile({ kind, item }: { kind: 'D' | 'C'; item: Driver | Constructor | undefined }) {
  const t = useTheme();
  const { isTablet } = useDeviceLayout();
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
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: isDriver ? (isTablet ? 8 : 5) : (isTablet ? 70 : 46), backgroundColor: teamColor }} />
      {isDriver && number != null ? (
        <Text
          style={{
            position: 'absolute',
            right: -6,
            top: 0,
            fontFamily: t.fDisp,
            fontWeight: '800',
            fontSize: isTablet ? 240 : 160,
            lineHeight: isTablet ? 225 : 150,
            color: teamColor,
            opacity: 0.18,
            letterSpacing: -6,
          }}
        >
          {number}
        </Text>
      ) : null}
      <View style={{ position: 'absolute', top: isTablet ? 12 : 8, right: isTablet ? 12 : 8, zIndex: 2 }}>
        <TierChip tier={tier} size={isTablet ? 'md' : 'sm'} />
      </View>
      <Text
        style={{
          position: 'absolute',
          left: isTablet ? 18 : 12,
          top: isDriver ? (isTablet ? 18 : 12) : (isTablet ? 90 : 60),
          fontFamily: t.fMono,
          fontSize: isTablet ? 15 : 10,
          fontWeight: '800',
          color: isDriver ? teamColor : t.textDim,
          letterSpacing: 1.6,
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
            left: isTablet ? 18 : 12,
            top: isTablet ? 22 : 14,
            fontFamily: t.fMono,
            fontSize: isTablet ? 18 : 12,
            fontWeight: '800',
            color: '#0E1116',
            letterSpacing: 1.6,
            textTransform: 'uppercase',
          }}
        >
          {constructor!.shortName}
        </Text>
      ) : null}
      <View style={{ position: 'absolute', left: isTablet ? 18 : 12, right: isTablet ? 18 : 12, bottom: isTablet ? 60 : 36 }}>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: isTablet ? 16 : 11,
            color: t.textDim,
            letterSpacing: 1.4,
            fontWeight: '700',
          }}
        >
          {isDriver ? driver!.shortName : constructor!.shortName}
        </Text>
        <Text
          style={{
            marginTop: isTablet ? 4 : 2,
            fontFamily: t.fDisp,
            fontWeight: '700',
            fontSize: isTablet ? 26 : 16,
            color: t.text,
            letterSpacing: -0.4,
            lineHeight: isTablet ? 30 : 18,
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
          height: isTablet ? 48 : 30,
          backgroundColor: t.bg,
          borderTopWidth: 1,
          borderTopColor: t.line,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: isTablet ? 16 : 10,
        }}
      >
        <Text style={{ fontFamily: t.fMono, fontSize: isTablet ? 13 : 8, fontWeight: '700', color: t.textMute, letterSpacing: 1.6, textTransform: 'uppercase' }}>
          Cost
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
          <Text style={{ fontFamily: t.fDisp, fontSize: isTablet ? 17 : 11, color: t.textDim, fontWeight: '500' }}>−$</Text>
          <Num size={isTablet ? 28 : 17} weight="800" color={t.danger}>
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
