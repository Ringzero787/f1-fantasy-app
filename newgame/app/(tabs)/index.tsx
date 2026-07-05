// Lineup tab — Ben mechanic. Each rostered driver/constructor has a row per
// session (Q / R / optional Sprint). Tap the row to open the StakeSheet (pick
// side + stake). The corner WITH/AGAINST toggle flips side inline.
//
// Layout reference: design_handoff_track_limits v2 (May 16).

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@store/auth.store';
import { useGarageWithEntities } from '@/hooks/useGarageWithEntities';
import { useGarageStore } from '@store/garage.store';
import { useUpcomingRace } from '@/hooks/useUpcomingRace';
import { useBenStore } from '@store/ben.store';
import { usePicksStore } from '@store/picks.store';
import { leagueService } from '@services/league.service';
import { resultsService } from '@services/results.service';
import { leaderboardService } from '@services/leaderboard.service';
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
  SessionSummary,
  useSessionSummary,
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

type Phase = 'open' | 'locked' | 'complete' | 'results';

// Picks lock a short cushion BEFORE the scheduled session start, so nobody can
// sneak an edit during the out/formation lap.
const LOCK_BUFFER_MS = 5 * 60_000;

// We only store session START times, not ends. To tell "running" (locked) from
// "finished" (complete) we treat a session as over this long after its start.
// Generous upper bounds (red flags, overruns) — better to read "locked" a bit
// long than flip to "complete" mid-session.
const SESSION_DURATION_MS: Record<SessionKey, number> = {
  sprint: 90 * 60_000,
  qualifying: 90 * 60_000,
  race: 210 * 60_000,
};

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
  const refreshGarage = useGarageStore((s) => s.refresh);
  const { data: upcomingRace, isLoading: raceLoading } = useUpcomingRace();

  // Last completed race — after settlement the screen HOLDS on it (W/L tiles +
  // weekend recap) until Ben's lines for the next race are posted, then flips
  // to the new race in the resting state.
  const { data: lastCompletedRace } = useQuery({
    queryKey: ['tl', 'last-completed-race'],
    queryFn: () => resultsService.getMostRecentCompletedRace(),
    staleTime: 5 * 60_000,
  });

  const benAll = useBenStore((s) => s.byRaceId);
  const loadBen = useBenStore((s) => s.load);
  const picksAll = usePicksStore((s) => s.byRaceId);
  const subscribePicks = usePicksStore((s) => s.subscribe);
  const setSide = usePicksStore((s) => s.setSide);
  const setStake = usePicksStore((s) => s.setStake);
  const clearPick = usePicksStore((s) => s.clearPick);

  const [scope, setScope] = useState<SessionKey>('race');
  const [primaryLeague, setPrimaryLeague] = useState<League | null>(null);
  const [stakeFor, setStakeFor] = useState<{ kind: 'driver' | 'constructor'; id: string } | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);

  // Picks: Firestore IS the source of truth. Subscribe and the snapshot
  // listener feeds byRaceId. We load lines + subscribe picks for BOTH the
  // upcoming race and the last completed race: the upcoming lines tell us when
  // to release the hold, and the completed race's picks carry the settled W/L
  // outcomes the held tiles render.
  useEffect(() => {
    if (!upcomingRace?.id) return;
    loadBen(upcomingRace.id);
  }, [upcomingRace?.id, loadBen]);
  useEffect(() => {
    if (!lastCompletedRace?.id) return;
    loadBen(lastCompletedRace.id);
  }, [lastCompletedRace?.id, loadBen]);

  useEffect(() => {
    if (!userId || !upcomingRace?.id) return;
    const unsubscribe = subscribePicks(userId, upcomingRace.id);
    return unsubscribe;
  }, [userId, upcomingRace?.id, subscribePicks]);
  useEffect(() => {
    if (!userId || !lastCompletedRace?.id) return;
    const unsubscribe = subscribePicks(userId, lastCompletedRace.id);
    return unsubscribe;
  }, [userId, lastCompletedRace?.id, subscribePicks]);

  // Hold decision: stay on the settled race while the next race has no lines.
  const upcomingBen = upcomingRace?.id ? benAll[upcomingRace.id] : null;
  const nextLinesPosted =
    !!upcomingBen &&
    Object.values(upcomingBen).some((d) => d && Object.keys(d.entities ?? {}).length > 0);
  const lastPicksDoc = lastCompletedRace?.id ? picksAll[lastCompletedRace.id] : null;
  const lastRaceSettled =
    !!lastPicksDoc?.settledOutcomes && Object.keys(lastPicksDoc.settledOutcomes).length > 0;
  const holdingOnResults = !!lastCompletedRace && lastRaceSettled && !nextLinesPosted;
  const displayRace = holdingOnResults ? lastCompletedRace : upcomingRace;

  const benByRace = displayRace?.id ? benAll[displayRace.id] : null;
  const picksDoc = displayRace?.id ? picksAll[displayRace.id] : null;

  // While holding, the season running totals give the wrap its week-to-week
  // context ("am I up or down on the year?").
  const { data: seasonScore } = useQuery({
    queryKey: ['tl', 'my-season', userId, displayRace?.seasonId],
    queryFn: () =>
      userId && displayRace?.seasonId
        ? leaderboardService.getMySeason(userId, displayRace.seasonId)
        : Promise.resolve(null),
    enabled: !!userId && !!displayRace?.seasonId && lastRaceSettled,
    staleTime: 60_000,
  });

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
    !!displayRace?.hasSprint || !!displayRace?.schedule?.sprint;
  const sessionsAvailable = useMemo<SessionKey[]>(() => {
    return hasSprintWeekend ? ['sprint', 'qualifying', 'race'] : ['qualifying', 'race'];
  }, [hasSprintWeekend]);

  // Sessions with graded outcomes (results phase) — drives the auto-popping
  // Session Summary. Derived purely from settledOutcomes, so it's safe to
  // compute up here (before the loading/early-return guards) where hooks live.
  const settledScopes = useMemo<SessionKey[]>(
    () =>
      sessionsAvailable.filter((s) => {
        const o = picksDoc?.settledOutcomes?.[s];
        return !!o && Object.keys(o).length > 0;
      }),
    [sessionsAvailable, picksDoc],
  );
  const summary = useSessionSummary(displayRace?.id, settledScopes);

  // Smart-default the scope to the next un-locked session in calendar order.
  // Once the user picks one manually it's respected for the rest of the visit.
  const [scopeTouched, setScopeTouched] = useState(false);
  useEffect(() => {
    if (!sessionsAvailable.includes(scope)) {
      setScope(sessionsAvailable[0]);
      return;
    }
    if (scopeTouched) return;
    if (!displayRace) return;
    // Holding on a settled weekend → default to the GP result (the headline).
    if (holdingOnResults) {
      if (scope !== 'race') setScope('race');
      return;
    }
    const now = Date.now();
    const t = (d?: Date | null) => (d ? d.getTime() : Infinity);
    const sprintAt = displayRace.schedule.sprint ? toDate(displayRace.schedule.sprint) : null;
    const qualiAt = toDate(displayRace.schedule.qualifying);
    const raceAt = toDate(displayRace.schedule.race);
    const candidates: Array<{ key: SessionKey; t: number }> = [];
    if (hasSprintWeekend) candidates.push({ key: 'sprint', t: t(sprintAt) });
    candidates.push({ key: 'qualifying', t: t(qualiAt) });
    candidates.push({ key: 'race', t: t(raceAt) });
    // Sort by time, prefer the first session whose start is in the future.
    candidates.sort((a, b) => a.t - b.t);
    const next = candidates.find((c) => c.t > now) ?? candidates[0];
    if (next && next.key !== scope) setScope(next.key);
  }, [sessionsAvailable, scope, scopeTouched, displayRace, holdingOnResults, hasSprintWeekend]);

  const onPickScope = (next: SessionKey) => {
    setScopeTouched(true);
    setScope(next);
  };

  const benSession = benByRace?.[scope] ?? null;

  // Tally WITH / AGAINST counts and total stake for the current scope.
  const tally = useMemo(() => {
    let dWith = 0;
    let dAgainst = 0;
    let dNone = 0;
    let cWith = 0;
    let cAgainst = 0;
    let cNone = 0;
    let totalStake = 0;
    const count = (side: 'with' | 'against' | undefined, stake: number, isDriver: boolean) => {
      if (side === 'against') isDriver ? dAgainst++ : cAgainst++;
      else if (side === 'with') isDriver ? dWith++ : cWith++;
      else isDriver ? dNone++ : cNone++;
      totalStake += stake;
    };
    rosteredDrivers.forEach((d) => {
      const pick = picksDoc?.picks?.[scope]?.[d.id];
      count(pick?.side, pick?.stake ?? 0, true);
    });
    rosteredConstructors.forEach((c) => {
      const pick = picksDoc?.picks?.[scope]?.[c.id];
      count(pick?.side, pick?.stake ?? 0, false);
    });
    const picked = dWith + dAgainst + cWith + cAgainst;
    const unpicked = dNone + cNone;
    return { dWith, dAgainst, dNone, cWith, cAgainst, cNone, picked, unpicked, totalStake };
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
  if (!displayRace) {
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

  const qualiAt = toDate(displayRace.schedule.qualifying);
  const raceAt = toDate(displayRace.schedule.race);
  const sprintAt = displayRace.schedule.sprint ? toDate(displayRace.schedule.sprint) : null;
  const sessionStart = scope === 'sprint' ? sprintAt : scope === 'qualifying' ? qualiAt : raceAt;
  // Countdown targets the LOCK moment (start − buffer), so "locks in" is honest.
  const lockTarget = sessionStart ? new Date(sessionStart.getTime() - LOCK_BUFFER_MS) : null;
  const countdownStr = lockTarget ? formatCountdown(lockTarget) : (['—', ''] as [string, string]);
  const linesPosted = benSession && Object.keys(benSession.entities ?? {}).length > 0;

  // Phase per scope:
  //   results  — settlement outcomes exist for the session
  //   complete — session finished (start + duration passed) but not yet graded
  //   locked   — within the lock buffer of start, or running
  //   open     — still editable
  const startForScope = (s: SessionKey): Date | null =>
    (s === 'sprint' ? sprintAt : s === 'qualifying' ? qualiAt : raceAt) ?? null;
  const phaseFor = (s: SessionKey): Phase => {
    const outcomes = picksDoc?.settledOutcomes?.[s];
    if (outcomes && Object.keys(outcomes).length > 0) return 'results';
    const start = startForScope(s);
    if (!start) return 'open';
    const now = Date.now();
    if (now < start.getTime() - LOCK_BUFFER_MS) return 'open';
    const ended =
      now >= start.getTime() + SESSION_DURATION_MS[s] ||
      (s === 'race' && (displayRace.status === 'completed' || !!displayRace.results?.raceResults?.length));
    return ended ? 'complete' : 'locked';
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
  const noPicks = tally.picked === 0;
  const againstN = tally.dAgainst + tally.cAgainst;
  const statusLine = noPicks
    ? "No picks — make a call or you score nothing"
    : `${tally.picked} pick${tally.picked === 1 ? '' : 's'}` +
      (anyAgainst ? ` · ${againstN} against Ben` : '') +
      (tally.totalStake > 0 ? ` · $${tally.totalStake} staked` : '') +
      (tally.unpicked > 0 ? ` · ${tally.unpicked} unpicked` : '');

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
        recapLabel={`R${displayRace.round} Recap`}
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
              R{String(displayRace.round).padStart(2, '0')}
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
              {displayRace.country}
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
            {displayRace.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
            <Text style={{ fontFamily: t.fSans, fontSize: 12, color: t.textDim }}>{displayRace.circuitName}</Text>
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
                status={phaseFor(s)}
                active={scope === s}
                onPress={() => onPickScope(s)}
              />
            ))}
          </View>
        </View>

        {/* Countdown — only while the session is still open; once it locks the
            PhaseBanner below conveys state instead. */}
        {phase === 'open' ? (
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
        ) : null}

        <PhaseBanner scope={scope} phase={phase} />

        {!linesPosted && phase === 'open' ? (
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
              No pick is the default — you score nothing unless you call it. Lines populate closer to the {scope === 'qualifying' ? 'qualifying' : 'session'} start.
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
                pickSide={pick?.side ?? 'none'}
                pickStake={pick?.stake ?? 0}
                phase={phase}
                result={picksDoc?.settledOutcomes?.[scope]?.[d.id] ?? null}
                onRowPress={() => setStakeFor({ kind: 'driver', id: d.id })}
                onSelect={(next) => {
                  if (!userId || !displayRace) return;
                  if (next === 'none') void clearPick(userId, displayRace.id, scope, d.id);
                  else void setSide(userId, displayRace.id, scope, d.id, next);
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
                pickSide={pick?.side ?? 'none'}
                pickStake={pick?.stake ?? 0}
                phase={phase}
                result={picksDoc?.settledOutcomes?.[scope]?.[c.id] ?? null}
                onRowPress={() => setStakeFor({ kind: 'constructor', id: c.id })}
                onSelect={(next) => {
                  if (!userId || !displayRace) return;
                  if (next === 'none') void clearPick(userId, displayRace.id, scope, c.id);
                  else void setSide(userId, displayRace.id, scope, c.id, next);
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
              color: noPicks ? t.warn : anyAgainst ? BEN_AGAINST : t.textDim,
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
      {stakeFor && displayRace && userId && sheetEntity ? (
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
          // Budget for THIS entity = free cash + its own already-escrowed stake
          // (the server refunds the old stake before applying the new one).
          cash={(garage?.cash ?? 0) + (sheetPick?.stake ?? 0)}
          onApply={async ({ side, stake }) => {
            // Side first (cash-free), then the stake — the latter escrows cash
            // server-side and can be rejected if the bankroll can't cover it.
            // Refresh the garage afterwards so the bankroll reflects the escrow.
            try {
              await setSide(userId, displayRace.id, scope, stakeFor.id, side);
              await setStake(userId, displayRace.id, scope, stakeFor.id, stake);
              await refreshGarage(userId);
            } catch (err) {
              await refreshGarage(userId);
              Alert.alert(
                'Stake not placed',
                err instanceof Error ? err.message : 'Could not place that stake.'
              );
            }
          }}
          onFlipSide={(next) => {
            // Propagate the side flip to the lineup card immediately so the
            // user sees the new state without having to Save the stake first.
            void setSide(userId, displayRace.id, scope, stakeFor.id, next);
          }}
        />
      ) : null}

      <Scoreboard
        visible={scoreOpen}
        onClose={() => setScoreOpen(false)}
        scopes={sessionsAvailable}
        summaries={summaries}
        onOpenRecap={() => {
          setScoreOpen(false);
          summary.openManually();
        }}
      />

      <SessionSummary
        visible={summary.open}
        scopes={summary.scopes}
        summaries={summaries}
        season={seasonScore ?? null}
        onClose={summary.close}
      />
    </SafeAreaView>
  );
}

function ScopeBtn({
  label,
  sub,
  status = 'open',
  active,
  onPress,
}: {
  label: string;
  sub: string;
  status?: Phase;
  active: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  // While open, the sub line shows the scoring multiplier. Once the session
  // locks it shows the state instead, so all sessions read at a glance.
  const subText =
    status === 'locked' ? 'LOCKED' : status === 'complete' ? 'DONE' : status === 'results' ? 'SETTLED' : sub;
  const subColor = active
    ? '#0E1116'
    : status === 'locked'
      ? t.warn
      : status === 'complete'
        ? t.accent
        : status === 'results'
          ? t.success
          : t.textMute;
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
          color: subColor,
          fontFamily: t.fMono,
          fontSize: 9,
          fontWeight: status === 'open' ? '600' : '800',
          letterSpacing: 1,
          textAlign: 'center',
          opacity: active ? (status === 'open' ? 0.6 : 0.8) : 0.9,
        }}
      >
        {subText}
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
  pickSide: 'with' | 'against' | 'none';
  pickStake: number;
  phase?: Phase;
  result?: PickOutcome | null;
  onRowPress: () => void;
  onSelect: (next: 'with' | 'against' | 'none') => void;
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

  // Settled outcome — drives the persistent win/loss tile highlight. Net cash =
  // payout minus stake on a win, minus the stake on a loss; points = the
  // session-weighted call credit. Both stay visible through the results phase.
  const settled = phase === 'results' && !!props.result;
  const won = settled && props.result!.won === true;
  const lost = settled && props.result!.won === false;
  const netCash = props.result ? (props.result.won ? props.result.payout - props.result.stake : -props.result.stake) : 0;
  const outcomePoints = props.result?.pointsCredit ?? 0;
  // A missed AGAINST bet actually lost cash → hard red. A missed WITH call had no
  // money at stake, so it's just "didn't score" → softer sage, not a painful loss.
  const lostMoney = lost && (props.result!.side === 'against' || netCash < 0);
  const lostSoft = lost && !lostMoney;

  return (
    <View
      style={{
        position: 'relative',
        backgroundColor: t.surface,
        borderRadius: isTablet ? 14 : 12,
        borderWidth: won || lost || against ? 1.5 : 1,
        borderColor: won ? t.success : lostMoney ? t.danger : lostSoft || against ? BEN_AGAINST : t.line,
        overflow: 'hidden',
        opacity: phase === 'locked' || phase === 'complete' ? 0.7 : 1,
      }}
    >
      {won || lostMoney ? (
        <LinearGradient
          colors={[hexA(won ? t.success : t.danger, 0.18), 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 0.75, y: 0.5 }}
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : lostSoft || against ? (
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
            {props.line?.bestBet ? <BestBetChip /> : null}
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
              benCall={props.line.benCall}
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
          <ResultBadge won={props.result.won} netCash={netCash} points={outcomePoints} side={props.result.side} />
        ) : phase === 'locked' || phase === 'complete' ? (
          <LockedBadge side={props.pickSide} stake={props.pickStake} variant={phase === 'complete' ? 'complete' : 'locked'} />
        ) : (
          <WithAgainstToggle side={props.pickSide} onSelect={props.onSelect} />
        )}
      </View>
    </View>
  );
}

// "Ben's Best" chip — flags one of Ben's 3 featured picks for the GP. Betting
// against it is boosted risk/reward (profit ×1.5 / −1 pt), spelled out in the
// StakeSheet when the player flips to AGAINST.
function BestBetChip() {
  const t = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 5,
        paddingVertical: 1.5,
        borderRadius: 4,
        backgroundColor: hexA(t.warn, 0.16),
        borderWidth: 1,
        borderColor: hexA(t.warn, 0.5),
      }}
    >
      <Text style={{ fontFamily: t.fMono, fontSize: 8, fontWeight: '800', color: t.warn, letterSpacing: 0.8 }}>
        ★ BEN'S BEST
      </Text>
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
