import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, Modal, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove, type NavigationAction } from '@react-navigation/native';
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
import { usePitWallStore } from '../../store/pitwall.store';
import { marksFor } from '../../pitwall/recommend';
import { teamAccent } from '../theme/simpleTheme';
import { TEAM_SIZE } from '../../config/constants';
import { PRICING_CONFIG } from '../../config/pricing.config';
import { constructorShortName } from './entityNames';
import { GridMoonshotSheet, type MoonshotTarget } from './GridMoonshotSheet';
import { GridMoonshotCoach } from './GridMoonshotCoach';
import { track } from '../../services/analytics.service';
import { useMoonshotStore } from '../../store/moonshot.store';
import { moonshotAvailability } from './moonshot';
import { useMoonshotConfig } from '../hooks/useMoonshotConfig';
import { ColorBar, MonoLabel, PillButton, ScreenHeader, SegmentPill, ValuePill } from './GridBits';
import { formatLockStatus } from './lockStatus';
import { trendOf, surnameOf as surname } from './tileState';
import {
  planLineup, pendingFromCurrent, canAffordAdd, canAffordConstructor, constructorSwapBudget, saveLabel, openSlotsLine,
  type PendingLineup, type CurrentLineup, type MarketEntry, type LineupPlan, type Kind,
} from './lineupPlan';
import {
  cheapestCompletion, driverReserve, formatValue, leftoverLine, leftoverTight, pairingHints, valueOf,
} from './pickerArithmetic';
import type { Driver, Constructor } from '../../types';

type Tab = 'drivers' | 'constructors';
type Sort = 'pts' | 'price' | 'proj' | 'value';

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
  /** Pit Wall projection for the coming round; null before it publishes */
  proj: number | null;
  /** the one row Pit Wall would take, and the best value when that is a different row */
  mark: 'pick' | 'value' | null;
  /** season points per dollar; null when price is not positive */
  value: number | null;
  /** pairing hint after the first pick; never reorders the list */
  hint: string | null;
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
  const pwProjections = usePitWallStore((st) => st.projections);
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

  // F-124: projections load for every signed-in user while content is open.
  const proj = pwProjections;

  const plan = useMemo<LineupPlan | null>(() => {
    if (!current || !pending) return null;
    return planLineup(current, pending, market, { teamSize: TEAM_SIZE, defaultContract: PRICING_CONFIG.CONTRACT_LENGTH });
  }, [current, pending, market]);

  const driversFull = (pending?.driverIds.length ?? 0) >= TEAM_SIZE;
  const ctorSwapBudget = plan && current && pending ? constructorSwapBudget(plan, current, pending, market.constructors) : 0;

  // What the lineup still needs after any one pick, at the cheapest prices on the list: the open
  // driver seats and, while no constructor is picked, the cheapest constructor. A row that leaves
  // less than this is a dead end (the owner filled five seats with Pit Wall's drivers and could then
  // afford no constructor at all), so it is blocked, Pit Wall never marks it, and the leftover line
  // counts the constructor as a seat.
  const openDriverPrices = useMemo(() => (allDrivers ?? [])
    .filter((d) => pending && !pending.driverIds.includes(d.id) && !isDriverLockedOut(team?.driverLockouts, d.id, completedRaceCount))
    .map((d) => d.price), [allDrivers, pending, team?.driverLockouts, completedRaceCount]);
  const cheapestCtor = useMemo(() => {
    const prices = (allConstructors ?? []).map((c) => c.price).filter((p) => p > 0);
    return prices.length ? Math.min(...prices) : null;
  }, [allConstructors]);
  const ctorReserve = plan?.missingConstructor ? cheapestCtor ?? 0 : 0;
  const missingDrivers = plan?.missingDrivers ?? 0;

  const rows = useMemo<Row[]>(() => {
    if (!pending || !plan) return [];
    const driverFill = cheapestCompletion(openDriverPrices, missingDrivers) ?? 0;
    const list: Row[] = tab === 'drivers'
      ? (allDrivers ?? []).map((d: Driver) => {
          const selected = pending.driverIds.includes(d.id);
          const onRoster = current?.drivers.some((r) => r.id === d.id) ?? false;
          const lockedOut = isDriverLockedOut(team?.driverLockouts, d.id, completedRaceCount);
          const affordable = onRoster || canAffordAdd(plan, d.price, driverReserve(d.price, openDriverPrices, missingDrivers, ctorReserve));
          return {
            kind: 'driver', id: d.id, num: String(d.number ?? '').padStart(2, '0'), name: surname(d.name), fullName: d.name,
            sub: constructorShortName(d.constructorId, d.constructorName), constructorId: d.constructorId,
            pts: d.currentSeasonPoints ?? d.fantasyPoints ?? 0, price: d.price, selected,
            blocked: !selected && (driversFull || lockedOut || !affordable),
            proj: proj?.byId[d.id]?.med ?? null, mark: null,
            value: valueOf(d.currentSeasonPoints ?? d.fantasyPoints ?? 0, d.price), hint: null,
          };
        })
      : (allConstructors ?? []).map((c: Constructor) => {
          const selected = pending.constructorId === c.id;
          const isCurrent = current?.constructor?.id === c.id;
          const affordable = isCurrent || canAffordConstructor(c.price, ctorSwapBudget, driverFill);
          return {
            kind: 'constructor', id: c.id, num: c.shortName?.slice(0, 3).toUpperCase() ?? '', name: constructorShortName(c.id, c.name), fullName: c.name,
            sub: c.name, constructorId: c.id, pts: c.currentSeasonPoints ?? c.fantasyPoints ?? 0, price: c.price, selected,
            blocked: !selected && !affordable,
            proj: proj?.byId[c.id]?.med ?? null, mark: null,
            value: valueOf(c.currentSeasonPoints ?? c.fantasyPoints ?? 0, c.price), hint: null,
          };
        });
    // Pit Wall marks the row it would take and, when different, the best points per dollar. The
    // picker has already decided what the team may take, so a mark can never suggest a blocked move.
    if (proj) {
      const marks = marksFor(list, proj.byId);
      for (const row of list) row.mark = marks[row.id] ?? null;
    }
    if (tab === 'drivers' && plan) {
      const hints = pairingHints(list, plan.budgetAfter, plan.missingDrivers, ctorReserve);
      for (const h of hints) {
        const row = list.find((r) => r.id === h.id);
        if (row) row.hint = h.label;
      }
    }
    const by: Sort = sort === 'proj' && !proj ? 'pts' : sort;
    list.sort((a, b) => (by === 'value' ? (b.value ?? -1) - (a.value ?? -1) : by === 'proj' ? (b.proj ?? -1) - (a.proj ?? -1) : by === 'pts' ? b.pts - a.pts : b.price - a.price));
    return list;
  }, [tab, allDrivers, allConstructors, pending, plan, current, team?.driverLockouts, completedRaceCount, driversFull, ctorSwapBudget, sort, proj, openDriverPrices, missingDrivers, ctorReserve]);

  // F-125: while locked the screen is the market to look at, not a picker — every row is readable at
  // full strength (a dimmed row means "you cannot take this one", which is not the message during a
  // lock) and none of them responds. The lock is announced in the title, the status strip and the
  // save bar, not forty times down the list.
  const onRowPress = useCallback((row: Row) => {
    if (locked || !pending || !current || row.blocked) return;
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
  }, [locked, pending, current]);

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
      setLeaving(false);
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
  const missingCtor = plan?.missingConstructor ?? false;
  const driverFillCost = cheapestCompletion(openDriverPrices, missingDrivers);
  const cheapestFill = driverFillCost == null ? null : driverFillCost + ctorReserve;
  const leftover = leftoverLine(budgetAfter, missingDrivers, cheapestFill, missingCtor);
  const leftoverWarn = leftoverTight(budgetAfter, cheapestFill);
  const openSlots = plan ? openSlotsLine(plan, leftoverWarn) : null;

  // Leaving with unsaved picks opens the save summary instead of dropping them: the owner picked
  // four drivers, could not save, and left with nothing kept. `usePreventRemove` catches every way
  // off the screen — CANCEL, the hardware back, the iOS swipe, a programmatic pop — and hands us
  // the action to replay once the player chooses LEAVE WITHOUT SAVING. Not armed while a save is
  // applying (its own `router.back()` must go through) or once the player has chosen to discard.
  const navigation = useNavigation();
  const [leaving, setLeaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const blockedPop = useRef<NavigationAction | null>(null);
  const unsaved = !!plan?.changed && !locked;
  usePreventRemove(unsaved && !applying && !discarding, ({ data }) => {
    blockedPop.current = data.action;
    setLeaving(true);
    setSummaryOpen(true);
  });
  useEffect(() => {
    if (!discarding) return;
    const action = blockedPop.current;
    blockedPop.current = null;
    if (action) navigation.dispatch(action); else router.back();
  }, [discarding, navigation]);
  const gutter = spacing.xl;
  // Large display sizes: fewer scaled columns so names keep their room.
  const compact = displayScale > 1.15;

  // F-108: a Moonshot can be called on any driver on the entry list, not only a roster one
  const moonshotCfg = useMoonshotConfig();
  const moonshotRace = lockoutInfo.nextRace;
  const moonshotOpen = moonshotAvailability(moonshotCfg, moonshotRace?.round) === 'open' && !!team && !!moonshotRace;
  const moonshotCalls = useMoonshotStore((s) => s.calls);
  const [moonshotTarget, setMoonshotTarget] = useState<MoonshotTarget | null>(null);
  const tutorialOpen = useMoonshotStore((s) => s.tutorialOpen);
  const finishTutorial = useMoonshotStore((s) => s.finishTutorial);
  const moonshotCurrent = moonshotOpen ? moonshotCalls.find((c) => c.teamId === team!.id && c.raceId === moonshotRace!.id && c.status !== 'CANCELLED') ?? null : null;

  const renderRow = useCallback(({ item }: { item: Row }) => {
    const t = trendOf(lastRaceScores[item.id]?.totalPoints, prevRaceScores[item.id]?.totalPoints);
    const trendColor = t.trend === 'up' ? colors.positive : t.trend === 'down' ? colors.primary : colors.text.muted;
    // this race's call stays reachable from its row after lock (to look at it); a new one does not, the lock has passed
    const moonshotRow = moonshotOpen && item.kind === 'driver' && (moonshotCurrent ? moonshotCurrent.driverId === item.id : !lockoutInfo.isLocked);
    const pick = item.mark === 'pick';
    return (
      <Pressable
        onPress={() => onRowPress(item)}
        disabled={locked || item.blocked}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.selected, disabled: locked || item.blocked }}
        accessibilityLabel={`${item.fullName}, ${item.pts} points, $${item.price}${item.value != null ? `, ${formatValue(item.value)} points per dollar` : ''}${item.proj !== null ? `, Pit Wall projection ${item.proj}` : ''}${item.hint ? `, ${item.hint}` : ''}${item.mark === 'pick' ? ', Pit Wall pick' : item.mark === 'value' ? ', Pit Wall best value' : ''}`}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: scaled(14),
          borderBottomWidth: 1, borderBottomColor: colors.borderLight,
          opacity: item.blocked ? 0.35 : pressed ? 0.7 : 1,
          // the pick row spans the gutter: a tinted band with the accent on the screen edge
          ...(pick ? { backgroundColor: colors.goldFaint, marginHorizontal: -gutter, paddingHorizontal: gutter, paddingLeft: gutter - 3, borderLeftWidth: 3, borderLeftColor: colors.gold } : null),
        })}
      >
        <Text style={[mono(12), { width: compact ? 34 : scaled(36), color: colors.text.muted }]}>{item.num}</Text>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          {/* Pit Wall's pick is the whole row (tint + edge bar) with its label on a line of its own; the
              badges used to sit beside the team name and ran under the stats column. Nothing is inline
              with the name any more: the label pushes the row down, the hints wrap below. */}
          {pick ? <Text style={[mono(9, 'medium'), { color: colors.gold, letterSpacing: 1 }]}>PIT WALL PICK</Text> : null}
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontFamily: family.ui.black, fontSize: scaled(16), lineHeight: scaled(17), letterSpacing: -scaled(16) * 0.02, textTransform: 'uppercase', color: colors.text.primary }}>
            {item.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ColorBar color={teamAccent(item.constructorId)} width={scaled(20)} />
            <Text numberOfLines={1} style={[mono(10), { color: colors.text.muted, textTransform: 'uppercase', flexShrink: 1 }]}>{item.sub}</Text>
          </View>
          {item.hint || item.mark === 'value' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 1 }}>
              {item.mark === 'value' ? (
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: colors.borderStrong }}>
                  <Text style={[mono(9), { color: colors.text.muted }]}>BEST VALUE</Text>
                </View>
              ) : null}
              {item.hint ? (
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: colors.borderStrong }}>
                  <Text style={[mono(9), { color: colors.text.muted }]}>{item.hint}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={mono(15)}>{item.pts}</Text>
          {item.value != null ? <Text style={[mono(10), { color: colors.text.muted }]}>VAL {formatValue(item.value)}</Text> : null}
          {item.proj !== null ? <Text style={[mono(10), { color: colors.text.muted }]}>PROJ {item.proj}</Text> : null}
          {compact
            ? <Text style={[mono(11), { color: item.selected ? colors.text.primary : colors.text.muted }]}>${item.price}</Text>
            : <Text style={[mono(10), { color: trendColor }]}>{t.glyph} {t.last ?? '–'}</Text>}
        </View>
        {moonshotRow ? (
          <Pressable onPress={() => { track('moonshot_driver_selected', { driverId: item.id, from: 'picker' }); setMoonshotTarget({ teamId: team!.id, raceId: moonshotRace!.id, raceName: moonshotRace!.name, driverId: item.id, driverName: item.fullName }); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Moonshot on ${item.fullName}`}
            style={({ pressed }) => ({ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: moonshotCurrent ? colors.primary : colors.borderStrong, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ fontSize: scaled(12) }}>🚀</Text>
          </Pressable>
        ) : null}
        {compact ? null : (
          <Text style={[mono(13), { minWidth: scaled(46), textAlign: 'right', color: item.selected ? colors.text.primary : colors.text.muted }]}>${item.price}</Text>
        )}
        <View style={{ width: compact ? 30 : scaled(28), height: compact ? 30 : scaled(28), borderRadius: 999, borderWidth: 1, borderColor: item.selected ? colors.text.primary : colors.borderStrong, backgroundColor: item.selected ? colors.text.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {item.selected ? <Text style={{ fontFamily: family.ui.black, fontSize: compact ? 13 : scaled(12), color: colors.text.inverse }}>✓</Text> : null}
        </View>
      </Pressable>
    );
  }, [lastRaceScores, prevRaceScores, colors, family, scaled, mono, onRowPress, compact, locked, lockoutInfo.isLocked, moonshotOpen, moonshotCurrent, moonshotRace, team, gutter]);

  const sheetBudgetAfter = sheet && plan ? (sheet.kind === 'driver' ? plan.budgetAfter - sheet.entry.price : ctorSwapBudget - sheet.entry.price) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={{ paddingTop: 12 }}>
        <ScreenHeader
          statusLeft={locked ? '← BACK' : '← CANCEL'}
          onStatusLeftPress={() => router.back()}
          statusRight={lockStatus}
          titleNode={
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ flexShrink: 1, fontFamily: family.ui.black, fontSize: scaled(26), lineHeight: scaled(28), letterSpacing: -scaled(26) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>
                {locked ? 'Market' : 'Pick Team'}
              </Text>
              <Text numberOfLines={1} style={[mono(13), { flexShrink: 0, color: complete ? colors.positive : colors.text.primary }]}>{pickedCount}/{TEAM_SIZE} · {ctorCount}/1</Text>
            </View>
          }
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <ValuePill label="BUDGET" value={`$${budgetAfter}`} tone={budgetAfter < LOW_BUDGET ? 'caution' : 'normal'} />
            {plan?.changed ? <MonoLabel color={colors.text.muted}>{plan.sells.length} SELL · {plan.buys.length} BUY</MonoLabel> : null}
          </View>
          {leftover ? <MonoLabel size={10} color={leftoverWarn ? colors.warning : colors.text.muted} style={{ marginTop: 8 }}>{leftover}</MonoLabel> : null}
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
          style={compact ? { alignSelf: 'flex-end', width: proj ? 248 : 190 } : { width: scaled(proj ? 176 : 130) }}
          segments={proj
            ? [{ key: 'pts', label: 'PTS' }, { key: 'value', label: 'VAL' }, { key: 'proj', label: 'PROJ' }, { key: 'price', label: '$' }]
            : [{ key: 'pts', label: 'PTS' }, { key: 'value', label: 'VAL' }, { key: 'price', label: '$' }]}
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
          onPress={save.ready ? () => { setLeaving(false); setSummaryOpen(true); } : undefined}
        />
      </View>

      {/* F-108: a Moonshot on any driver on the entry list */}
      <GridMoonshotSheet target={moonshotTarget} cfg={moonshotCfg} onClose={() => setMoonshotTarget(null)} onChanged={() => { if (team && moonshotRace) useMoonshotStore.getState().loadCalls(team.userId, team.id, moonshotRace.seasonId, true); }} />
      {moonshotTarget ? <GridMoonshotCoach visible={tutorialOpen} cfg={moonshotCfg} tokens={moonshotCfg.tokensPerTeam} onDone={() => { if (team) finishTutorial(team.userId); }} /> : null}
      {/* Contract sheet */}
      <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }} onPress={() => setSheet(null)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border, padding: gutter, paddingBottom: Math.max(insets.bottom, 12) + 22, gap: 14 }}>
            <MonoLabel>{sheet?.kind === 'driver' ? 'ADD DRIVER' : 'ADD CONSTRUCTOR'}</MonoLabel>
            <Text style={{ fontFamily: family.ui.black, fontSize: scaled(22), lineHeight: scaled(24), letterSpacing: -scaled(22) * 0.03, textTransform: 'uppercase', color: colors.text.primary }} numberOfLines={1}>{sheet?.entry.name}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <MonoLabel color={colors.text.muted}>PRICE ${sheet?.entry.price ?? 0}</MonoLabel>
              <ValuePill label="LEAVES" value={`$${sheetBudgetAfter}`} tone={sheetBudgetAfter < LOW_BUDGET ? 'caution' : 'normal'} />
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
      <Modal visible={summaryOpen} transparent animationType="fade" onRequestClose={() => { if (!applying) { setSummaryOpen(false); setLeaving(false); } }}>
        <Pressable style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }} onPress={() => { if (!applying) { setSummaryOpen(false); setLeaving(false); } }}>
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
            {openSlots ? <MonoLabel size={10} color={colors.warning}>{openSlots}</MonoLabel> : null}
            <PillButton label={applying ? 'SAVING…' : 'CONFIRM'} variant="primary" disabled={applying} onPress={applyPlan} style={{ marginTop: 6 }} />
            {leaving ? (
              <Pressable disabled={applying} onPress={() => { setSummaryOpen(false); setLeaving(false); setDiscarding(true); }} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 8 }}><MonoLabel color={colors.primary}>LEAVE WITHOUT SAVING</MonoLabel></Pressable>
            ) : null}
            <Pressable disabled={applying} onPress={() => { setSummaryOpen(false); setLeaving(false); }} style={{ alignItems: 'center', paddingVertical: 8 }}><MonoLabel color={colors.text.muted}>{leaving ? 'KEEP EDITING' : 'BACK'}</MonoLabel></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
