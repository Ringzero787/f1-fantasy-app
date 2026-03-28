import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONTS } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { SimpleMarketRow } from './SimpleMarketRow';
import { SimpleContractPicker } from './SimpleContractPicker';
import { useDrivers } from '../../hooks/useDrivers';
import { useConstructors } from '../../hooks/useConstructors';
import { useSimpleTeam } from '../hooks/useSimpleTeam';
import { useLockoutStatus } from '../../hooks/useLockoutStatus';
import { useTeamStore, isDriverLockedOut, calculateEarlyTerminationFee } from '../../store/team.store';
import { useAdminStore } from '../../store/admin.store';
import { TEAM_SIZE } from '../../config/constants';
import { PRICING_CONFIG } from '../../config/pricing.config';
import type { Driver, Constructor, FantasyDriver, FantasyConstructor, FantasyTeam } from '../../types';

type SortMode = 'price' | 'points' | 'name';
type MarketTab = 'drivers' | 'constructors';

interface Props {
  refreshing: boolean;
  onRefresh: () => void;
}

export const SimpleMarketPanel = React.memo(function SimpleMarketPanel({
  refreshing,
  onRefresh,
}: Props) {
  const { colors, fonts, spacing } = useSimpleTheme();
  const { data: allDrivers, isLoading: driversLoading } = useDrivers();
  const { data: allConstructors, isLoading: constructorsLoading } = useConstructors();
  const { team, teamConstructor, budget, driversCount, removeDriver, removeConstructor, fullSyncToFirebase } = useSimpleTeam();
  const lockoutInfo = useLockoutStatus();
  const locked = lockoutInfo.isLocked || !(team?.lockStatus?.canModify ?? true);

  const [tab, setTab] = useState<MarketTab>('drivers');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('price');

  // Contract picker state
  const [pendingDriver, setPendingDriver] = useState<Driver | null>(null);
  const [pendingConstructor, setPendingConstructor] = useState<Constructor | null>(null);
  const [contractLength, setContractLength] = useState<number>(PRICING_CONFIG.CONTRACT_LENGTH);

  // Derived sets for quick lookups
  const onTeamDriverIds = useMemo(() => {
    return new Set(team?.drivers?.map((d) => d.driverId) ?? []);
  }, [team?.drivers]);

  const onTeamConstructorId = teamConstructor?.constructorId ?? null;

  const driversFull = driversCount >= TEAM_SIZE;

  // Filter and sort drivers
  const filteredDrivers = useMemo(() => {
    if (!allDrivers) return [];
    let list = [...allDrivers];

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.shortName.toLowerCase().includes(q) ||
          d.constructorName.toLowerCase().includes(q),
      );
    }

    // Sort
    list.sort((a, b) => {
      switch (sort) {
        case 'price':
          return b.price - a.price;
        case 'points':
          return (b.currentSeasonPoints ?? 0) - (a.currentSeasonPoints ?? 0);
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    return list;
  }, [allDrivers, search, sort]);

  // Filter and sort constructors
  const filteredConstructors = useMemo(() => {
    if (!allConstructors) return [];
    let list = [...allConstructors];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.shortName.toLowerCase().includes(q),
      );
    }

    // For constructors, if swapping, effective budget includes sale return
    list.sort((a, b) => {
      switch (sort) {
        case 'price':
          return b.price - a.price;
        case 'points':
          return (b.currentSeasonPoints ?? 0) - (a.currentSeasonPoints ?? 0);
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    return list;
  }, [allConstructors, search, sort, budget, teamConstructor]);

  // Compute effective budget for constructors (includes sale return from current constructor)
  function getConstructorEffectiveBudget(): number {
    if (!teamConstructor) return budget;
    const oldContractLen = teamConstructor.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
    const fee = calculateEarlyTerminationFee(
      teamConstructor.purchasePrice,
      oldContractLen,
      teamConstructor.racesHeld || 0,
    );
    const saleReturn = Math.max(0, teamConstructor.currentPrice - fee);
    return budget + saleReturn;
  }

  // --- Add handlers ---

  const handleTapAddDriver = useCallback(
    (driver: Driver) => {
      if (!team) {
        Alert.alert('No Team', 'Create a team first.');
        return;
      }
      if (locked) {
        Alert.alert('Teams Locked', lockoutInfo.lockReason || 'Team changes are locked.');
        return;
      }
      if (driversFull) {
        Alert.alert('Team Full', `Maximum ${TEAM_SIZE} drivers.`);
        return;
      }
      if (onTeamDriverIds.has(driver.id)) return;
      if (driver.price > budget) {
        Alert.alert('Budget', `${driver.name} costs $${driver.price} but you have $${budget}.`);
        return;
      }
      const completedRaceCount = useAdminStore.getState().getCompletedRaceCount();
      if (isDriverLockedOut(team.driverLockouts, driver.id, completedRaceCount)) {
        Alert.alert('Locked Out', `${driver.name} is on lockout cooldown.`);
        return;
      }
      setPendingDriver(driver);
      setContractLength(PRICING_CONFIG.CONTRACT_LENGTH);
    },
    [team, locked, driversFull, onTeamDriverIds, budget, lockoutInfo],
  );

  const handleConfirmAddDriver = useCallback(() => {
    if (!pendingDriver || !team) return;
    const driver = pendingDriver;
    const completedRaceCount = useAdminStore.getState().getCompletedRaceCount();

    const newFantasyDriver: FantasyDriver = {
      driverId: driver.id,
      name: driver.name,
      shortName: driver.shortName,
      constructorId: driver.constructorId,
      purchasePrice: driver.price,
      currentPrice: driver.price,
      pointsScored: 0,
      racesHeld: 0,
      contractLength,
      addedAtRace: completedRaceCount,
    };

    const updatedTeam: FantasyTeam = {
      ...team,
      drivers: [...team.drivers, newFantasyDriver],
      totalSpent: team.totalSpent + driver.price,
      budget: team.budget - driver.price,
      racesSinceTransfer: 0,
      updatedAt: new Date(),
    };

    useTeamStore.getState().setCurrentTeam(updatedTeam);
    fullSyncToFirebase();
    setPendingDriver(null);
  }, [pendingDriver, team, contractLength, fullSyncToFirebase]);

  const handleTapAddConstructor = useCallback(
    (item: Constructor) => {
      if (!team) {
        Alert.alert('No Team', 'Create a team first.');
        return;
      }
      if (locked) {
        Alert.alert('Teams Locked', lockoutInfo.lockReason || 'Team changes are locked.');
        return;
      }
      const effectiveBudget = getConstructorEffectiveBudget();
      if (item.price > effectiveBudget) {
        Alert.alert(
          'Budget',
          `${item.name} costs $${item.price} but you have $${effectiveBudget}.`,
        );
        return;
      }
      if (onTeamConstructorId === item.id) return;
      setPendingConstructor(item);
      setContractLength(PRICING_CONFIG.CONTRACT_LENGTH);
    },
    [team, locked, onTeamConstructorId, budget, teamConstructor, lockoutInfo],
  );

  const handleConfirmAddConstructor = useCallback(() => {
    if (!pendingConstructor || !team) return;
    const item = pendingConstructor;
    const completedRaceCount = useAdminStore.getState().getCompletedRaceCount();

    const oldConstructor = (team as Record<string, any>)['constructor'] as FantasyConstructor | null;
    let saleReturn = 0;
    let bankedPoints = 0;
    if (oldConstructor) {
      const oldContractLen = oldConstructor.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
      const fee = calculateEarlyTerminationFee(
        oldConstructor.purchasePrice,
        oldContractLen,
        oldConstructor.racesHeld || 0,
      );
      saleReturn = Math.max(0, oldConstructor.currentPrice - fee);
      bankedPoints = oldConstructor.pointsScored || 0;
    }

    const fantasyConstructor: FantasyConstructor = {
      constructorId: item.id,
      name: item.name,
      purchasePrice: item.price,
      currentPrice: item.price,
      pointsScored: 0,
      racesHeld: 0,
      contractLength,
      addedAtRace: completedRaceCount,
    };

    const updatedTeam: FantasyTeam = {
      ...team,
      constructor: fantasyConstructor,
      totalSpent: team.totalSpent - (oldConstructor?.purchasePrice || 0) + item.price,
      budget: team.budget + saleReturn - item.price,
      lockedPoints: (team.lockedPoints || 0) + bankedPoints,
      updatedAt: new Date(),
    };

    useTeamStore.getState().setCurrentTeam(updatedTeam);
    fullSyncToFirebase();
    setPendingConstructor(null);
  }, [pendingConstructor, team, contractLength, fullSyncToFirebase]);

  // --- Render helpers ---

  const renderDriverItem = useCallback(
    ({ item }: { item: Driver }) => {
      const onTeam = onTeamDriverIds.has(item.id);
      const canAfford = item.price <= budget;
      const dimmed = !canAfford && !onTeam;
      return (
        <SimpleMarketRow
          type="driver"
          item={item}
          onTeam={onTeam}
          canAfford={canAfford}
          disabled={locked || (driversFull && !onTeam)}
          dimmed={dimmed}
          onAdd={() => handleTapAddDriver(item)}
          onRemove={onTeam ? () => { removeDriver(item.id); } : undefined}
        />
      );
    },
    [onTeamDriverIds, budget, locked, driversFull, handleTapAddDriver, removeDriver],
  );

  const renderConstructorItem = useCallback(
    ({ item }: { item: Constructor }) => {
      const onTeam = onTeamConstructorId === item.id;
      const effectiveBudget = getConstructorEffectiveBudget();
      const canAfford = item.price <= effectiveBudget;
      const dimmed = !canAfford && !onTeam;
      return (
        <SimpleMarketRow
          type="constructor"
          item={item}
          onTeam={onTeam}
          canAfford={canAfford}
          disabled={locked}
          dimmed={dimmed}
          onAdd={() => handleTapAddConstructor(item)}
          onRemove={onTeam ? () => { removeConstructor(); } : undefined}
        />
      );
    },
    [onTeamConstructorId, budget, teamConstructor, locked, handleTapAddConstructor, removeConstructor],
  );

  const keyExtractorDriver = useCallback((item: Driver) => item.id, []);
  const keyExtractorConstructor = useCallback((item: Constructor) => item.id, []);

  const isLoading = tab === 'drivers' ? driversLoading : constructorsLoading;

  // Pending entity for contract picker
  const pickerVisible = !!(pendingDriver || pendingConstructor);
  const pickerName = pendingDriver?.name ?? pendingConstructor?.name ?? '';
  const pickerPrice = pendingDriver?.price ?? pendingConstructor?.price ?? 0;
  const pickerType = pendingDriver ? 'driver' : 'constructor';
  const pickerBudget = pendingDriver
    ? budget
    : getConstructorEffectiveBudget();

  const styles = useMemo(() => ({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    teamFullBanner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      backgroundColor: colors.positiveFaint,
    },
    teamFullText: {
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.positive,
    },
    budgetBar: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    budgetLabel: {
      fontSize: fonts.sm,
      color: colors.text.muted,
      marginRight: spacing.xs,
    },
    budgetValue: {
      fontSize: fonts.lg,
      fontWeight: S_FONTS.weights.bold,
      color: colors.primary,
    },
    budgetRight: {
      flex: 1,
      flexDirection: 'row' as const,
      justifyContent: 'flex-end' as const,
      alignItems: 'center' as const,
    },
    slotsText: {
      fontSize: fonts.sm,
      color: colors.text.muted,
    },
    slotSep: {
      fontSize: fonts.sm,
      color: colors.text.muted,
    },
    tabRow: {
      flexDirection: 'row' as const,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      borderRadius: S_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden' as const,
    },
    tabBtn: {
      flex: 1,
      alignItems: 'center' as const,
      paddingVertical: spacing.sm,
      backgroundColor: colors.background,
    },
    tabBtnActive: {
      backgroundColor: colors.primary,
    },
    tabText: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.medium,
      color: colors.text.secondary,
    },
    tabTextActive: {
      color: colors.text.inverse,
      fontWeight: S_FONTS.weights.semibold,
    },
    searchWrap: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: S_RADIUS.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      backgroundColor: colors.background,
    },
    searchInput: {
      flex: 1,
      fontSize: fonts.md,
      color: colors.text.primary,
      marginLeft: spacing.sm,
      paddingVertical: spacing.xs,
    },
    sortRow: {
      flexDirection: 'row' as const,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      gap: spacing.sm,
    },
    sortChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: S_RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    sortChipActive: {
      backgroundColor: colors.primaryFaint,
      borderColor: colors.primary,
    },
    sortChipText: {
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.medium,
      color: colors.text.muted,
    },
    sortChipTextActive: {
      color: colors.primary,
      fontWeight: S_FONTS.weights.semibold,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingBottom: spacing.xxl + 40,
    },
    emptyWrap: {
      paddingVertical: spacing.xxl,
      alignItems: 'center' as const,
    },
    emptyText: {
      fontSize: fonts.md,
      color: colors.text.muted,
    },
  }), [colors, fonts, spacing]);

  return (
    <View style={styles.root}>
      {/* Team full banner */}
      {driversFull && !!teamConstructor && (
        <View style={styles.teamFullBanner}>
          <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
          <Text style={styles.teamFullText}>Your team is complete!</Text>
        </View>
      )}

      {/* Budget bar */}
      <View style={styles.budgetBar}>
        <Text style={styles.budgetLabel}>Budget</Text>
        <Text style={styles.budgetValue}>${budget}</Text>
        <View style={styles.budgetRight}>
          <Text style={[styles.slotsText, driversFull && { color: colors.positive }]}>
            {driversCount}/{TEAM_SIZE} drivers
          </Text>
          <Text style={styles.slotSep}> · </Text>
          <Text style={[styles.slotsText, !!teamConstructor && { color: colors.positive }]}>
            {teamConstructor ? '1' : '0'}/1 constructor
          </Text>
        </View>
      </View>

      {/* Tab toggle: Drivers | Constructors */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'drivers' && styles.tabBtnActive]}
          onPress={() => setTab('drivers')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, tab === 'drivers' && styles.tabTextActive]}>
            Drivers
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'constructors' && styles.tabBtnActive]}
          onPress={() => setTab('constructors')}
          activeOpacity={0.7}
        >
          <Text
            style={[styles.tabText, tab === 'constructors' && styles.tabTextActive]}
          >
            Constructors
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.text.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder={tab === 'drivers' ? 'Search drivers...' : 'Search constructors...'}
          placeholderTextColor={colors.text.muted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.6}>
            <Ionicons name="close-circle" size={16} color={colors.text.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Sort chips */}
      <View style={styles.sortRow}>
        {(['price', 'points', 'name'] as SortMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.sortChip, sort === mode && styles.sortChipActive]}
            onPress={() => setSort(mode)}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortChipText, sort === mode && styles.sortChipTextActive]}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {tab === 'drivers' ? (
        <FlatList
          data={filteredDrivers}
          keyExtractor={keyExtractorDriver}
          renderItem={renderDriverItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {isLoading ? 'Loading drivers...' : 'No drivers found.'}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredConstructors}
          keyExtractor={keyExtractorConstructor}
          renderItem={renderConstructorItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {isLoading ? 'Loading constructors...' : 'No constructors found.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Contract picker */}
      <SimpleContractPicker
        visible={pickerVisible}
        name={pickerName}
        price={pickerPrice}
        budgetRemaining={pickerBudget}
        entityType={pickerType}
        contractLength={contractLength}
        onChangeContractLength={setContractLength}
        onConfirm={pendingDriver ? handleConfirmAddDriver : handleConfirmAddConstructor}
        onCancel={() => {
          setPendingDriver(null);
          setPendingConstructor(null);
        }}
      />
    </View>
  );
});
