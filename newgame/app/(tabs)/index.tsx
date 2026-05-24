// Lineup tab — Ben mechanic. Each rostered driver/constructor has a row per
// session (Q / R / optional Sprint). Tap the row to open the StakeSheet (pick
// side + stake). The corner WITH/AGAINST toggle flips side inline.
//
// Layout reference: design_handoff_track_limits v2 (May 16).

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { useGarageWithEntities } from '@/hooks/useGarageWithEntities';
import { useUpcomingRace } from '@/hooks/useUpcomingRace';
import { useBenStore } from '@store/ben.store';
import { usePicksStore } from '@store/picks.store';
import { leagueService } from '@services/league.service';
import {
  TopBar,
  Num,
  BankrollChip,
  BetsChip,
  LeagueRankPill,
  DriverPortrait,
  BenLinePill,
  WithAgainstToggle,
  LockedBadge,
  ResultBadge,
  PhaseBanner,
  ActiveBetDot,
  TabletColumn,
  Scoreboard,
  ScoreboardChip,
  summarizeScope,
  BEN_AGAINST,
  BEN_AGAINST_WASH,
} from '@components/tl';
import type { ScopeSummary } from '@components/tl';
import { StakeSheet } from '@components/sheets/StakeSheet';
import { useTheme } from '@/theme';
import { CONSTRUCTOR_COLORS, hexA } from '@/theme/tokens';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { toDate } from '@utils/formatters';
import type { BenLine, Driver, Constructor, League, SessionKey, PickOutcome } from '@/types';

type Phase = 'open' | 'locked' | 'results';

export default function LineupScreen() {
  const t = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const {
    rosteredDrivers,
    rosteredConstructors,
    garage,
    isLoading: garageLoading,
  } = useGarageWithEntities();
  const { data: upcomingRace, isLoading: raceLoading } = useUpcomingRace();

  const benByRace = useBenStore((s) => (upcomingRace?.id ? s.byRaceId[upcomingRace.id] : null));
  const loadBen = useBenStore((s) => s.load);
  const picksDoc = usePicksStore((s) => (upcomingRace?.id ? s.byRaceId[upcomingRace.id] : null));
  const subscribePicks = usePicksStore((s) => s.subscribe);
  const setSide = usePicksStore((s) => s.setSide);
  const setStake = usePicksStore((s) => s.setStake);

  const [scope, setScope] = useState<SessionKey>('race');
  const [primaryLeague, setPrimaryLeague] = useState<League | null>(null);
  const [stakeFor, setStakeFor] = useState<{ kind: 'driver' | 'constructor'; id: string } | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);

  // Picks: Firestore IS the source of truth. Subscribe and the snapshot
  // listener feeds byRaceId. Writes via setSide/setStake go straight to
  // Firestore and the same listener pushes them back instantly (SDK
  // latency compensation). One writer, no races, no manual optimistic state.
  useEffect(() => {
    if (!upcomingRace?.id) return;
    loadBen(upcomingRace.id);
  }, [upcomingRace?.id, loadBen]);

  useEffect(() => {
    if (!userId || !upcomingRace?.id) return;
    const unsubscribe = subscribePicks(userId, upcomingRace.id);
    return unsubscribe;
  }, [userId, upcomingRace?.id, subscribePicks]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const leagues = await leagueService.getMyLeagues(userId);
        if (cancelled) return;
        setPrimaryLeague(leagues[0] ?? null);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Sprint tab only shows on actual sprint weekends. The `hasSprint` boolean
  // and the `schedule.sprint` timestamp are populated independently by the
  // shared races ingestion, and either one can be missing on a given doc, so
  // treat the weekend as a sprint if EITHER signal is present.
  const hasSprintWeekend =
    !!upcomingRace?.hasSprint || !!upcomingRace?.schedule?.sprint;
  const sessionsAvailable = useMemo<SessionKey[]>(() => {
    return hasSprintWeekend ? ['sprint', 'qualifying', 'race'] : ['qualifying', 'race'];
  }, [hasSprintWeekend]);

  // Smart-default the scope to the next un-locked session in calendar order.
  // Once the user picks one manually it's respected for the rest of the visit.
  const [scopeTouched, setScopeTouched] = useState(false);
  useEffect(() => {
    if (!sessionsAvailable.includes(scope)) {
      setScope(sessionsAvailable[0]);
      return;
    }
    if (scopeTouched) return;
    if (!upcomingRace) return;
    const now = Date.now();
    const t = (d?: Date | null) => (d ? d.getTime() : Infinity);
    const sprintAt = upcomingRace.schedule.sprint ? toDate(upcomingRace.schedule.sprint) : null;
    const qualiAt = toDate(upcomingRace.schedule.qualifying);
    const raceAt = toDate(upcomingRace.schedule.race);
    const candidates: Array<{ key: SessionKey; t: number }> = [];
    if (hasSprintWeekend) candidates.push({ key: 'sprint', t: t(sprintAt) });
    candidates.push({ key: 'qualifying', t: t(qualiAt) });
    candidates.push({ key: 'race', t: t(raceAt) });
    // Sort by time, prefer the first session whose start is in the future.
    candidates.sort((a, b) => a.t - b.t);
    const next = candidates.find((c) => c.t > now) ?? candidates[0];
    if (next && next.key !== scope) setScope(next.key);
  }, [sessionsAvailable, scope, scopeTouched, upcomingRace, hasSprintWeekend]);

  const onPickScope = (next: SessionKey) => {
    setScopeTouched(true);
    setScope(next);
  };

  const benSession = benByRace?.[scope] ?? null;

  // Tally WITH / AGAINST counts and total stake for the current scope.
  const tally = useMemo(() => {
    let dWith = 0;
    let dAgainst = 0;
    let cWith = 0;
    let cAgainst = 0;
    let totalStake = 0;
    rosteredDrivers.forEach((d) => {
      const pick = picksDoc?.picks?.[scope]?.[d.id];
      const isAgainst = pick?.side === 'against';
      if (isAgainst) dAgainst++;
      else dWith++;
      totalStake += pick?.stake ?? 0;
    });
    rosteredConstructors.forEach((c) => {
      const pick = picksDoc?.picks?.[scope]?.[c.id];
      const isAgainst = pick?.side === 'against';
      if (isAgainst) cAgainst++;
      else cWith++;
      totalStake += pick?.stake ?? 0;
    });
    return { dWith, dAgainst, cWith, cAgainst, totalStake };
  }, [rosteredDrivers, rosteredConstructors, picksDoc, scope]);

  if (raceLoading || garageLoading) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={['top']}>
        <TopBar recapLabel="Recap" league={primaryLeague} />
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      </SafeAreaView>
    );
  }
  if (!upcomingRace) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={['top']}>
        <TopBar recapLabel="Recap" league={primaryLeague} />
        <View style={styles.center}>
          <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>
            No upcoming race
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const qualiAt = toDate(upcomingRace.schedule.qualifying);
  const raceAt = toDate(upcomingRace.schedule.race);
  const sprintAt = upcomingRace.schedule.sprint ? toDate(upcomingRace.schedule.sprint) : null;
  const sessionStart = scope === 'sprint' ? sprintAt : scope === 'qualifying' ? qualiAt : raceAt;
  const countdownStr = sessionStart ? formatCountdown(sessionStart) : (['—', ''] as [string, string]);
  const linesPosted = benSession && Object.keys(benSession.entities ?? {}).length > 0;

  // Phase per scope: settled outcomes → 'results'; session start passed → 'locked';
  // otherwise 'open'. Locked/results disable card interaction and swap the toggle
  // for a status badge.
  const startForScope = (s: SessionKey): Date | null =>
    (s === 'sprint' ? sprintAt : s === 'qualifying' ? qualiAt : raceAt) ?? null;
  const phaseFor = (s: SessionKey): Phase => {
    const outcomes = picksDoc?.settledOutcomes?.[s];
    if (outcomes && Object.keys(outcomes).length > 0) return 'results';
    const start = startForScope(s);
    if (start && start.getTime() <= Date.now()) return 'locked';
    return 'open';
  };
  const phase = phaseFor(scope);

  // Scoreboard summaries — one per available session, reused by the header chip
  // and the overlay.
  const driverEntities = rosteredDrivers.map((d) => ({ id: d.id, name: d.name }));
  const constructorEntities = rosteredConstructors.map((c) => ({ id: c.id, name: c.name }));
  const summaries = sessionsAvailable.reduce<Record<string, ScopeSummary>>((acc, s) => {
    acc[s] = summarizeScope(s, picksDoc, benByRace?.[s] ?? null, driverEntities, constructorEntities);
    return acc;
  }, {});
  const summaryList = sessionsAvailable.map((s) => summaries[s]);

  const anyAgainst = tally.dAgainst + tally.cAgainst > 0;
  const statusLine = anyAgainst
    ? `${tally.dAgainst + tally.cAgainst} against Ben${tally.totalStake > 0 ? ` · $${tally.totalStake} staked` : ''}`
    : 'All picks with Ben · house defaults';

  // Build the sheet props from whichever entity is open.
  const sheetEntity = stakeFor
    ? stakeFor.kind === 'driver'
      ? rosteredDrivers.find((d) => d.id === stakeFor.id)
      : rosteredConstructors.find((c) => c.id === stakeFor.id)
    : null;
  const sheetLine = stakeFor ? benSession?.entities?.[stakeFor.id] ?? null : null;
  const sheetPick = stakeFor ? picksDoc?.picks?.[scope]?.[stakeFor.id] : undefined;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={['top']}>
      <TopBar
        recapLabel={`R${upcomingRace.round} Recap`}
        league={primaryLeague}
        meta={
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text
              style={{
                fontFamily: t.fMono,
                fontSize: 10,
                fontWeight: '600',
                color: t.textMute,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              R{String(upcomingRace.round).padStart(2, '0')}
            </Text>
            <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: t.textMute, alignSelf: 'center' }} />
            <Text
              style={{
                fontFamily: t.fMono,
                fontSize: 10,
                fontWeight: '600',
                color: t.textMute,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
              numberOfLines={1}
            >
              {upcomingRace.country}
            </Text>
          </View>
        }
        actions={
          <>
            <ScoreboardChip summaries={summaryList} onPress={() => setScoreOpen(true)} />
            <BetsChip placedCount={tally.totalStake > 0 ? 1 : 0} onPress={() => router.push('/standings')} />
            {garage ? <BankrollChip cash={garage.cash} onPress={() => router.push('/(tabs)/shop')} /> : null}
          </>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <TabletColumn>
        {/* Race title */}
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4 }}>
          <Text style={{ fontFamily: t.fDisp, fontWeight: '600', fontSize: 22, letterSpacing: -0.6, color: t.text }}>
            {upcomingRace.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
            <Text style={{ fontFamily: t.fSans, fontSize: 12, color: t.textDim }}>{upcomingRace.circuitName}</Text>
            <LeagueRankPill leagueName={primaryLeague?.name ?? 'Solo'} rank={1} delta={0} onPress={() => router.push('/(tabs)/leagues')} />
          </View>
        </View>

        {/* Scope toggle */}
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
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
            {sessionsAvailable.map((s) => (
              <ScopeBtn
                key={s}
                label={s === 'qualifying' ? 'Qualifying' : s === 'race' ? 'Race' : 'Sprint'}
                sub={s === 'race' ? 'x1.00' : s === 'qualifying' ? 'x0.50' : 'x0.25'}
                active={scope === s}
                onPress={() => onPickScope(s)}
              />
            ))}
          </View>
        </View>

        {/* Countdown */}
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: t.accentSoft,
              borderWidth: 1,
              borderColor: t.accentDim,
              borderRadius: 8,
            }}
          >
            <View>
              <Text
                style={{
                  fontFamily: t.fMono,
                  fontSize: 9,
                  fontWeight: '600',
                  color: t.accent,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                {scope === 'qualifying' ? 'Quali locks in' : scope === 'race' ? 'Race locks in' : 'Sprint locks in'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 2 }}>
                <Num size={18} weight="600">
                  {countdownStr[0]}
                </Num>
                <Num size={14} weight="500" color={t.textDim}>
                  {countdownStr[1]}
                </Num>
              </View>
            </View>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: t.accent }} />
          </View>
        </View>

        <PhaseBanner scope={scope} phase={phase} />

        {!linesPosted ? (
          <View
            style={{
              marginTop: 12,
              marginHorizontal: 16,
              padding: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: t.line,
              backgroundColor: t.surface,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: t.fMono, fontSize: 11, color: t.textDim, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700' }}>
              Ben hasn't posted lines yet
            </Text>
            <Text style={{ marginTop: 6, fontFamily: t.fSans, fontSize: 12, color: t.textMute, textAlign: 'center' }}>
              Default: WITH Ben, no stake. Lines populate closer to the {scope === 'qualifying' ? 'qualifying' : 'session'} start.
            </Text>
          </View>
        ) : null}

        {/* Drivers section */}
        <SectionHeader
          title="Drivers"
          withCount={tally.dWith}
          againstCount={tally.dAgainst}
        />
        <View style={{ paddingHorizontal: 16, gap: 6 }}>
          {rosteredDrivers.map((d) => {
            const pick = picksDoc?.picks?.[scope]?.[d.id];
            return (
              <EntityRow
                key={d.id}
                kind="driver"
                driver={d}
                line={benSession?.entities?.[d.id] ?? null}
                pickSide={pick?.side ?? 'with'}
                pickStake={pick?.stake ?? 0}
                phase={phase}
                result={picksDoc?.settledOutcomes?.[scope]?.[d.id] ?? null}
                onRowPress={() => setStakeFor({ kind: 'driver', id: d.id })}
                onFlip={() => {
                  if (!userId || !upcomingRace) return;
                  const next = (pick?.side ?? 'with') === 'against' ? 'with' : 'against';
                  void setSide(userId, upcomingRace.id, scope, d.id, next);
                }}
              />
            );
          })}
        </View>

        {/* Constructors section */}
        <SectionHeader title="Constructors" withCount={tally.cWith} againstCount={tally.cAgainst} />
        <View style={{ paddingHorizontal: 16, gap: 6 }}>
          {rosteredConstructors.map((c) => {
            const pick = picksDoc?.picks?.[scope]?.[c.id];
            return (
              <EntityRow
                key={c.id}
                kind="constructor"
                team={c}
                line={benSession?.entities?.[c.id] ?? null}
                pickSide={pick?.side ?? 'with'}
                pickStake={pick?.stake ?? 0}
                phase={phase}
                result={picksDoc?.settledOutcomes?.[scope]?.[c.id] ?? null}
                onRowPress={() => setStakeFor({ kind: 'constructor', id: c.id })}
                onFlip={() => {
                  if (!userId || !upcomingRace) return;
                  const next = (pick?.side ?? 'with') === 'against' ? 'with' : 'against';
                  void setSide(userId, upcomingRace.id, scope, c.id, next);
                }}
              />
            );
          })}
        </View>

        {/* Status footer */}
        <View
          style={{
            marginTop: 16,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 10,
              fontWeight: '700',
              color: anyAgainst ? BEN_AGAINST : t.textDim,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            {statusLine}
          </Text>
        </View>
        </TabletColumn>
      </ScrollView>

      {/* Stake sheet */}
      {stakeFor && upcomingRace && userId && sheetEntity ? (
        <StakeSheet
          visible={!!stakeFor}
          onClose={() => setStakeFor(null)}
          entityKind={stakeFor.kind}
          driver={stakeFor.kind === 'driver' ? (sheetEntity as Driver) : undefined}
          team={stakeFor.kind === 'constructor' ? (sheetEntity as Constructor) : undefined}
          scope={scope}
          line={sheetLine}
          initialSide={sheetPick?.side ?? 'with'}
          initialStake={sheetPick?.stake ?? 0}
          cash={garage?.cash ?? 0}
          onApply={async ({ side, stake }) => {
            // Persist both fields. Two store calls — picks.service writes in
            // sequence, so the doc ends in the right state.
            await setSide(userId, upcomingRace.id, scope, stakeFor.id, side);
            await setStake(userId, upcomingRace.id, scope, stakeFor.id, stake);
          }}
          onFlipSide={(next) => {
            // Propagate the side flip to the lineup card immediately so the
            // user sees the new state without having to Save the stake first.
            void setSide(userId, upcomingRace.id, scope, stakeFor.id, next);
          }}
        />
      ) : null}

      <Scoreboard
        visible={scoreOpen}
        onClose={() => setScoreOpen(false)}
        scopes={sessionsAvailable}
        summaries={summaries}
      />
    </SafeAreaView>
  );
}

function ScopeBtn({
  label,
  sub,
  active,
  onPress,
}: {
  label: string;
  sub: string;
  active: boolean;
  onPress: () => void;
}) {
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

function SectionHeader({ title, withCount, againstCount }: { title: string; withCount: number; againstCount: number }) {
  const t = useTheme();
  const { isTablet, scale } = useDeviceLayout();
  const titleFont = scale(isTablet ? 14 : 11);
  const countFont = scale(isTablet ? 13 : 10);
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: isTablet ? 22 : 16,
        paddingBottom: isTablet ? 12 : 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Text
        style={{
          fontFamily: t.fMono,
          fontSize: titleFont,
          fontWeight: '500',
          color: t.textMute,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: countFont,
            fontWeight: '700',
            color: t.textDim,
            letterSpacing: 0.8,
          }}
        >
          WITH · {withCount}
        </Text>
        <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: countFont }}>/</Text>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: countFont,
            fontWeight: '700',
            color: againstCount > 0 ? BEN_AGAINST : t.textMute,
            letterSpacing: 0.8,
          }}
        >
          AGAINST · {againstCount}
        </Text>
      </View>
    </View>
  );
}

function EntityRow(props: {
  kind: 'driver' | 'constructor';
  driver?: Driver;
  team?: Constructor;
  line: BenLine | null;
  pickSide: 'with' | 'against';
  pickStake: number;
  phase?: Phase;
  result?: PickOutcome | null;
  onRowPress: () => void;
  onFlip: () => void;
}) {
  const t = useTheme();
  const { isTablet, scale } = useDeviceLayout();
  const isDriver = props.kind === 'driver';
  const driver = props.driver;
  const team = props.team;
  const name = isDriver ? driver!.name : team!.name;
  const teamShort = isDriver ? (driver!.constructorName || '').slice(0, 3).toUpperCase() : team!.shortName;
  const teamColor =
    (CONSTRUCTOR_COLORS as Record<string, string>)[teamShort] || team?.primaryColor || t.accent;
  const against = props.pickSide === 'against';
  const hasBet = props.pickStake > 0;
  const phase: Phase = props.phase ?? 'open';
  const interactive = phase === 'open';

  // Tablet sizing: bigger portraits, larger names, more padding so cards have
  // presence on a tablet canvas instead of looking like phone-sized chiclets.
  // All sizes pass through scale() so the user's display-size preference
  // multiplies on top of the tablet-vs-phone base.
  //
  // Base sizes bumped ~15% from the original (May 20) — driver/constructor
  // cards were reading too small on phone next to the rest of the chrome.
  const padding = scale(isTablet ? 19 : 11);
  const gap = scale(isTablet ? 17 : 11);
  const portraitSize = scale(isTablet ? 68 : 50);
  const nameFont = scale(isTablet ? 21 : 16);
  const stripeMinH = scale(isTablet ? 68 : 50);

  // Layout: WITH/AGAINST toggle is ABSOLUTELY positioned so it's outside the
  // flex flow entirely — zero risk that the row-body Pressable's flex:1
  // bounds overlap with the toggle's hit area. Row body Pressable has
  // explicit paddingRight so the avatar/name/pill don't visually run under
  // the toggle.
  const togglePadRight = scale(isTablet ? 200 : 140); // toggle width + gap

  return (
    <View
      style={{
        position: 'relative',
        backgroundColor: t.surface,
        borderRadius: isTablet ? 14 : 12,
        borderWidth: against ? 1.5 : 1,
        borderColor: against ? BEN_AGAINST : t.line,
        overflow: 'hidden',
        opacity: phase === 'locked' ? 0.7 : 1,
      }}
    >
      {against ? (
        <LinearGradient
          colors={[BEN_AGAINST_WASH, 'rgba(156,175,136,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 0.6, y: 0.5 }}
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      <Pressable
        onPress={interactive ? props.onRowPress : undefined}
        disabled={!interactive}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap,
          padding,
          paddingRight: padding + togglePadRight,
          opacity: pressed && interactive ? 0.85 : 1,
        })}
      >
        {isDriver ? (
          <DriverPortrait driver={driver!} size={portraitSize} />
        ) : (
          <View style={{ width: isTablet ? 6 : 4, alignSelf: 'stretch', minHeight: stripeMinH, borderRadius: 3, backgroundColor: teamColor }} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: isTablet ? 6 : 4 }}>
            <Text
              style={{ fontFamily: t.fDisp, fontWeight: '600', fontSize: nameFont, color: t.text, letterSpacing: -0.3 }}
              numberOfLines={1}
            >
              {name}
            </Text>
            {hasBet ? <ActiveBetDot amount={props.pickStake} against={against} /> : null}
          </View>
          {props.line ? (
            <BenLinePill
              kind={props.kind}
              lo={props.line.predictedLo}
              hi={props.line.predictedHi}
              ou={props.line.line}
              oddsWith={props.line.withOdds}
              oddsAgainst={props.line.againstOdds}
            />
          ) : (
            <Text style={{ fontFamily: t.fMono, fontSize: isTablet ? 12 : 10, color: t.textMute, letterSpacing: 0.6 }}>
              Ben hasn't posted yet
            </Text>
          )}
        </View>
      </Pressable>
      <View style={{ position: 'absolute', right: padding, top: 0, bottom: 0, justifyContent: 'center' }}>
        {phase === 'results' && props.result ? (
          <ResultBadge won={props.result.won} payout={props.result.payout} />
        ) : phase === 'locked' ? (
          <LockedBadge side={props.pickSide} stake={props.pickStake} />
        ) : (
          <WithAgainstToggle side={props.pickSide} onFlip={props.onFlip} />
        )}
      </View>
    </View>
  );
}

function formatCountdown(target: Date, now: Date = new Date()): [string, string] {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return ['NOW', ''];
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin - days * 60 * 24) / 60);
  const minutes = totalMin - days * 60 * 24 - hours * 60;
  if (days > 0) return [`${days}d ${String(hours).padStart(2, '0')}h`, `${String(minutes).padStart(2, '0')}m`];
  if (hours > 0) return [`${hours}h`, `${String(minutes).padStart(2, '0')}m`];
  return [`${minutes}m`, ''];
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
