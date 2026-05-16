// Opening-roll wizard — deck-draw ceremony.
// Welcome → Roll (shake → reveal → swipe accept/reject) → Hand → Done.
//
// Style reference: /tmp/tl-design/design_handoff_track_limits/screen-roll.jsx
// Card geometry, animations, and slot strip mirror the design handoff. Sound
// is replaced by haptic rattle (RN Vibration) for the rolling shuffle.

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
import { useTheme } from '@/theme';
import { CONSTRUCTOR_COLORS } from '@/theme/tokens';
import { TierChip, PrimaryBtn, Num } from '@components/tl';
import type { Driver, Constructor } from '@/types';

const WORDMARK_WHITE = require('../assets/wordmark-white.png');
const WORDMARK_BLACK = require('../assets/wordmark-black.png');

const DRIVER_SLOTS = garageConfig.ROSTER_DRIVER_SLOTS;
const CONSTRUCTOR_SLOTS = garageConfig.ROSTER_CONSTRUCTOR_SLOTS;
const BUDGET = garageConfig.ROLL_BUDGET;
const REJECTS = garageConfig.ROLL_REJECT_TOKENS;
const MACRO_REROLLS = garageConfig.ROLL_MACRO_REROLLS;
const PLAN: Array<'D' | 'C'> = ['D', 'D', 'D', 'D', 'C', 'C'];

// Card geometry — copied from screen-roll.jsx, scaled to phone widths.
const CARD_W = 240;
const CARD_H = 320;

type Stage = 'welcome' | 'roll' | 'hand' | 'done';
type RollPhase = 'idle' | 'shaking' | 'pending';

interface RollState {
  driverPool: Driver[];
  constructorPool: Constructor[];
  acceptedDrivers: Driver[];
  acceptedConstructors: Constructor[];
  rejectsRemaining: number;
  macroRerollsRemaining: number;
}

function emptyState(allDrivers: Driver[], allConstructors: Constructor[]): RollState {
  return {
    driverPool: [...allDrivers],
    constructorPool: [...allConstructors],
    acceptedDrivers: [],
    acceptedConstructors: [],
    rejectsRemaining: REJECTS,
    macroRerollsRemaining: MACRO_REROLLS,
  };
}

function spent(state: RollState): number {
  const d = state.acceptedDrivers.reduce((acc, x) => acc + (x.price ?? 0), 0);
  const c = state.acceptedConstructors.reduce((acc, x) => acc + (x.price ?? 0), 0);
  return Math.round(d + c);
}

function budgetLeft(state: RollState): number {
  return Math.max(0, BUDGET - spent(state));
}

function isHandFull(state: RollState): boolean {
  return state.acceptedDrivers.length >= DRIVER_SLOTS && state.acceptedConstructors.length >= CONSTRUCTOR_SLOTS;
}

function nextSlotKind(state: RollState): 'D' | 'C' | null {
  return PLAN[state.acceptedDrivers.length + state.acceptedConstructors.length] ?? null;
}

// Pick next pending card. Drivers first, then constructors (per PLAN). Always
// filter to cards the player can afford — the design rule is: never show a card
// you can't take. If everything in the pool is too expensive (extreme edge),
// fall back to the single cheapest available so the wizard isn't stuck.
function pickNext(state: RollState): { kind: 'D' | 'C'; item: Driver | Constructor } | null {
  const slot = nextSlotKind(state);
  if (!slot) return null;
  const remaining = budgetLeft(state);

  const sourcePool: (Driver | Constructor)[] = slot === 'D' ? state.driverPool : state.constructorPool;
  if (sourcePool.length === 0) return null;
  const affordable = sourcePool.filter((c) => c.price <= remaining);
  if (affordable.length > 0) {
    const item = affordable[Math.floor(Math.random() * affordable.length)];
    return { kind: slot, item };
  }
  // Fallback: cheapest available so the user can finish the hand even if their
  // earlier picks ate the budget.
  const cheapest = [...sourcePool].sort((a, b) => a.price - b.price)[0];
  return { kind: slot, item: cheapest };
}

export default function OnboardingScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [stage, setStage] = useState<Stage>('welcome');
  const [submitting, setSubmitting] = useState(false);
  const [allDrivers, setAllDrivers] = useState<Driver[] | null>(null);
  const [allConstructors, setAllConstructors] = useState<Constructor[] | null>(null);
  const [roll, setRoll] = useState<RollState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, c] = await Promise.all([
          dataService.getActiveDrivers(),
          dataService.getActiveConstructors(),
        ]);
        if (!cancelled) {
          setAllDrivers(d);
          setAllConstructors(c);
        }
      } catch {
        // ignore — UI shows spinner until pools arrive
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stage !== 'roll') return;
    if (roll) return;
    if (!allDrivers || !allConstructors) return;
    setRoll(emptyState(allDrivers, allConstructors));
  }, [stage, roll, allDrivers, allConstructors]);

  const onAcceptCard = (card: { kind: 'D' | 'C'; item: Driver | Constructor }) => {
    if (!roll) return;
    if (card.kind === 'D') {
      const next: RollState = {
        ...roll,
        acceptedDrivers: [...roll.acceptedDrivers, card.item as Driver],
        driverPool: roll.driverPool.filter((d) => d.id !== card.item.id),
      };
      setRoll(next);
      if (isHandFull(next)) setStage('hand');
    } else {
      const next: RollState = {
        ...roll,
        acceptedConstructors: [...roll.acceptedConstructors, card.item as Constructor],
        constructorPool: roll.constructorPool.filter((c) => c.id !== card.item.id),
      };
      setRoll(next);
      if (isHandFull(next)) setStage('hand');
    }
  };

  const onRejectCard = (card: { kind: 'D' | 'C'; item: Driver | Constructor }) => {
    if (!roll) return;
    if (roll.rejectsRemaining <= 0) return;
    setRoll({
      ...roll,
      driverPool: card.kind === 'D' ? roll.driverPool.filter((d) => d.id !== card.item.id) : roll.driverPool,
      constructorPool:
        card.kind === 'C' ? roll.constructorPool.filter((c) => c.id !== card.item.id) : roll.constructorPool,
      rejectsRemaining: roll.rejectsRemaining - 1,
    });
  };

  const onMacroReroll = () => {
    if (!roll || !allDrivers || !allConstructors) return;
    if (roll.macroRerollsRemaining <= 0) return;
    const fresh = emptyState(allDrivers, allConstructors);
    fresh.macroRerollsRemaining = roll.macroRerollsRemaining - 1;
    setRoll(fresh);
    setStage('roll');
  };

  const onLockIn = async () => {
    if (!roll || !user) return;
    setSubmitting(true);
    try {
      const driverIds = roll.acceptedDrivers.map((d) => d.id);
      const constructorIds = roll.acceptedConstructors.map((c) => c.id);
      const remaining = budgetLeft(roll);
      await garageService.commitRoll(user.id, driverIds, constructorIds, remaining);
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
          roll={roll}
          onAccept={onAcceptCard}
          onReject={onRejectCard}
        />
      ) : null}
      {stage === 'hand' ? (
        <HandStage roll={roll!} submitting={submitting} onLockIn={onLockIn} onMacroReroll={onMacroReroll} />
      ) : null}
      {stage === 'done' ? <DoneStage onContinue={() => router.replace('/(tabs)')} /> : null}
    </SafeAreaView>
  );
}

// ---------- Welcome ----------

function WelcomeStage({ onNext }: { onNext: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 40, justifyContent: 'space-between' }}>
      <View>
        <Image
          source={t.dark ? WORDMARK_WHITE : WORDMARK_BLACK}
          style={{ height: 22, width: 140, resizeMode: 'contain' }}
        />
        <Text
          style={{
            marginTop: 36,
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
            fontWeight: '600',
            fontSize: 40,
            lineHeight: 42,
            letterSpacing: -1.2,
            color: t.text,
          }}
        >
          Draw your{'\n'}starting hand.
        </Text>
        <Text style={{ marginTop: 18, fontFamily: t.fSans, fontSize: 14.5, color: t.textDim, lineHeight: 22, maxWidth: 320 }}>
          Four drivers. Two constructors. The rest of the season is what you do with them.
        </Text>
      </View>

      <PrimaryBtn title="Open the deck" onPress={onNext} />
    </View>
  );
}

// ---------- Roll stage ----------

function RollStage({
  roll,
  onAccept,
  onReject,
}: {
  roll: RollState | null;
  onAccept: (card: { kind: 'D' | 'C'; item: Driver | Constructor }) => void;
  onReject: (card: { kind: 'D' | 'C'; item: Driver | Constructor }) => void;
}) {
  const t = useTheme();
  const [phase, setPhase] = useState<RollPhase>('idle');
  const [shuffleTick, setShuffleTick] = useState(0);
  const [pending, setPending] = useState<{ kind: 'D' | 'C'; item: Driver | Constructor } | null>(null);
  const [swipeOut, setSwipeOut] = useState<'left' | 'right' | null>(null);

  // Animated shake — applied to the deck container during the roll.
  const shake = useRef(new Animated.Value(0)).current;

  // Animated budget number — smoothly counts down.
  const [budgetDisplay, setBudgetDisplay] = useState<number>(BUDGET);
  const budgetTarget = roll ? budgetLeft(roll) : BUDGET;
  useEffect(() => {
    if (budgetDisplay === budgetTarget) return;
    const step = Math.max(1, Math.abs(budgetTarget - budgetDisplay) / 8);
    const id = setTimeout(() => {
      setBudgetDisplay((b) => {
        if (Math.abs(b - budgetTarget) <= step) return budgetTarget;
        return Math.round(b + (budgetTarget < b ? -step : step));
      });
    }, 30);
    return () => clearTimeout(id);
  }, [budgetDisplay, budgetTarget]);

  if (!roll) {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const slotKind = nextSlotKind(roll);

  // === actions ===
  const startRoll = () => {
    if (phase !== 'idle' || !slotKind) return;
    setPhase('shaking');

    // Shake animation: 3 rapid back-and-forths over ~1.1s.
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true, easing: Easing.linear }),
      Animated.timing(shake, { toValue: -1, duration: 70, useNativeDriver: true, easing: Easing.linear }),
      Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true, easing: Easing.linear }),
      Animated.timing(shake, { toValue: -1, duration: 70, useNativeDriver: true, easing: Easing.linear }),
      Animated.timing(shake, { toValue: 0.7, duration: 70, useNativeDriver: true, easing: Easing.linear }),
      Animated.timing(shake, { toValue: -0.7, duration: 70, useNativeDriver: true, easing: Easing.linear }),
      Animated.timing(shake, { toValue: 0.4, duration: 70, useNativeDriver: true, easing: Easing.linear }),
      Animated.timing(shake, { toValue: -0.4, duration: 70, useNativeDriver: true, easing: Easing.linear }),
      Animated.timing(shake, { toValue: 0.2, duration: 70, useNativeDriver: true, easing: Easing.linear }),
      Animated.timing(shake, { toValue: 0, duration: 70, useNativeDriver: true, easing: Easing.linear }),
    ]).start();

    // Haptic rattle in time with the shake.
    Vibration.vibrate([0, 35, 60, 35, 60, 35, 60, 35, 60, 35, 60, 50]);

    // Tumble through the candidate pool.
    const tumble = setInterval(() => setShuffleTick((n) => n + 1), 90);

    // Settle on a real pick after 1100ms.
    setTimeout(() => {
      clearInterval(tumble);
      const pick = pickNext(roll);
      setPending(pick);
      setPhase('pending');
    }, 1100);
  };

  const accept = () => {
    if (!pending) return;
    setSwipeOut('right');
    Vibration.vibrate(20);
    setTimeout(() => {
      onAccept(pending);
      setPending(null);
      setSwipeOut(null);
      setPhase('idle');
    }, 320);
  };

  const reject = () => {
    if (!pending) return;
    if (roll.rejectsRemaining <= 0) return;
    setSwipeOut('left');
    Vibration.vibrate(40);
    setTimeout(() => {
      onReject(pending);
      setPending(null);
      setSwipeOut(null);
      // Auto re-roll the same slot.
      setPhase('idle');
      setTimeout(startRoll, 80);
    }, 320);
  };

  return (
    <View style={{ flex: 1 }}>
      <RollHeader budget={budgetDisplay} rejectsLeft={roll.rejectsRemaining} />

      <Animated.View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [
            {
              translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-12, 12] }),
            },
          ],
        }}
      >
        {phase === 'pending' && pending ? (
          <SwipeCard
            card={pending}
            swipeOut={swipeOut}
            onAccept={accept}
            onReject={roll.rejectsRemaining > 0 ? reject : null}
            rejectsLeft={roll.rejectsRemaining}
          />
        ) : (
          <DeckShuffler
            tick={shuffleTick}
            shuffling={phase === 'shaking'}
            slotKind={slotKind ?? 'D'}
            driverPool={roll.driverPool}
            constructorPool={roll.constructorPool}
            onTap={startRoll}
          />
        )}
      </Animated.View>

      <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
        <SlotStrip roll={roll} />
      </View>

      <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <BottomHint phase={phase} pending={!!pending} rejectsLeft={roll.rejectsRemaining} slotIdx={roll.acceptedDrivers.length + roll.acceptedConstructors.length} />
      </View>
    </View>
  );
}

function RollHeader({ budget, rejectsLeft }: { budget: number; rejectsLeft: number }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1, budget / BUDGET));
  const tone = budget < 10 ? t.danger : budget < 25 ? t.warn : t.text;
  const fillColor = budget < 10 ? t.danger : budget < 25 ? t.warn : t.accent;
  return (
    <View style={{ paddingHorizontal: 22, paddingTop: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View>
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 10,
              color: t.accent,
              letterSpacing: 1.6,
              fontWeight: '700',
              textTransform: 'uppercase',
            }}
          >
            The opening roll
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Text
              style={{
                fontFamily: t.fMono,
                fontSize: 9,
                color: t.textMute,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                fontWeight: '600',
                marginRight: 2,
              }}
            >
              Rejects
            </Text>
            {Array.from({ length: REJECTS }).map((_, i) => {
              const filled = i < rejectsLeft;
              return (
                <View
                  key={i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: filled ? t.accent : 'transparent',
                    borderWidth: 1,
                    borderColor: filled ? t.accent : t.line,
                  }}
                />
              );
            })}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 9,
              color: t.textMute,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              fontWeight: '600',
            }}
          >
            Budget
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
            <Text style={{ fontFamily: t.fDisp, fontSize: 14, color: t.textDim, fontWeight: '500' }}>$</Text>
            <Text
              style={{
                fontFamily: t.fDisp,
                fontWeight: '800',
                fontSize: 36,
                color: tone,
                letterSpacing: -1,
                lineHeight: 36,
                fontVariant: ['tabular-nums'],
              }}
            >
              {Math.round(budget)}
            </Text>
            <Text style={{ fontFamily: t.fMono, fontSize: 11, color: t.textMute, marginLeft: 4 }}>/ {BUDGET}</Text>
          </View>
        </View>
      </View>
      <View
        style={{
          marginTop: 10,
          height: 4,
          borderRadius: 2,
          backgroundColor: t.surface2,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: fillColor }} />
      </View>
    </View>
  );
}

function BottomHint({
  phase,
  pending,
  rejectsLeft,
  slotIdx,
}: {
  phase: RollPhase;
  pending: boolean;
  rejectsLeft: number;
  slotIdx: number;
}) {
  const t = useTheme();
  let line1 = '';
  let line2 = '';
  if (pending) {
    line1 = '← REJECT  ·  TAP OR SWIPE  ·  KEEP →';
    line2 = rejectsLeft > 0 ? `${rejectsLeft} reject${rejectsLeft === 1 ? '' : 's'} left` : 'no rejects left — keep this one';
  } else if (phase === 'shaking') {
    line1 = 'Dice in flight…';
    line2 = '';
  } else if (slotIdx === 0) {
    line1 = 'Two dice. Six rolls. Tap them.';
    line2 = '';
  } else {
    line1 = `Roll ${slotIdx + 1} of ${PLAN.length} · ${PLAN[slotIdx] === 'D' ? 'Driver' : 'Constructor'}`;
    line2 = '';
  }
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Text
        style={{
          fontFamily: t.fMono,
          fontSize: 11,
          color: t.textDim,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          fontWeight: '600',
        }}
      >
        {line1}
      </Text>
      {line2 ? (
        <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 0.6 }}>{line2}</Text>
      ) : null}
    </View>
  );
}

// ---------- Deck shuffler ----------

function DeckShuffler({
  tick,
  shuffling,
  slotKind,
  driverPool,
  constructorPool,
  onTap,
}: {
  tick: number;
  shuffling: boolean;
  slotKind: 'D' | 'C';
  driverPool: Driver[];
  constructorPool: Constructor[];
  onTap: () => void;
}) {
  const t = useTheme();
  const pool = slotKind === 'D' ? driverPool : constructorPool;
  const top = pool.length > 0 ? pool[tick % pool.length] : null;

  // Idle bob — gentle vertical motion to invite a tap.
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (shuffling) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bob, shuffling]);

  // Flick rotation — used during the shuffle.
  const flick = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!shuffling) {
      flick.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flick, { toValue: 1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(flick, { toValue: -1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(flick, { toValue: 0.5, duration: 80, easing: Easing.linear, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [flick, shuffling]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const flickRotate = flick.interpolate({ inputRange: [-1, 1], outputRange: ['-6deg', '6deg'] });
  const flickX = flick.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] });
  const flickY = flick.interpolate({ inputRange: [-1, 1], outputRange: [-6, 4] });

  return (
    <Pressable onPress={shuffling ? undefined : onTap} disabled={shuffling}>
      <View style={{ alignItems: 'center', gap: 18 }}>
        <View
          style={{
            width: CARD_W + 30,
            height: CARD_H + 30,
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {/* Two stacked face-down backs */}
          <View
            style={{
              position: 'absolute',
              left: 18,
              top: 16,
              transform: [{ rotate: '-4deg' }],
              opacity: 0.55,
            }}
          >
            <DeckBack />
          </View>
          <View
            style={{
              position: 'absolute',
              left: 6,
              top: 8,
              transform: [{ rotate: '2deg' }],
              opacity: 0.9,
            }}
          >
            <DeckBack />
          </View>
          {/* Top card — flicks through pool while shaking, else idle bob */}
          <Animated.View
            style={{
              transform: shuffling
                ? [{ translateX: flickX }, { translateY: flickY }, { rotate: flickRotate }]
                : [{ translateY }],
            }}
          >
            {top ? (
              <FaceCard kind={slotKind} item={top} />
            ) : (
              <DeckBack />
            )}
          </Animated.View>
        </View>

        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text
            style={{
              fontFamily: t.fDisp,
              fontWeight: '800',
              fontSize: 34,
              color: shuffling ? t.textDim : t.accent,
              letterSpacing: 4,
              textTransform: 'uppercase',
              textShadowColor: shuffling ? 'transparent' : t.accentDim,
              textShadowRadius: shuffling ? 0 : 14,
            }}
          >
            {shuffling ? 'Rolling…' : 'Roll'}
          </Text>
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 10,
              color: t.textMute,
              letterSpacing: 1.8,
              textTransform: 'uppercase',
              fontWeight: '600',
            }}
          >
            {shuffling ? 'Shuffling the deck' : '↑   tap the deck to draw   ↑'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function DeckBack() {
  const t = useTheme();
  return (
    <View
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: 18,
        backgroundColor: t.surface,
        borderWidth: 1.5,
        borderColor: t.line,
        overflow: 'hidden',
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.55,
        shadowOffset: { width: 0, height: 18 },
        shadowRadius: 30,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          top: 10,
          bottom: 10,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: t.accentDim,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: t.fDisp, fontWeight: '800', fontSize: 38, color: t.accentSoft, letterSpacing: -1 }}>
          TL
        </Text>
      </View>
    </View>
  );
}

// ---------- Face card (used both in shuffler and as the swipe-decision card) ----------

function FaceCard({ kind, item }: { kind: 'D' | 'C'; item: Driver | Constructor }) {
  const t = useTheme();
  const isDriver = kind === 'D';
  const driver = isDriver ? (item as Driver) : null;
  const constructor = isDriver ? null : (item as Constructor);
  const teamShort = isDriver ? (driver!.constructorName || '').slice(0, 3).toUpperCase() : constructor!.shortName;
  const teamColor =
    (CONSTRUCTOR_COLORS as Record<string, string>)[teamShort] ||
    (constructor?.primaryColor) ||
    t.accent;
  const tier = isDriver ? driver!.tier : 'B';
  const isATier = tier === 'A';
  const number = isDriver ? driver!.number ?? null : null;
  const cost = item.price ?? 0;

  return (
    <View
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: 18,
        backgroundColor: t.surface,
        borderWidth: 1.5,
        borderColor: isATier ? t.tierAEdge : t.line,
        overflow: 'hidden',
        elevation: 12,
        shadowColor: '#000',
        shadowOpacity: 0.55,
        shadowOffset: { width: 0, height: 22 },
        shadowRadius: 40,
      }}
    >
      {/* team color slab */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: isDriver ? 6 : 80,
          backgroundColor: teamColor,
        }}
      />

      {/* huge number watermark for drivers */}
      {isDriver && number != null ? (
        <Text
          style={{
            position: 'absolute',
            right: -6,
            top: 8,
            fontFamily: t.fDisp,
            fontWeight: '800',
            fontSize: 220,
            lineHeight: 200,
            color: teamColor,
            opacity: 0.14,
            letterSpacing: -10,
          }}
        >
          {number}
        </Text>
      ) : null}

      {/* tier chip — top right */}
      <View style={{ position: 'absolute', top: 14, right: 14, zIndex: 2 }}>
        <TierChip tier={tier} />
      </View>

      {/* team name */}
      <View style={{ position: 'absolute', left: 16, right: 16, top: isDriver ? 16 : 96 }}>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 11,
            fontWeight: '800',
            color: isDriver ? teamColor : t.textDim,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
          numberOfLines={1}
        >
          {isDriver ? driver!.constructorName : 'Constructor'}
        </Text>
      </View>

      {/* constructor short on the color slab */}
      {!isDriver ? (
        <Text
          style={{
            position: 'absolute',
            left: 16,
            top: 26,
            fontFamily: t.fMono,
            fontSize: 13,
            fontWeight: '800',
            color: '#0E1116',
            letterSpacing: 1.6,
            textTransform: 'uppercase',
          }}
        >
          {constructor!.shortName}
        </Text>
      ) : null}

      {/* short + name */}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 60 }}>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 12,
            color: t.textDim,
            letterSpacing: 1.4,
            fontWeight: '700',
            marginBottom: 4,
          }}
        >
          {isDriver ? driver!.shortName : constructor!.shortName}
        </Text>
        <Text
          style={{
            fontFamily: t.fDisp,
            fontWeight: '700',
            fontSize: 24,
            color: t.text,
            letterSpacing: -0.6,
            lineHeight: 26,
          }}
          numberOfLines={2}
        >
          {isDriver ? driver!.name : constructor!.name}
        </Text>
      </View>

      {/* cost footer */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 46,
          backgroundColor: t.bg,
          borderTopWidth: 1,
          borderTopColor: t.line,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
        }}
      >
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 9,
            fontWeight: '700',
            color: t.textMute,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
        >
          Cost
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
          <Text style={{ fontFamily: t.fDisp, fontSize: 13, color: t.textDim, fontWeight: '500' }}>−$</Text>
          <Num size={26} weight="800" color={t.danger}>
            {cost}
          </Num>
        </View>
      </View>
    </View>
  );
}

// ---------- Swipe / decision card ----------

function SwipeCard({
  card,
  swipeOut,
  onAccept,
  onReject,
  rejectsLeft,
}: {
  card: { kind: 'D' | 'C'; item: Driver | Constructor };
  swipeOut: 'left' | 'right' | null;
  onAccept: () => void;
  onReject: (() => void) | null;
  rejectsLeft: number;
}) {
  const t = useTheme();
  const slide = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  // Card-in animation when the card first appears.
  useEffect(() => {
    fadeIn.setValue(0);
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, [fadeIn, card]);

  // Card-out animation on accept/reject.
  useEffect(() => {
    if (!swipeOut) return;
    Animated.timing(slide, {
      toValue: swipeOut === 'right' ? 1 : -1,
      duration: 300,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide, swipeOut]);

  const tx = slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [-CARD_W * 1.4, 0, CARD_W * 1.4] });
  const rot = slide.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-22deg', '0deg', '22deg'] });
  const fadeY = fadeIn.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const fadeScale = fadeIn.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          opacity: swipeOut ? slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }) : fadeIn,
          transform: [
            { translateX: tx },
            { translateY: swipeOut ? new Animated.Value(0) : (fadeY as unknown as Animated.AnimatedInterpolation<number>) },
            { scale: swipeOut ? new Animated.Value(1) : (fadeScale as unknown as Animated.AnimatedInterpolation<number>) },
            { rotate: rot },
          ],
        }}
      >
        <FaceCard kind={card.kind} item={card.item} />
      </Animated.View>

      <View style={{ marginTop: 22, flexDirection: 'row', gap: 26, alignItems: 'center' }}>
        <ThumbBtn
          kind="down"
          disabled={!onReject}
          count={rejectsLeft}
          onPress={() => onReject && onReject()}
        />
        <ThumbBtn kind="up" onPress={onAccept} />
      </View>
    </View>
  );
}

function ThumbBtn({
  kind,
  disabled,
  count,
  onPress,
}: {
  kind: 'up' | 'down';
  disabled?: boolean;
  count?: number;
  onPress: () => void;
}) {
  const t = useTheme();
  const up = kind === 'up';
  const color = up ? t.success : t.danger;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: disabled ? t.surface2 : t.surface,
          borderWidth: 2,
          borderColor: disabled ? t.line : color,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed && !disabled ? 0.85 : 1,
          shadowColor: color,
          shadowOpacity: disabled ? 0 : 0.4,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: disabled ? 0 : 6,
        },
      ]}
    >
      <Text style={{ fontSize: 28, color: disabled ? t.textMute : color }}>{up ? '👍' : '👎'}</Text>
      {!up && typeof count === 'number' ? (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 20,
            height: 20,
            paddingHorizontal: 5,
            borderRadius: 10,
            backgroundColor: t.bg,
            borderWidth: 2,
            borderColor: disabled ? t.line : color,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: t.fMono, fontSize: 11, fontWeight: '800', color: disabled ? t.textMute : color }}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ---------- Slot strip ----------

function SlotStrip({ roll }: { roll: RollState }) {
  const t = useTheme();
  const filledIdx = roll.acceptedDrivers.length + roll.acceptedConstructors.length;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 4 }}>
      {PLAN.map((slot, i) => {
        const filled =
          slot === 'D' ? roll.acceptedDrivers[i] : roll.acceptedConstructors[i - DRIVER_SLOTS];
        const isCurrent = i === filledIdx;
        const teamShort = filled
          ? slot === 'D'
            ? ((filled as Driver).constructorName || '').slice(0, 3).toUpperCase()
            : (filled as Constructor).shortName
          : '';
        const teamColor =
          (CONSTRUCTOR_COLORS as Record<string, string>)[teamShort] ||
          (slot === 'C' && filled ? (filled as Constructor).primaryColor : null) ||
          t.accent;
        return (
          <View
            key={i}
            style={{
              width: 50,
              height: 64,
              borderRadius: 8,
              backgroundColor: filled ? t.surface2 : 'transparent',
              borderWidth: 1,
              borderStyle: filled ? 'solid' : 'dashed',
              borderColor: filled
                ? (slot === 'D' && (filled as Driver).tier === 'A' ? t.tierAEdge : t.line)
                : isCurrent
                  ? t.accent
                  : t.line,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {filled ? (
              <>
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: teamColor }} />
                <Text
                  style={{
                    marginTop: 6,
                    fontFamily: t.fMono,
                    fontSize: 11,
                    fontWeight: '700',
                    color: t.text,
                    letterSpacing: 0.4,
                  }}
                >
                  {slot === 'D' ? (filled as Driver).shortName : (filled as Constructor).shortName}
                </Text>
                <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textDim, fontWeight: '700', marginTop: 2 }}>
                  ${(filled as Driver | Constructor).price}
                </Text>
              </>
            ) : (
              <>
                <Text
                  style={{
                    fontFamily: t.fMono,
                    fontSize: 14,
                    fontWeight: '700',
                    color: isCurrent ? t.accent : t.textMute,
                    opacity: isCurrent ? 1 : 0.5,
                  }}
                >
                  {slot}
                </Text>
                <Text style={{ fontFamily: t.fMono, fontSize: 8, color: t.textMute, marginTop: 1 }}>
                  0{i + 1}
                </Text>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ---------- Hand stage ----------

function HandStage({
  roll,
  submitting,
  onLockIn,
  onMacroReroll,
}: {
  roll: RollState;
  submitting: boolean;
  onLockIn: () => void;
  onMacroReroll: () => void;
}) {
  const t = useTheme();
  const remaining = budgetLeft(roll);
  const drivers = roll.acceptedDrivers;
  const constructors = roll.acceptedConstructors;
  return (
    <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 }}>
      {/* Header — title left, budget remaining right */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 6, marginBottom: 8 }}>
        <View>
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 10,
              color: t.accent,
              letterSpacing: 1.6,
              fontWeight: '700',
              textTransform: 'uppercase',
            }}
          >
            The hand is dealt
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontFamily: t.fDisp,
              fontSize: 22,
              fontWeight: '700',
              letterSpacing: -0.6,
              color: t.text,
            }}
          >
            Six rolls. One paddock.
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 9,
              color: t.textMute,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              fontWeight: '600',
            }}
          >
            Bankroll
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
            <Text style={{ fontFamily: t.fDisp, fontSize: 14, color: t.textDim, fontWeight: '500' }}>$</Text>
            <Num size={32} weight="800">
              {remaining}
            </Num>
          </View>
        </View>
      </View>

      {/* Drivers — 2x2 grid, fills available vertical space */}
      <View style={{ flex: 3, gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
          <HandTile kind="D" item={drivers[0]} />
          <HandTile kind="D" item={drivers[1]} />
        </View>
        <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
          <HandTile kind="D" item={drivers[2]} />
          <HandTile kind="D" item={drivers[3]} />
        </View>
      </View>

      {/* Constructors — 1x2 row at the bottom of the card area */}
      <View style={{ flex: 1.4, flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <HandTile kind="C" item={constructors[0]} />
        <HandTile kind="C" item={constructors[1]} />
      </View>

      {/* Buttons */}
      <View style={{ gap: 8, marginTop: 10 }}>
        <Pressable
          onPress={onMacroReroll}
          disabled={roll.macroRerollsRemaining <= 0 || submitting}
          style={({ pressed }) => [
            {
              height: 44,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: t.accent,
              backgroundColor: t.surface2,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
              opacity: roll.macroRerollsRemaining <= 0 ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={{ fontSize: 16, color: t.accent }}>↻</Text>
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 12,
              fontWeight: '700',
              color: t.accent,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            {roll.macroRerollsRemaining > 0 ? 'Re-roll all six' : 'No re-rolls left'}
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
          {roll.macroRerollsRemaining > 0
            ? '1 re-roll left · use it or live with it'
            : 'Re-roll spent · this is your hand'}
        </Text>
      </View>
    </View>
  );
}

// Big tile used on the Hand stage. Scales to fill the parent flex slot — used
// in a 2x2 driver grid and a 1x2 constructor row.
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
  const teamColor =
    (CONSTRUCTOR_COLORS as Record<string, string>)[teamShort] || constructor?.primaryColor || t.accent;
  const tier = isDriver ? driver!.tier : 'B';
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
      {/* team color slab */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: isDriver ? 5 : 48,
          backgroundColor: teamColor,
        }}
      />

      {/* huge number watermark for drivers */}
      {isDriver && number != null ? (
        <Text
          style={{
            position: 'absolute',
            right: -8,
            top: 0,
            fontFamily: t.fDisp,
            fontWeight: '800',
            fontSize: 180,
            lineHeight: 170,
            color: teamColor,
            opacity: 0.16,
            letterSpacing: -8,
          }}
        >
          {number}
        </Text>
      ) : null}

      {/* tier badge top-right */}
      <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
        <TierChip tier={tier} />
      </View>

      {/* team or "CONSTRUCTOR" tag */}
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

      {/* short on color slab for constructors */}
      {!isDriver ? (
        <Text
          style={{
            position: 'absolute',
            left: 12,
            top: 16,
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

      {/* short + name */}
      <View style={{ position: 'absolute', left: 12, right: 12, bottom: 38 }}>
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
            fontSize: 17,
            color: t.text,
            letterSpacing: -0.4,
            lineHeight: 19,
          }}
          numberOfLines={2}
        >
          {isDriver ? driver!.name : constructor!.name}
        </Text>
      </View>

      {/* cost footer */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 32,
          backgroundColor: t.bg,
          borderTopWidth: 1,
          borderTopColor: t.line,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 10,
        }}
      >
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 8,
            fontWeight: '700',
            color: t.textMute,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
        >
          Cost
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
          <Text style={{ fontFamily: t.fDisp, fontSize: 11, color: t.textDim, fontWeight: '500' }}>−$</Text>
          <Num size={18} weight="800" color={t.danger}>
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
          Garage open
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
        <Text
          style={{
            marginTop: 18,
            fontFamily: t.fSans,
            fontSize: 14.5,
            color: t.textDim,
            lineHeight: 22,
            maxWidth: 290,
          }}
        >
          Set your qualifying lineup, your race lineup, watch the cash roll in. Locks at session start.
        </Text>
      </View>
      <PrimaryBtn title="Set my first lineup" onPress={onContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
