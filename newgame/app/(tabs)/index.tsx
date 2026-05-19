// Lineup tab — Ben mechanic. Each rostered driver/constructor has a row per
// session (Q / R / optional Sprint). Tap the row to open the StakeSheet (pick
// side + stake). The corner WITH/AGAINST toggle flips side inline.
//
// Layout reference: design_handoff_track_limits v2 (May 16).

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  ActiveBetDot,
  TabletColumn,
} from '@components/tl';
import { StakeSheet } from '@components/sheets/StakeSheet';
import { useTheme } from '@/theme';
import { CONSTRUCTOR_COLORS, hexA } from '@/theme/tokens';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { toDate } from '@utils/formatters';
import type { BenLine, Driver, Constructor, League, SessionKey } from '@/types';

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
  const loadPicks = usePicksStore((s) => s.load);
  const setSide = usePicksStore((s) => s.setSide);
  const setStake = usePicksStore((s) => s.setStake);

  const [scope, setScope] = useState<SessionKey>('race');
  const [primaryLeague, setPrimaryLeague] = useState<League | null>(null);
  const [stakeFor, setStakeFor] = useState<{ kind: 'driver' | 'constructor'; id: string } | null>(null);

  useEffect(() => {
    if (!upcomingRace?.id) return;
    loadBen(upcomingRace.id);
    if (userId) loadPicks(userId, upcomingRace.id);
  }, [upcomingRace?.id, userId, loadBen, loadPicks]);

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

  // Sprint tab only shows on actual sprint weekends (per the race schedule),
  // not just whenever Ben happens to have posted sprint lines.
  const hasSprintWeekend = !!upcomingRace?.hasSprint;
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
                onRowPress={() => setStakeFor({ kind: 'driver', id: d.id })}
                onSelect={(next) => {
                  if (!userId || !upcomingRace) return;
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
                onRowPress={() => setStakeFor({ kind: 'constructor', id: c.id })}
                onSelect={(next) => {
                  if (!userId || !upcomingRace) return;
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
              color: anyAgainst ? t.danger : t.textDim,
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
        />
      ) : null}
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
            color: againstCount > 0 ? t.danger : t.textMute,
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
  onRowPress: () => void;
  onSelect: (next: 'with' | 'against') => void;
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

  // Tablet sizing: bigger portraits, larger names, more padding so cards have
  // presence on a tablet canvas instead of looking like phone-sized chiclets.
  // All sizes pass through scale() so the user's display-size preference
  // multiplies on top of the tablet-vs-phone base.
  const padding = scale(isTablet ? 16 : 10);
  const gap = scale(isTablet ? 14 : 10);
  const portraitSize = scale(isTablet ? 60 : 42);
  const nameFont = scale(isTablet ? 18 : 14);
  const stripeMinH = scale(isTablet ? 60 : 42);

  return (
    <Pressable
      onPress={props.onRowPress}
      style={({ pressed }) => [
        {
          backgroundColor: t.surface,
          borderRadius: isTablet ? 14 : 12,
          borderWidth: against ? 1.5 : 1,
          borderColor: against ? t.danger : t.line,
          overflow: 'hidden',
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      {against ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0 as unknown as number,
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: hexA(t.danger, 0.08),
          }}
        />
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap, padding }}>
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
        <WithAgainstToggle side={props.pickSide} onSelect={props.onSelect} />
      </View>
    </Pressable>
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
