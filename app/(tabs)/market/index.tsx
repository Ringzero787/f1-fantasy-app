import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDrivers, useConstructors, useLockoutStatus } from '../../../src/hooks';
import { Loading, DriverCard, ConstructorCard, EmptyState } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, BUDGET, TEAM_SIZE } from '../../../src/config/constants';
import { useTheme } from '../../../src/hooks/useTheme';
import { useScale } from '../../../src/hooks/useScale';
import { useTeamStore, isDriverLockedOut, getLockedOutDriverIds, calculateEarlyTerminationFee } from '../../../src/store/team.store';
import { useAdminStore } from '../../../src/store/admin.store';
import { PRICING_CONFIG } from '../../../src/config/pricing.config';
import { formatDollars } from '../../../src/utils/formatters';
import type { DriverFilter, Driver, Constructor, FantasyDriver, FantasyConstructor, FantasyTeam } from '../../../src/types';

type Tab = 'drivers' | 'constructors';
type SortOption = 'price' | 'points' | 'name' | 'priceChange';

export default function MarketScreen() {
  const { scaledFonts, scaledSpacing, scaledIcon } = useScale();
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('drivers');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('price');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Quick-add state
  const [pendingDriver, setPendingDriver] = useState<Driver | null>(null);
  const [pendingConstructor, setPendingConstructor] = useState<Constructor | null>(null);
  const [pendingContractLength, setPendingContractLength] = useState<number>(PRICING_CONFIG.CONTRACT_LENGTH);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const driverFilter: DriverFilter = {
    search: debouncedSearch,
    sortBy,
    sortOrder,
  };

  const { data: drivers, isLoading: driversLoading } = useDrivers(driverFilter);
  const { data: constructors, isLoading: constructorsLoading } = useConstructors();
  const currentTeam = useTeamStore(s => s.currentTeam);
  const userTeams = useTeamStore(s => s.userTeams);
  const selectTeam = useTeamStore(s => s.selectTeam);
  const removeDriver = useTeamStore(s => s.removeDriver);
  const removeConstructor = useTeamStore(s => s.removeConstructor);
  const lockoutInfo = useLockoutStatus();
  const raceResults = useAdminStore(s => s.raceResults);

  const isLoading = activeTab === 'drivers' ? driversLoading : constructorsLoading;
  const teamBudget = currentTeam?.budget ?? BUDGET;

  // Map drivers/constructors to which teams they belong to (supports multi-team sell)
  const driverTeamMap = useMemo(() => {
    const map = new Map<string, { teamId: string; teamName: string }[]>();
    for (const team of userTeams) {
      for (const d of team.drivers) {
        const entries = map.get(d.driverId) || [];
        entries.push({ teamId: team.id, teamName: team.name });
        map.set(d.driverId, entries);
      }
    }
    return map;
  }, [userTeams]);

  const constructorTeamMap = useMemo(() => {
    const map = new Map<string, { teamId: string; teamName: string }[]>();
    for (const team of userTeams) {
      if (team.constructor) {
        const entries = map.get(team.constructor.constructorId) || [];
        entries.push({ teamId: team.id, teamName: team.name });
        map.set(team.constructor.constructorId, entries);
      }
    }
    return map;
  }, [userTeams]);

  // On-team driver IDs (derived from map for backward compat)
  const onTeamDriverIds = useMemo(() => {
    return new Set(driverTeamMap.keys());
  }, [driverTeamMap]);

  // On-team constructor ID (current team only, for add logic)
  const onTeamConstructorId = currentTeam?.constructor?.constructorId ?? null;

  // Locked-out driver IDs
  const lockedOutIds = useMemo(() => {
    const completedRaceCount = useAdminStore.getState().getCompletedRaceCount();
    return new Set(getLockedOutDriverIds(currentTeam?.driverLockouts, completedRaceCount));
  }, [currentTeam?.driverLockouts, raceResults]);

  // Calculate top 10 driver IDs by 2026 season points (highest points = top positions)
  const topTenDriverIds = useMemo(() => {
    if (!drivers) return new Set<string>();
    const sorted = [...drivers].sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0));
    return new Set(sorted.slice(0, 10).map(d => d.id));
  }, [drivers]);

  const toggleSort = (option: SortOption) => {
    if (sortBy === option) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(option);
      setSortOrder('desc');
    }
  };

  const filteredConstructors = constructors?.filter((c) =>
    c.name.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  // === Quick-Add Handlers ===

  const handleAddDriver = (driver: Driver) => {
    if (!currentTeam) {
      Alert.alert('No Team', 'Create a team first before adding drivers.');
      return;
    }
    if (lockoutInfo.isLocked) {
      Alert.alert('Teams Locked', lockoutInfo.lockReason || 'Team changes are locked during race weekend.');
      return;
    }
    if (currentTeam.drivers.length >= TEAM_SIZE) {
      Alert.alert('Team Full', `You already have ${TEAM_SIZE} drivers. Swap or remove a driver first.`);
      return;
    }
    if (driver.price > teamBudget) {
      Alert.alert('Insufficient Budget', `${driver.name} costs ${formatDollars(driver.price)} but you only have ${formatDollars(teamBudget)} remaining.`);
      return;
    }
    const completedRaceCount = useAdminStore.getState().getCompletedRaceCount();
    if (isDriverLockedOut(currentTeam.driverLockouts, driver.id, completedRaceCount)) {
      Alert.alert('Driver Locked Out', `${driver.name} is on lockout cooldown and cannot be added yet.`);
      return;
    }
    // Open contract picker
    setPendingDriver(driver);
    setPendingContractLength(PRICING_CONFIG.CONTRACT_LENGTH);
  };

  const handleConfirmAddDriver = () => {
    if (!pendingDriver || !currentTeam) return;
    const driver = pendingDriver;
    const completedRaceCount = Object.values(useAdminStore.getState().raceResults)
      .filter(r => r.isComplete).length;

    const newFantasyDriver: FantasyDriver = {
      driverId: driver.id,
      name: driver.name,
      shortName: driver.shortName,
      constructorId: driver.constructorId,
      purchasePrice: driver.price,
      currentPrice: driver.price,
      pointsScored: 0,
      racesHeld: 0,
      contractLength: pendingContractLength,
      addedAtRace: completedRaceCount,
    };

    const updatedTeam: FantasyTeam = {
      ...currentTeam,
      drivers: [...currentTeam.drivers, newFantasyDriver],
      totalSpent: currentTeam.totalSpent + driver.price,
      budget: currentTeam.budget - driver.price,
      racesSinceTransfer: 0,
      updatedAt: new Date(),
    };
    useTeamStore.getState().setCurrentTeam(updatedTeam);
    setPendingDriver(null);
  };

  const handleAddConstructor = (item: Constructor) => {
    if (!currentTeam) {
      Alert.alert('No Team', 'Create a team first before adding a constructor.');
      return;
    }
    if (lockoutInfo.isLocked) {
      Alert.alert('Teams Locked', lockoutInfo.lockReason || 'Team changes are locked during race weekend.');
      return;
    }
    // Calculate effective budget (sell old constructor if swapping)
    const oldConstructor = currentTeam.constructor;
    let saleReturn = 0;
    if (oldConstructor) {
      const oldContractLen = oldConstructor.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
      const oldEarlyTermFee = calculateEarlyTerminationFee(oldConstructor.purchasePrice, oldContractLen, oldConstructor.racesHeld || 0);
      saleReturn = Math.max(0, oldConstructor.currentPrice - oldEarlyTermFee);
    }
    const effectiveBudget = teamBudget + saleReturn;
    if (item.price > effectiveBudget) {
      Alert.alert('Insufficient Budget', `${item.name} costs ${formatDollars(item.price)} but you only have ${formatDollars(effectiveBudget)} remaining.`);
      return;
    }
    // Open contract picker
    setPendingConstructor(item);
    setPendingContractLength(PRICING_CONFIG.CONTRACT_LENGTH);
  };

  const handleConfirmAddConstructor = () => {
    if (!pendingConstructor || !currentTeam) return;
    const item = pendingConstructor;
    const completedRaceCount = Object.values(useAdminStore.getState().raceResults)
      .filter(r => r.isComplete).length;

    const oldConstructor = currentTeam.constructor;
    let saleReturn = 0;
    let bankedPoints = 0;
    if (oldConstructor) {
      const oldContractLen = oldConstructor.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
      const oldEarlyTermFee = calculateEarlyTerminationFee(oldConstructor.purchasePrice, oldContractLen, oldConstructor.racesHeld || 0);
      saleReturn = Math.max(0, oldConstructor.currentPrice - oldEarlyTermFee);
      bankedPoints = oldConstructor.pointsScored || 0;
    }

    const fantasyConstructor: FantasyConstructor = {
      constructorId: item.id,
      name: item.name,
      purchasePrice: item.price,
      currentPrice: item.price,
      pointsScored: 0,
      racesHeld: 0,
      contractLength: pendingContractLength,
      addedAtRace: completedRaceCount,
    };

    const updatedTeam: FantasyTeam = {
      ...currentTeam,
      constructor: fantasyConstructor,
      totalSpent: currentTeam.totalSpent - (oldConstructor?.purchasePrice || 0) + item.price,
      budget: currentTeam.budget + saleReturn - item.price,
      lockedPoints: (currentTeam.lockedPoints || 0) + bankedPoints,
      updatedAt: new Date(),
    };
    useTeamStore.getState().setCurrentTeam(updatedTeam);
    setPendingConstructor(null);
  };

  // === Sell Handlers ===

  const confirmSellDriver = (driver: Driver, teamId: string) => {
    const team = userTeams.find(t => t.id === teamId);
    if (!team) return;
    const fantasyDriver = team.drivers.find(d => d.driverId === driver.id);
    if (!fantasyDriver) return;

    // Calculate sale value & profit/loss
    const { driverPrices } = useAdminStore.getState();
    const priceUpdate = driverPrices[driver.id];
    const currentMarketPrice = priceUpdate?.currentPrice ?? fantasyDriver.currentPrice;
    const contractLen = fantasyDriver.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
    const inGracePeriod = (fantasyDriver.racesHeld || 0) === 0;
    const earlyTermFee = (fantasyDriver.isReservePick || inGracePeriod) ? 0 : calculateEarlyTerminationFee(currentMarketPrice, contractLen, fantasyDriver.racesHeld || 0);
    const saleValue = Math.max(0, currentMarketPrice - earlyTermFee);
    const profitLoss = saleValue - fantasyDriver.purchasePrice;
    const profitLossStr = profitLoss >= 0 ? `+${formatDollars(profitLoss)}` : `-${formatDollars(Math.abs(profitLoss))}`;

    let message = `Bought: ${formatDollars(fantasyDriver.purchasePrice)}\nMarket: ${formatDollars(currentMarketPrice)}`;
    if (earlyTermFee > 0) {
      message += `\nEarly term fee: -${formatDollars(earlyTermFee)}`;
    }
    message += `\nSale value: ${formatDollars(saleValue)}`;
    message += `\nP/L: ${profitLossStr}`;
    if (userTeams.length > 1) {
      message += `\n\nFrom: ${team.name}`;
    }

    Alert.alert(
      `Sell ${driver.name}?`,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sell',
          style: 'destructive',
          onPress: () => {
            if (currentTeam?.id !== teamId) selectTeam(teamId);
            // Small delay to let selectTeam take effect
            setTimeout(() => removeDriver(driver.id), 50);
          },
        },
      ],
    );
  };

  const handleSellDriver = (driver: Driver) => {
    if (lockoutInfo.isLocked) {
      Alert.alert('Teams Locked', lockoutInfo.lockReason || 'Team changes are locked during race weekend.');
      return;
    }
    const teams = driverTeamMap.get(driver.id);
    if (!teams || teams.length === 0) return;

    if (teams.length === 1) {
      confirmSellDriver(driver, teams[0].teamId);
    } else {
      // Multi-team picker
      Alert.alert(
        `Sell ${driver.name}`,
        'Which team do you want to sell from?',
        [
          ...teams.map(t => ({
            text: t.teamName,
            onPress: () => confirmSellDriver(driver, t.teamId),
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    }
  };

  const confirmSellConstructor = (item: Constructor, teamId: string) => {
    const team = userTeams.find(t => t.id === teamId);
    if (!team || !team.constructor) return;
    const fantasyConstructor = team.constructor;

    const { constructorPrices } = useAdminStore.getState();
    const cPriceUpdate = constructorPrices[item.id];
    const currentMarketPrice = cPriceUpdate?.currentPrice ?? fantasyConstructor.currentPrice;
    const contractLen = fantasyConstructor.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
    const cInGracePeriod = (fantasyConstructor.racesHeld || 0) === 0;
    const earlyTermFee = (fantasyConstructor.isReservePick || cInGracePeriod) ? 0 : calculateEarlyTerminationFee(currentMarketPrice, contractLen, fantasyConstructor.racesHeld || 0);
    const saleValue = Math.max(0, currentMarketPrice - earlyTermFee);
    const profitLoss = saleValue - fantasyConstructor.purchasePrice;
    const profitLossStr = profitLoss >= 0 ? `+${formatDollars(profitLoss)}` : `-${formatDollars(Math.abs(profitLoss))}`;

    let message = `Bought: ${formatDollars(fantasyConstructor.purchasePrice)}\nMarket: ${formatDollars(currentMarketPrice)}`;
    if (earlyTermFee > 0) {
      message += `\nEarly term fee: -${formatDollars(earlyTermFee)}`;
    }
    message += `\nSale value: ${formatDollars(saleValue)}`;
    message += `\nP/L: ${profitLossStr}`;
    if (userTeams.length > 1) {
      message += `\n\nFrom: ${team.name}`;
    }

    Alert.alert(
      `Sell ${item.name}?`,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sell',
          style: 'destructive',
          onPress: () => {
            if (currentTeam?.id !== teamId) selectTeam(teamId);
            setTimeout(() => removeConstructor(), 50);
          },
        },
      ],
    );
  };

  const handleSellConstructor = (item: Constructor) => {
    if (lockoutInfo.isLocked) {
      Alert.alert('Teams Locked', lockoutInfo.lockReason || 'Team changes are locked during race weekend.');
      return;
    }
    const teams = constructorTeamMap.get(item.id);
    if (!teams || teams.length === 0) return;

    if (teams.length === 1) {
      confirmSellConstructor(item, teams[0].teamId);
    } else {
      Alert.alert(
        `Sell ${item.name}`,
        'Which team do you want to sell from?',
        [
          ...teams.map(t => ({
            text: t.teamName,
            onPress: () => confirmSellConstructor(item, t.teamId),
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    }
  };

  const pendingItem = pendingDriver || pendingConstructor;
  const handleConfirmContract = pendingDriver ? handleConfirmAddDriver : handleConfirmAddConstructor;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Tab Selector */}
      <View style={[styles.tabContainer, { backgroundColor: theme.card }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'drivers' && [styles.activeTab, { backgroundColor: theme.primary }]]}
          onPress={() => setActiveTab('drivers')}
        >
          <Text style={[styles.tabText, { fontSize: scaledFonts.md }, activeTab === 'drivers' && styles.activeTabText]}>
            Drivers
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'constructors' && [styles.activeTab, { backgroundColor: theme.primary }]]}
          onPress={() => setActiveTab('constructors')}
        >
          <Text style={[styles.tabText, { fontSize: scaledFonts.md }, activeTab === 'constructors' && styles.activeTabText]}>
            Constructors
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.card }]}>
        <Ionicons name="search" size={scaledIcon(20)} color={COLORS.text.muted} />
        <TextInput
          style={[styles.searchInput, { fontSize: scaledFonts.md }]}
          placeholder={`Search ${activeTab}...`}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={COLORS.text.muted}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={scaledIcon(20)} color={COLORS.text.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Sort Row + Budget Badge */}
      <View style={styles.sortContainer}>
        {activeTab === 'drivers' ? (
          <>
            <Text style={[styles.sortLabel, { fontSize: scaledFonts.sm }]}>Sort by:</Text>
            <View style={styles.sortOptions}>
              {(['price', 'points', 'name'] as SortOption[]).map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.sortButton, { backgroundColor: theme.card }, sortBy === option && [styles.sortButtonActive, { borderColor: theme.primary, backgroundColor: theme.primary + '10' }]]}
                  onPress={() => toggleSort(option)}
                >
                  <Text style={[
                    styles.sortButtonText,
                    { fontSize: scaledFonts.sm },
                    sortBy === option && [styles.sortButtonTextActive, { color: theme.primary }],
                  ]}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </Text>
                  {sortBy === option && (
                    <Ionicons
                      name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                      size={14}
                      color={theme.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={[styles.budgetBadge, { backgroundColor: theme.card, borderColor: theme.primary + '40' }]}>
          <Ionicons name="wallet-outline" size={14} color={theme.primary} />
          <Text style={[styles.budgetBadgeText, { color: theme.primary }]}>
            {formatDollars(teamBudget)}
          </Text>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <Loading message={`Loading ${activeTab}...`} />
      ) : activeTab === 'drivers' ? (
        drivers && drivers.length > 0 ? (
          <FlatList
            data={drivers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isOnTeam = onTeamDriverIds.has(item.id);
              return (
                <DriverCard
                  driver={item}
                  showPrice
                  showPoints
                  showPriceChange
                  isTopTen={topTenDriverIds.has(item.id)}
                  isOnTeam={isOnTeam}
                  onPress={() => router.push(`/market/driver/${item.id}`)}
                  onAdd={!isOnTeam && currentTeam ? () => handleAddDriver(item) : undefined}
                  onSell={isOnTeam ? () => handleSellDriver(item) : undefined}
                />
              );
            }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={10}
            windowSize={5}
            initialNumToRender={10}
          />
        ) : (
          <EmptyState
            icon="person-outline"
            title="No Drivers Found"
            message={searchQuery ? `No drivers match "${searchQuery}"` : 'No drivers available'}
          />
        )
      ) : filteredConstructors && filteredConstructors.length > 0 ? (
        <FlatList
          data={filteredConstructors}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isOnTeam = constructorTeamMap.has(item.id);
            return (
              <ConstructorCard
                constructorData={item}
                showPrice
                showPoints
                showPriceChange
                isOnTeam={isOnTeam}
                onPress={() => router.push(`/market/constructor/${item.id}`)}
                onAdd={!isOnTeam && currentTeam ? () => handleAddConstructor(item) : undefined}
                onSell={isOnTeam ? () => handleSellConstructor(item) : undefined}
              />
            );
          }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
        />
      ) : (
        <EmptyState
          icon="business-outline"
          title="No Constructors Found"
          message={searchQuery ? `No constructors match "${searchQuery}"` : 'No constructors available'}
        />
      )}

      {/* Contract Length Picker Modal */}
      {pendingItem && (
        <View style={styles.contractOverlay}>
          <View style={[styles.contractModal, { backgroundColor: theme.card }]}>
            <Text style={styles.contractTitle}>{pendingItem.name}</Text>
            <Text style={[styles.contractSubtitle, { color: theme.primary }]}>
              {formatDollars(pendingItem.price)}
            </Text>
            <Text style={styles.contractLabel}>Contract Length</Text>
            <View style={styles.contractButtons}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.contractButton,
                    pendingContractLength === n && [styles.contractButtonActive, { borderColor: theme.primary, backgroundColor: theme.primary }],
                  ]}
                  onPress={() => setPendingContractLength(n)}
                >
                  <Text
                    style={[
                      styles.contractButtonText,
                      pendingContractLength === n && styles.contractButtonTextActive,
                    ]}
                  >
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.contractHint}>
              {pendingContractLength} race{pendingContractLength !== 1 ? 's' : ''}
            </Text>
            <View style={styles.contractActions}>
              <TouchableOpacity
                style={[styles.contractCancelBtn, { backgroundColor: theme.card }]}
                onPress={() => { setPendingDriver(null); setPendingConstructor(null); }}
              >
                <Text style={styles.contractCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.contractConfirmBtn, { backgroundColor: theme.primary }]}
                onPress={handleConfirmContract}
              >
                <Text style={styles.contractConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  tabContainer: {
    flexDirection: 'row',
    padding: SPACING.xs,
    margin: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  tab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
  },

  activeTab: {
    backgroundColor: COLORS.primary,
  },

  tabText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },

  activeTabText: {
    color: COLORS.white,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    fontSize: FONTS.sizes.md,
    color: COLORS.text.primary,
  },

  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },

  sortLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginRight: SPACING.sm,
  },

  sortOptions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flex: 1,
  },

  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    gap: SPACING.xs,
  },

  sortButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },

  sortButtonText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
  },

  sortButtonTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  budgetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    marginLeft: SPACING.sm,
  },

  budgetBadgeText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },

  listContent: {
    padding: SPACING.md,
    paddingTop: 0,
  },

  // Contract length picker (matches select-driver.tsx)
  contractOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  contractModal: {
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  contractTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
    textAlign: 'center',
  },
  contractSubtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.primary,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  contractLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  contractButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  contractButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: COLORS.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  contractButtonText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.secondary,
  },
  contractButtonTextActive: {
    color: COLORS.white,
  },
  contractHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  contractActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  contractCancelBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  contractCancelText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },
  contractConfirmBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.button,
    backgroundColor: COLORS.primary,
  },
  contractConfirmText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.white,
    fontWeight: '600',
  },
});
