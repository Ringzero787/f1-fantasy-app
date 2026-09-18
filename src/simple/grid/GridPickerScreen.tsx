import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, Modal, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { useSimpleTeam } from '../hooks/useSimpleTeam';
import { useDrivers } from '../../hooks/useDrivers';
import { useConstructors } from '../../hooks/useConstructors';
import { useLockoutStatus } from '../../hooks/useLockoutStatus';
import { useTeamStore, isDriverLockedOut } from '../../store/team.store';
import { useAdminStore } from '../../store/admin.store';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { useRaceScoresStore } from '../../store/raceScores.store';
import { usePrefsStore } from '../../store/prefs.store';
import { teamAccent } from '../theme/simpleTheme';
import { TEAM_SIZE } from '../../config/constants';
import { PRICING_CONFIG } from '../../config/pricing.config';
import { constructorShortName } from './entityNames';
import { ColorBar, MonoLabel, PillButton, ScreenHeader, SegmentPill } from './GridBits';
import { formatLockStatus } from './lockStatus';
import { trendOf, surnameOf as surname } from './tileState';
import {
  planLineup, pendingFromCurrent, canAffordAdd, constructorSwapBudget, saveLabel,
  type PendingLineup, type CurrentLineup, type MarketEntry, type LineupPlan, type Kind,
} from './lineupPlan';
import type { Driver, Constructor } from '../../types';

type Tab = 'drivers' | 'constructors';
type Sort = 'pts' | 'price';

interface Row {
  kind: Kind;
  id: string;
  num: string;          // car number or constructor code
  name: string;         // surname / short constructor name
  sub: string;          // team short name / full constructor name
  constructorId: string;
  pts: number;
  price: number;
  fullName: string;
  selected: boolean;
  blocked: boolean;     // 35% opacity, no tap
}

const CONTRACTS = [1, 2, 3, 4, 5, 6];
const LOW_BUDGET = 50;

interface Props {
  initialTab?: Tab;
}

// Pick Team (TRANSITION.md §4 Picker + §1 budget / contract / save summary).
export function GridPickerScreen({ initialTab = 'drivers' }: Props) {
  const { colors, family, spacing, scaled, mono, isDark } = useSimpleTheme();
  const insets = useSafeAreaInsets();
  const { team, teamConstructor, budget } = useSimpleTeam();
  const { data: allDrivers } = useDrivers();
  const { data: allConstructors } = useConstructors();
  const lockoutInfo = useLockoutStatus();
  const races = useRemoteConfigStore((s) => s.races);
  const lastRaceScores = useRaceScoresStore((s) => s.lastRaceScores);
  const prevRaceScores = useRaceScoresStore((s) => s.prevRaceScores);
  const completedRaceCount = useAdminStore((s) => s.getCompletedRaceCount());
  const displayScale = usePrefsStore((s) => s.displayScale);

  const locked = lockoutInfo.isLocked || !(team?.lockStatus?.canModify ?? true);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [sort, setSort] = useState<Sort>('pts');
  const [pending, setPending] = useState<PendingLineup | null>(null);
  const [sheet, setSheet] = useState<{ kind: Kind; entry: MarketEntry } | null>(null);
  const [contract, setContract] = useState<number>(PRICING_CONFIG.CONTRACT_LENGTH);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Current roster in planner shape.
  const current = useMemo<CurrentLineup | null>(() => {
    if (!team) return null;
    return {
      budget,
      drivers: (team.drivers ?? []).map((d) => ({ id: d.driverId, name: surname(d.name), currentPrice: d.currentPrice, contractLength: d.contractLength, racesHeld: d.racesHeld, isReservePick: d.isReservePick })),
      constructor: teamConstructor ? { id: teamConstructor.constructorId, name: constructorShortName(teamConstructor.constructorId, teamConstructor.name), currentPrice: teamConstructor.currentPrice, contractLength: teamConstructor.contractLength, racesHeld: teamConstructor.racesHeld, isReservePick: teamConstructor.isReservePick } : null,
    };
  }, [team, teamConstructor, budget]);

  // (Re)seed the pending lineup when the team loads or changes identity.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (current && team && seededFor !== team.id) {
      setPending(pendingFromCurrent(current));
      setSeededFor(team.id);
    }
  }, [current, team, seededFor]);

  const market = useMemo(() => {
    const drivers: Record<string, MarketEntry> = {};
    for (const d of allDrivers ?? []) drivers[d.id] = { id: d.id, name: surname(d.name), price: d.price };
    const constructors: Record<string, MarketEntry> = {};
    for (const c of allConstructors ?? []) constructors[c.id] = { id: c.id, name: constructorShortName(c.id, c.name), price: c.price };
    return { drivers, constructors };
  }, [allDrivers, allConstructors]);

  const plan = useMemo<LineupPlan | null>(() => {
    if (!current || !pending) return null;
    return planLineup(current, pending, market, { teamSize: TEAM_SIZE, defaultContract: PRICING_CONFIG.CONTRACT_LENGTH });
  }, [current, pending, market]);

  const driversFull = (pending?.driverIds.length ?? 0) >= TEAM_SIZE;
  const ctorSwapBudget = plan && current && pending ? constructorSwapBudget(plan, current, pending, market.constructors) : 0;

  const rows = useMemo<Row[]>(() => {
    if (!pending || !plan) return [];
    const list: Row[] = tab === 'drivers'
      ? (allDrivers ?? []).map((d: Driver) => {
          const selected = pending.driverIds.includes(d.id);
          const onRoster = current?.drivers.some((r) => r.id === d.id) ?? false;
          const lockedOut = isDriverLockedOut(team?.driverLockouts, d.id, completedRaceCount);
          const affordable = onRoster || canAffordAdd(plan, d.price);
          return {
            kind: 'driver', id: d.id, num: String(d.number ?? '').padStart(2, '0'), name: surname(d.name), fullName: d.name,
            sub: constructorShortName(d.constructorId, d.constructorName), constructorId: d.constructorId,
            pts: d.currentSeasonPoints ?? d.fantasyPoints ?? 0, price: d.price, selected,
            blocked: locked || (!selected && (driversFull || lockedOut || !affordable)),
          };
        })
      : (allConstructors ?? []).map((c: Constructor) => {
          const selected = pending.constructorId === c.id;
          const isCurrent = current?.constructor?.id === c.id;
          const affordable = isCurrent || c.price <= ctorSwapBudget;
          return {
            kind: 'constructor', id: c.id, num: c.shortName?.slice(0, 3).toUpperCase() ?? '', name: constructorShortName(c.id, c.name), fullName: c.name,
            sub: c.name, constructorId: c.id, pts: c.currentSeasonPoints ?? c.fantasyPoints ?? 0, price: c.price, selected,
            blocked: locked || (!selected && !affordable),
          };
        });
    list.sort((a, b) => (sort === 'pts' ? b.pts - a.pts : b.price - a.price));
    return list;
  }, [tab, allDrivers, allConstructors, pending, plan, current, team?.driverLockouts, completedRaceCount, locked, driversFull, ctorSwapBudget, sort]);

  const onRowPress = useCallback((row: Row) => {
    if (!pending || !current || row.blocked) return;
    if (row.kind === 'driver') {
      if (row.selected) {
        setPending({ ...pending, driverIds: pending.driverIds.filter((id) => id !== row.id) });
        return;
      }
      const onRoster = current.drivers.some((r) => r.id === row.id);
      if (onRoster) { setPending({ ...pending, driverIds: [...pending.driverIds, row.id] }); return; }
      setContract(PRICING_CONFIG.CONTRACT_LENGTH);
      setSheet({ kind: 'driver', entry: { id: row.id, name: row.fullName, price: row.price } });
    } else {
      if (row.selected) { setPending({ ...pending, constructorId: null }); return; }
      if (current.constructor?.id === row.id) { setPending({ ...pending, constructorId: row.id }); return; }
      setContract(PRICING_CONFIG.CONTRACT_LENGTH);
      setSheet({ kind: 'constructor', entry: { id: row.id, name: row.fullName, price: row.price } });
    }
  }, [pending, current]);

  const confirmSheet = useCallback(() => {
    if (!sheet || !pending) return;
    const contracts = { ...pending.contracts, [sheet.entry.id]: contract };
    if (sheet.kind === 'driver') setPending({ ...pending, driverIds: [...pending.driverIds, sheet.entry.id], contracts });
    else setPending({ ...pending, constructorId: sheet.entry.id, contracts });
    setSheet(null);
  }, [sheet, pending, contract]);

  // Commit: driver sells first (frees budget), then the constructor change (a
  // downgrade's proceeds fund driver buys; an upgrade is covered by the sells),
  // then driver buys.
  // Each step is its own server transaction, so a failure part-way leaves the
  // earlier steps applied; the alert says exactly what went through and the
  // pending lineup re-seeds from what the server now holds.
  const applyPlan = useCallback(async () => {
    if (!plan || !pending || !current || !team) return;
    setApplying(true);
    const store = useTeamStore.getState();
    const done: string[] = [];
    const step = async (label: string, fn: () => Promise<void>) => {
      useTeamStore.setState({ error: null });
      await fn();
      const err = useTeamStore.getState().error;
      if (err) throw new Error(`${label} failed: ${err}`);
      done.push(label);
    };
    try {
      for (const s of plan.sells.filter((x) => x.kind === 'driver')) {
        await step(`Sell ${s.name}`, () => store.removeDriver(s.id));
      }
      if (current.constructor && !pending.constructorId) {
        await step(`Sell ${current.constructor.name}`, () => store.removeConstructor());
      }
      const ctorBuy = plan.buys.find((x) => x.kind === 'constructor');
      if (ctorBuy) {
        const c = (allConstructors ?? []).find((x) => x.id === ctorBuy.id);
        await step(`Add ${ctorBuy.name}`, () => store.setConstructor(ctorBuy.id, ctorBuy.contract, c ? { id: c.id, name: c.name, price: c.price } : undefined));
      }
      for (const b of plan.buys.filter((x) => x.kind === 'driver')) {
        const d = (allDrivers ?? []).find((x) => x.id === b.id);
        await step(`Add ${b.name}`, () => store.addDriver(b.id, b.contract, d ? { id: d.id, name: d.name, shortName: d.shortName, constructorId: d.constructorId, price: d.price } : undefined));
      }
      setSummaryOpen(false);
      router.back();
    } catch (e) {
      setSummaryOpen(false);
      const reason = e instanceof Error ? e.message : 'Something went wrong.';
      const applied = done.length ? `Already applied: ${done.join(', ')}.\n\n` : '';
      Alert.alert('Lineup partly saved', `${applied}${reason}\n\nYour roster below shows what the server holds.`);
      const latest = useTeamStore.getState().currentTeam;
      if (latest) setSeededFor(null); // re-seed pending from the server's roster
    } finally {
      setApplying(false);
    }
  }, [plan, pending, current, team, allDrivers, allConstructors]);

  const save = saveLabel(plan ?? { sells: [], buys: [], budgetBefore: 0, budgetAfter: 0, changed: false, complete: false, missingDrivers: TEAM_SIZE, missingConstructor: true }, locked);
  const lockStatus = formatLockStatus({
    isLocked: lockoutInfo.isLocked, lockTime: lockoutInfo.lockTime,
    qualifyingTime: lockoutInfo.nextRace ? new Date(lockoutInfo.nextRace.schedule.qualifying) : null,
    raceStartTime: lockoutInfo.raceStartTime, hasNextRace: !!lockoutInfo.nextRace || races.length === 0, now,
  });
  const pickedCount = pending?.driverIds.length ?? 0;
  const ctorCount = pending?.constructorId ? 1 : 0;
  const complete = pickedCount >= TEAM_SIZE && ctorCount === 1;
  const budgetAfter = plan?.budgetAfter ?? budget;
  const gutter = spacing.xl;
  // Large display sizes: fewer scaled columns so names keep their room.
  const compact = displayScale > 1.15;

  const renderRow = useCallback(({ item }: { item: Row }) => {
    const t = trendOf(lastRaceScores[item.id]?.totalPoints, prevRaceScores[item.id]?.totalPoints);
    const trendColor = t.trend === 'up' ? colors.positive : t.trend === 'down' ? colors.primary : colors.text.muted;
    return (
      <Pressable
        onPress={() => onRowPress(item)}
        disabled={item.blocked}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.selected, disabled: item.blocked }}
        accessibilityLabel={`${item.fullName}, ${item.pts} points, $${item.price}`}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: scaled(14),
          borderBottomWidth: 1, borderBottomColor: colors.borderLight,
          opacity: item.blocked ? 0.35 : pressed ? 0.7 : 1,
        })}
      >
        <Text style={[mono(12), { width: compact ? 34 : scaled(36), color: colors.text.muted }]}>{item.num}</Text>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontFamily: family.ui.black, fontSize: scaled(16), lineHeight: scaled(17), letterSpacing: -scaled(16) * 0.02, textTransform: 'uppercase', color: colors.text.primary }}>
            {item.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ColorBar color={teamAccent(item.constructorId)} width={scaled(20)} />
            <Text numberOfLines={1} style={[mono(10), { color: colors.text.muted, textTransform: 'uppercase', flexShrink: 1 }]}>{item.sub}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={mono(15)}>{item.pts}</Text>
          {compact
            ? <Text style={[mono(11), { color: item.selected ? colors.text.primary : colors.text.muted }]}>${item.price}</Text>
            : <Text style={[mono(10), { color: trendColor }]}>{t.glyph} {t.last ?? '–'}</Text>}
        </View>
        {compact ? null : (
          <Text style={[mono(13), { minWidth: scaled(46), textAlign: 'right', color: item.selected ? colors.text.primary : colors.text.muted }]}>${item.price}</Text>
        )}
        <View style={{ width: compact ? 30 : scaled(28), height: compact ? 30 : scaled(28), borderRadius: 999, borderWidth: 1, borderColor: item.selected ? colors.text.primary : colors.borderStrong, backgroundColor: item.selected ? colors.text.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {item.selected ? <Text style={{ fontFamily: family.ui.black, fontSize: compact ? 13 : scaled(12), color: colors.text.inverse }}>✓</Text> : null}
        </View>
      </Pressable>
    );
  }, [lastRaceScores, prevRaceScores, colors, family, scaled, mono, onRowPress, compact]);

  const sheetBudgetAfter = sheet && plan ? (sheet.kind === 'driver' ? plan.budgetAfter - sheet.entry.price : ctorSwapBudget - sheet.entry.price) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={{ paddingTop: 12 }}>
        <ScreenHeader
          statusLeft="← CANCEL"
          onStatusLeftPress={() => router.back()}
          statusRight={lockStatus}
          titleNode={
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ flexShrink: 1, fontFamily: family.ui.black, fontSize: scaled(26), lineHeight: scaled(28), letterSpacing: -scaled(26) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>
                {locked ? 'Locked' : 'Pick Team'}
              </Text>
              <Text numberOfLines={1} style={[mono(13), { flexShrink: 0, color: complete ? colors.positive : colors.text.primary }]}>{pickedCount}/{TEAM_SIZE} · {ctorCount}/1</Text>
            </View>
          }
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <MonoLabel color={budgetAfter < LOW_BUDGET ? colors.primary : colors.text.muted}>BUDGET ${budgetAfter}</MonoLabel>
            {plan?.changed ? <MonoLabel color={colors.text.muted}>{plan.sells.length} SELL · {plan.buys.length} BUY</MonoLabel> : null}
          </View>
        </ScreenHeader>
      </View>

      <View style={{ flexDirection: compact ? 'column' : 'row', gap: 8, marginHorizontal: gutter, marginTop: 18 }}>
        <SegmentPill<Tab>
          value={tab}
          onChange={setTab}
          size={10}
          padY={12}
          style={compact ? undefined : { flex: 1 }}
          segments={[{ key: 'drivers', label: 'DRIVERS' }, { key: 'constructors', label: 'CONSTRUCTOR' }]}
        />
        <SegmentPill<Sort>
          value={sort}
          onChange={setSort}
          size={10}
          padY={12}
          style={compact ? { alignSelf: 'flex-end', width: 140 } : { width: scaled(92) }}
          segments={[{ key: 'pts', label: 'PTS' }, { key: 'price', label: '$' }]}
        />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={renderRow}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 6, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        ListEmptyComponent={<View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>}
      />

      <View style={{ paddingHorizontal: gutter, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 22 }}>
        <PillButton
          label={applying ? 'SAVING…' : save.label}
          variant={save.ready ? 'primary' : 'muted'}
          disabled={!save.ready || applying}
          onPress={save.ready ? () => setSummaryOpen(true) : undefined}
        />
      </View>

      {/* Contract sheet */}
      <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }} onPress={() => setSheet(null)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border, padding: gutter, paddingBottom: Math.max(insets.bottom, 12) + 22, gap: 14 }}>
            <MonoLabel>{sheet?.kind === 'driver' ? 'ADD DRIVER' : 'ADD CONSTRUCTOR'}</MonoLabel>
            <Text style={{ fontFamily: family.ui.black, fontSize: scaled(22), lineHeight: scaled(24), letterSpacing: -scaled(22) * 0.03, textTransform: 'uppercase', color: colors.text.primary }} numberOfLines={1}>{sheet?.entry.name}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <MonoLabel color={colors.text.muted}>PRICE ${sheet?.entry.price ?? 0}</MonoLabel>
              <MonoLabel color={sheetBudgetAfter < LOW_BUDGET ? colors.primary : colors.text.muted}>LEAVES ${sheetBudgetAfter}</MonoLabel>
            </View>
            <MonoLabel>CONTRACT · RACES</MonoLabel>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {CONTRACTS.map((n) => {
                const on = contract === n;
                return (
                  <Pressable key={n} onPress={() => setContract(n)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flex: 1, paddingVertical: scaled(14), borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: on ? colors.text.primary : colors.borderStrong, backgroundColor: on ? colors.text.primary : 'transparent' }}>
                    <Text style={[mono(14), { color: on ? colors.text.inverse : colors.text.muted }]}>{n}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[mono(10, 'medium'), { color: colors.text.muted }]}>
              SELLING BEFORE THE CONTRACT ENDS COSTS {Math.round(PRICING_CONFIG.EARLY_TERMINATION_RATE * 100)}% OF THE PRICE PER RACE LEFT.
            </Text>
            <PillButton label="ADD" variant="primary" onPress={confirmSheet} style={{ marginTop: 4 }} />
            <Pressable onPress={() => setSheet(null)} style={{ alignItems: 'center', paddingVertical: 8 }}><MonoLabel color={colors.text.muted}>CANCEL</MonoLabel></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Save summary */}
      <Modal visible={summaryOpen} transparent animationType="fade" onRequestClose={() => !applying && setSummaryOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }} onPress={() => !applying && setSummaryOpen(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border, padding: gutter, paddingBottom: Math.max(insets.bottom, 12) + 22, gap: 12 }}>
            <MonoLabel>SAVE LINEUP</MonoLabel>
            {plan?.sells.map((s) => (
              <View key={`s-${s.id}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: family.ui.black, fontSize: scaled(14), textTransform: 'uppercase', color: colors.text.primary }}>SELL {s.name}</Text>
                  {s.fee > 0 ? <Text style={[mono(10), { color: colors.primary }]}>EARLY TERMINATION −${s.fee}</Text> : <Text style={[mono(10), { color: colors.text.muted }]}>NO FEE</Text>}
                </View>
                <Text style={[mono(14), { color: colors.positive }]}>+${s.saleReturn}</Text>
              </View>
            ))}
            {plan?.buys.map((b) => (
              <View key={`b-${b.id}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: family.ui.black, fontSize: scaled(14), textTransform: 'uppercase', color: colors.text.primary }}>ADD {b.name}</Text>
                  <Text style={[mono(10), { color: colors.text.muted }]}>{b.contract} RACE CONTRACT</Text>
                </View>
                <Text style={mono(14)}>−${b.price}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6 }}>
              <MonoLabel>BANK AFTER</MonoLabel>
              <Text style={[mono(16), { color: (plan?.budgetAfter ?? 0) < 0 ? colors.primary : colors.text.primary }]}>${plan?.budgetAfter ?? 0}</Text>
            </View>
            <PillButton label={applying ? 'SAVING…' : 'CONFIRM'} variant="primary" disabled={applying} onPress={applyPlan} style={{ marginTop: 6 }} />
            <Pressable disabled={applying} onPress={() => setSummaryOpen(false)} style={{ alignItems: 'center', paddingVertical: 8 }}><MonoLabel color={colors.text.muted}>BACK</MonoLabel></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
