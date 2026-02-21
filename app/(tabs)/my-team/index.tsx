import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/hooks/useAuth';
import { useScale } from '../../../src/hooks/useScale';
import { useTeamStore, getLockedOutDriverIds, calculateEarlyTerminationFee } from '../../../src/store/team.store';
import { useLeagueStore } from '../../../src/store/league.store';
import { useAdminStore } from '../../../src/store/admin.store';
import { useDrivers, useConstructors, useAvatarGeneration, useLockoutStatus } from '../../../src/hooks';
import { saveAvatarUrl } from '../../../src/services/avatarGeneration.service';
import { Loading, Button, Avatar, AvatarPicker, CountdownBanner } from '../../../src/components';
import { COLORS, SPACING, FONTS, BUDGET, TEAM_SIZE, BORDER_RADIUS } from '../../../src/config/constants';
import { useTheme } from '../../../src/hooks/useTheme';
import { demoConstructors } from '../../../src/data/demoData';
import { PRICING_CONFIG } from '../../../src/config/pricing.config';
import { formatPoints } from '../../../src/utils/formatters';
import { DriverTeamCard } from '../../../src/components/team/DriverTeamCard';
import type { Driver, Constructor } from '../../../src/types';

function getLoyaltyBonus(racesHeld: number): number {
  if (racesHeld === 0) return 0;
  let bonus = 0;
  bonus += Math.min(racesHeld, 3) * 1;
  if (racesHeld > 3) bonus += Math.min(racesHeld - 3, 3) * 2;
  if (racesHeld > 6) bonus += (racesHeld - 6) * 3;
  return bonus;
}

function getNextLoyaltyRate(racesHeld: number): number {
  if (racesHeld < 3) return 1;
  if (racesHeld < 6) return 2;
  return 3;
}

// Auto-fill empty driver/constructor slots on a partial team
function autoFillTeam(
  allDrivers: Driver[],
  allConstructors: Constructor[],
  existingDriverIds: string[],
  hasConstructor: boolean,
  budget: number,
  slotsToFill: number,
): { drivers: Driver[]; constructor: Constructor | null } | null {
  if (slotsToFill === 0 && hasConstructor) return null; // Already full

  const available = allDrivers
    .filter(d => d.isActive && !existingDriverIds.includes(d.id))
    .sort((a, b) => b.price - a.price); // expensive first

  // If we need a constructor, try each one; otherwise just fill drivers
  const constructorCandidates = !hasConstructor
    ? [...allConstructors].sort((a, b) => a.price - b.price)
    : [null];

  let best: { drivers: Driver[]; constructor: Constructor | null; spent: number } | null = null;

  for (const cCandidate of constructorCandidates) {
    let remaining = budget - (cCandidate?.price ?? 0);
    if (remaining < 0) continue;

    const picked: Driver[] = [];
    const pool = [...available];

    // Greedy: pick the most expensive driver that still leaves room to fill remaining slots
    while (picked.length < slotsToFill && pool.length > 0) {
      const spotsLeft = slotsToFill - picked.length;
      let found = false;

      for (let i = 0; i < pool.length; i++) {
        if (pool[i].price > remaining) continue;
        const budgetAfter = remaining - pool[i].price;
        const rest = pool.filter((_, idx) => idx !== i).sort((a, b) => a.price - b.price).slice(0, spotsLeft - 1);
        const minCost = rest.reduce((s, d) => s + d.price, 0);
        if (budgetAfter >= minCost) {
          picked.push(pool[i]);
          remaining -= pool[i].price;
          pool.splice(i, 1);
          found = true;
          break;
        }
      }

      if (!found) {
        const affordable = pool.filter(d => d.price <= remaining).sort((a, b) => a.price - b.price);
        if (affordable.length === 0) break;
        picked.push(affordable[0]);
        remaining -= affordable[0].price;
        pool.splice(pool.indexOf(affordable[0]), 1);
      }
    }

    if (picked.length === slotsToFill) {
      const spent = budget - remaining;
      if (!best || spent > best.spent) {
        best = { drivers: picked, constructor: cCandidate, spent };
      }
    }
  }

  return best;
}

export default function MyTeamScreen() {
  const { user } = useAuth();
  const { scaledFonts, scaledSpacing, scaledIcon } = useScale();
  const theme = useTheme();
  const currentTeam = useTeamStore(s => s.currentTeam);
  const userTeams = useTeamStore(s => s.userTeams);
  const isLoading = useTeamStore(s => s.isLoading);
  const hasHydrated = useTeamStore(s => s.hasHydrated);
  const loadUserTeams = useTeamStore(s => s.loadUserTeams);
  const updateTeamName = useTeamStore(s => s.updateTeamName);
  const removeDriver = useTeamStore(s => s.removeDriver);
  const removeConstructor = useTeamStore(s => s.removeConstructor);
  const setAce = useTeamStore(s => s.setAce);
  const setAceConstructor = useTeamStore(s => s.setAceConstructor);
  const clearAce = useTeamStore(s => s.clearAce);
  const selectTeam = useTeamStore(s => s.selectTeam);
  const recalculateAllTeamsPoints = useTeamStore(s => s.recalculateAllTeamsPoints);
  const setCurrentTeam = useTeamStore(s => s.setCurrentTeam);
  const deleteTeam = useTeamStore(s => s.deleteTeam);
  const assignTeamToLeague = useTeamStore(s => s.assignTeamToLeague);
  const leagues = useLeagueStore(s => s.leagues);
  const loadUserLeagues = useLeagueStore(s => s.loadUserLeagues);
  const raceResults = useAdminStore(s => s.raceResults);
  const { data: allDrivers } = useDrivers();
  const { data: allConstructors } = useConstructors();
  const lockoutInfo = useLockoutStatus();

  const [refreshing, setRefreshing] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [teamAvatarUrl, setTeamAvatarUrl] = useState<string | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { generate: generateAvatar, regenerate: regenerateAvatar, isGenerating: isGeneratingAvatar, isAvailable: isAvatarAvailable } = useAvatarGeneration({
    onSuccess: (url) => {
      setTeamAvatarUrl(url);
      const team = useTeamStore.getState().currentTeam;
      if (team) {
        useTeamStore.getState().setCurrentTeam({ ...team, avatarUrl: url, updatedAt: new Date() });
      }
    },
  });

  // Load user teams on mount (only if not already loaded — prevents overwriting fresh data)
  useEffect(() => {
    if (user) {
      const teams = useTeamStore.getState().userTeams;
      if (teams.length === 0) {
        loadUserTeams(user.id);
      }
      loadUserLeagues(user.id);
      recalculateAllTeamsPoints();
    }
  }, [user]);

  // Reload leagues on focus; ensure team state is consistent
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadUserLeagues(user.id);
        // Read fresh state from store to avoid stale closure issues
        const { userTeams: freshTeams, currentTeam: freshCurrent } = useTeamStore.getState();
        if (freshTeams.length === 0) {
          loadUserTeams(user.id);
        } else if (!freshCurrent) {
          // Teams exist but no team selected (e.g. auto-created by league flow) — select first
          selectTeam(freshTeams[0].id);
        }
      }
    }, [user])
  );

  // Auto-select team when userTeams changes and no team is selected
  useEffect(() => {
    if (userTeams.length > 0 && !currentTeam) {
      selectTeam(userTeams[0].id);
    }
  }, [userTeams.length, currentTeam, selectTeam]);

  // Update avatar URL when team changes
  useEffect(() => {
    if (currentTeam?.avatarUrl) {
      setTeamAvatarUrl(currentTeam.avatarUrl);
    } else {
      setTeamAvatarUrl(null);
    }
  }, [currentTeam?.id, currentTeam?.avatarUrl]);

  const persistAvatarToStore = (url: string) => {
    if (!currentTeam) return;
    setCurrentTeam({ ...currentTeam, avatarUrl: url, updatedAt: new Date() });
  };

  const handleGenerateTeamAvatar = async (style: 'simple' | 'detailed' = 'detailed') => {
    if (!currentTeam) return;
    if (teamAvatarUrl) {
      await regenerateAvatar(currentTeam.name, 'team', currentTeam.id, style);
    } else {
      await generateAvatar(currentTeam.name, 'team', currentTeam.id, style);
    }
  };

  const handleSelectTeamAvatar = async (url: string) => {
    if (!currentTeam) return;
    const result = await saveAvatarUrl('team', currentTeam.id, url);
    if (result.success && result.imageUrl) {
      setTeamAvatarUrl(result.imageUrl);
      persistAvatarToStore(result.imageUrl);
    }
  };

  // Team stats
  const teamStats = useMemo(() => {
    const completedRaces = Object.entries(raceResults)
      .filter(([_, result]) => result.isComplete)
      .sort((a, b) => b[0].localeCompare(a[0]));

    let lastRacePoints = 0;
    if (completedRaces.length > 0 && currentTeam) {
      const [_, lastResult] = completedRaces[0];
      currentTeam.drivers.forEach(driver => {
        const driverResult = lastResult.driverResults.find((dr: any) => dr.driverId === driver.driverId);
        if (driverResult) {
          const multiplier = currentTeam.aceDriverId === driver.driverId ? 2 : 1;
          lastRacePoints += Math.floor(driverResult.points * multiplier);
        }
      });
      if (currentTeam.constructor) {
        const constructorResult = lastResult.constructorResults.find(
          (cr: any) => cr.constructorId === currentTeam.constructor?.constructorId
        );
        if (constructorResult) {
          const cMultiplier = currentTeam.aceConstructorId === currentTeam.constructor.constructorId ? 2 : 1;
          lastRacePoints += Math.floor(constructorResult.points * cMultiplier);
        }
      }
    }

    let leagueRank: number | null = null;
    let leagueSize = 0;
    if (currentTeam?.leagueId) {
      // Only show league stats if the league actually exists
      const leagueExists = leagues.some(l => l.id === currentTeam.leagueId);
      if (leagueExists) {
        const leagueTeams = userTeams.filter(t => t.leagueId === currentTeam.leagueId);
        leagueSize = leagueTeams.length;
        const sorted = [...leagueTeams].sort((a, b) => b.totalPoints - a.totalPoints);
        const rankIndex = sorted.findIndex(t => t.id === currentTeam.id);
        if (rankIndex !== -1) leagueRank = rankIndex + 1;
      }
    }

    const leagueName = currentTeam?.leagueId
      ? leagues.find(l => l.id === currentTeam.leagueId)?.name || null
      : null;

    return {
      lastRacePoints,
      totalPoints: currentTeam?.totalPoints || 0,
      leagueRank,
      leagueSize,
      leagueName,
      leagueId: currentTeam?.leagueId || null,
      hasCompletedRaces: completedRaces.length > 0,
    };
  }, [raceResults, currentTeam, userTeams, leagues]);

  // Per-card last-race breakdown: id -> { base, aceBonus }
  const lastRaceBreakdown = useMemo(() => {
    const map: Record<string, { base: number; aceBonus: number }> = {};
    const completedRaces = Object.entries(raceResults)
      .filter(([_, result]) => result.isComplete)
      .sort((a, b) => b[0].localeCompare(a[0]));
    if (completedRaces.length === 0 || !currentTeam) return map;
    const [_, lastResult] = completedRaces[0];

    currentTeam.drivers.forEach(driver => {
      let base = 0;
      const dr = lastResult.driverResults.find((r: any) => r.driverId === driver.driverId);
      if (dr) base += dr.points;
      const sr = lastResult.sprintResults?.find((r: any) => r.driverId === driver.driverId);
      if (sr) base += sr.points;
      const isAce = currentTeam.aceDriverId === driver.driverId;
      map[driver.driverId] = { base, aceBonus: isAce ? base : 0 };
    });

    if (currentTeam.constructor) {
      let base = 0;
      const cr = lastResult.constructorResults.find(
        (r: any) => r.constructorId === currentTeam.constructor?.constructorId
      );
      if (cr) base += cr.points;
      const scr = lastResult.sprintConstructorResults?.find(
        (r: any) => r.constructorId === currentTeam.constructor?.constructorId
      );
      if (scr) base += scr.points;
      const isAce = currentTeam.aceConstructorId === currentTeam.constructor.constructorId;
      map[currentTeam.constructor.constructorId] = { base, aceBonus: isAce ? base : 0 };
    }

    return map;
  }, [raceResults, currentTeam]);

  // Build a lookup: constructorId -> { shortName, primaryColor }
  // Include demoConstructors as base layer so all constructor IDs resolve
  const constructorLookup = useMemo(() => {
    const map: Record<string, { shortName: string; primaryColor: string }> = {};
    demoConstructors.forEach(c => {
      map[c.id] = { shortName: c.shortName, primaryColor: c.primaryColor };
    });
    allConstructors?.forEach(c => {
      map[c.id] = { shortName: c.shortName, primaryColor: c.primaryColor };
    });
    return map;
  }, [allConstructors]);

  // V5: Locked-out driver names for the lockout banner
  const lockedOutDriverNames = useMemo(() => {
    const completedRaceCount = useAdminStore.getState().getCompletedRaceCount();
    const lockedIds = getLockedOutDriverIds(currentTeam?.driverLockouts, completedRaceCount);
    if (lockedIds.length === 0) return [];
    return lockedIds.map(id => {
      const driver = allDrivers?.find(d => d.id === id);
      return driver?.name || id;
    });
  }, [currentTeam?.driverLockouts, raceResults, allDrivers]);

  // Team value = sum of live prices of all drivers + constructor
  const teamValue = useMemo(() => {
    if (!currentTeam) return 0;
    let value = 0;
    currentTeam.drivers.forEach(d => {
      const market = allDrivers?.find(md => md.id === d.driverId);
      value += market?.price ?? d.currentPrice;
    });
    if (currentTeam.constructor) {
      const market = allConstructors?.find(c => c.id === currentTeam.constructor!.constructorId);
      value += market?.price ?? currentTeam.constructor.currentPrice;
    }
    return value;
  }, [currentTeam, allDrivers, allConstructors]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (user) {
      await loadUserTeams(user.id);
      recalculateAllTeamsPoints();
    }
    setRefreshing(false);
  };

  const handleEditName = () => {
    setEditingName(currentTeam?.name || '');
    setShowEditNameModal(true);
  };

  const handleSaveName = async () => {
    if (!editingName.trim()) return;
    setIsSavingName(true);
    try {
      await updateTeamName(editingName.trim());
      setShowEditNameModal(false);
    } catch {
      // Error handled by store
    } finally {
      setIsSavingName(false);
    }
  };

  const handleRemoveDriver = useCallback((driverId: string, driverName: string) => {
    // V6: Calculate and show early termination fee in confirmation
    const driver = currentTeam?.drivers.find(d => d.driverId === driverId);
    const contractLen = driver?.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
    const marketDriver = allDrivers?.find(d => d.id === driverId);
    const livePrice = marketDriver?.price ?? driver?.currentPrice ?? 0;
    const inGracePeriod = (driver?.racesHeld || 0) === 0;
    const fee = (driver && !driver.isReservePick && !inGracePeriod) ? calculateEarlyTerminationFee(livePrice, contractLen, driver.racesHeld || 0) : 0;
    const saleProceeds = Math.max(0, livePrice - fee);
    const feeMessage = fee > 0
      ? `\n\nEarly termination fee: $${fee}\nYou'll receive: $${saleProceeds}`
      : `\n\nYou'll receive: $${saleProceeds}`;

    Alert.alert(
      'Remove Driver',
      `Are you sure you want to remove ${driverName} from your team?${feeMessage}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try { await removeDriver(driverId); } catch { /* store handles */ }
          },
        },
      ]
    );
  }, [currentTeam, allDrivers, removeDriver]);

  const handleRemoveConstructor = useCallback(() => {
    if (!currentTeam?.constructor) return;
    // V8: Calculate and show early termination fee in confirmation
    const c = currentTeam.constructor;
    const contractLen = c.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
    const marketC = allConstructors?.find(mc => mc.id === c.constructorId);
    const livePrice = marketC?.price ?? c.currentPrice;
    const cInGracePeriod = (c.racesHeld || 0) === 0;
    const fee = (c.isReservePick || cInGracePeriod) ? 0 : calculateEarlyTerminationFee(livePrice, contractLen, c.racesHeld || 0);
    const saleProceeds = Math.max(0, livePrice - fee);
    const feeMessage = fee > 0
      ? `\n\nEarly termination fee: $${fee}\nYou'll receive: $${saleProceeds}`
      : `\n\nYou'll receive: $${saleProceeds}`;

    Alert.alert(
      'Remove Constructor',
      `Are you sure you want to remove ${currentTeam.constructor.name} from your team?${feeMessage}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try { await removeConstructor(); } catch { /* store handles */ }
          },
        },
      ]
    );
  }, [currentTeam, allConstructors, removeConstructor]);

  const handleSetAce = useCallback(async (driverId: string) => {
    try {
      await setAce(driverId);
      // Check if the store set an error (setAce doesn't throw, it sets error state)
      const storeError = useTeamStore.getState().error;
      if (storeError) {
        Alert.alert('Cannot Set Ace', storeError);
      }
    } catch { Alert.alert('Error', 'Failed to set Ace'); }
  }, [setAce]);

  const handleClearAce = useCallback(async () => {
    try { await clearAce(); } catch { Alert.alert('Error', 'Failed to clear Ace'); }
  }, [clearAce]);

  const handleSetAceConstructor = useCallback(async (constructorId: string) => {
    try {
      await setAceConstructor(constructorId);
      const storeError = useTeamStore.getState().error;
      if (storeError) {
        Alert.alert('Cannot Set Ace', storeError);
      }
    } catch { Alert.alert('Error', 'Failed to set Ace Constructor'); }
  }, [setAceConstructor]);

  // V5: Lockout-aware canModify and canChangeAce
  const canModify = !lockoutInfo.isLocked && (currentTeam?.lockStatus.canModify ?? true);
  const canChangeAce = !lockoutInfo.aceLocked && (currentTeam?.lockStatus.canModify ?? true);

  // Find the first league that doesn't already have one of the user's teams
  const availableLeague = useMemo(() => {
    const leaguesWithTeams = new Set(
      userTeams.map(t => t.leagueId).filter(Boolean)
    );
    return leagues.find(l => !leaguesWithTeams.has(l.id)) || null;
  }, [leagues, userTeams]);

  const handleJoinLeague = async () => {
    if (!currentTeam || !availableLeague) {
      router.push('/leagues');
      return;
    }
    try {
      await assignTeamToLeague(currentTeam.id, availableLeague.id);
    } catch {
      // Error handled by store
    }
  };

  const handleAutoFill = async () => {
    if (!currentTeam || !allDrivers || !allConstructors) return;

    const driversNeeded = TEAM_SIZE - currentTeam.drivers.length;
    const needsConstructor = !currentTeam.constructor;
    if (driversNeeded === 0 && !needsConstructor) return;

    const existingIds = currentTeam.drivers.map(d => d.driverId);
    const result = autoFillTeam(
      allDrivers,
      allConstructors,
      existingIds,
      !needsConstructor,
      currentTeam.budget,
      driversNeeded,
    );

    if (!result) {
      Alert.alert('Cannot Auto-Fill', 'Not enough budget to fill remaining slots.');
      return;
    }

    setIsAutoFilling(true);
    try {
      const completedRaceCount = useAdminStore.getState().getCompletedRaceCount();
      const newDrivers = result.drivers.map(d => ({
        driverId: d.id,
        name: d.name,
        shortName: d.shortName,
        constructorId: d.constructorId,
        purchasePrice: d.price,
        currentPrice: d.price,
        pointsScored: 0,
        racesHeld: 0,
        contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
        addedAtRace: completedRaceCount,
      }));

      const addedCost = result.drivers.reduce((s, d) => s + d.price, 0)
        + (result.constructor?.price ?? 0);

      const newConstructor = result.constructor ? {
        constructorId: result.constructor.id,
        name: result.constructor.name,
        shortName: result.constructor.shortName,
        purchasePrice: result.constructor.price,
        currentPrice: result.constructor.price,
        pointsScored: 0,
        racesHeld: 0,
        contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
        addedAtRace: completedRaceCount,
      } : currentTeam.constructor;

      setCurrentTeam({
        ...currentTeam,
        drivers: [...currentTeam.drivers, ...newDrivers],
        constructor: newConstructor,
        totalSpent: currentTeam.totalSpent + addedCost,
        budget: currentTeam.budget - addedCost,
        updatedAt: new Date(),
      });
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleDeleteTeam = () => {
    const teamName = currentTeam?.name || 'this team';
    const points = currentTeam?.totalPoints || 0;
    const inLeague = !!currentTeam?.leagueId;
    const leagueName = teamStats.leagueName;

    // Step 1: Initial warning
    Alert.alert(
      'Delete Team?',
      `You're about to delete "${teamName}" with ${formatPoints(points)} total points and ${driversCount} driver${driversCount !== 1 ? 's' : ''}.`,
      [
        { text: 'Keep Team', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            if (inLeague) {
              // Step 2: League warning
              Alert.alert(
                'League Score Preserved',
                `"${teamName}" has ${formatPoints(points)} points in ${leagueName || 'your league'}. The team's score will remain on the league leaderboard as "Withdrawn" after deletion.`,
                [
                  { text: 'Go Back', style: 'cancel' },
                  {
                    text: 'Continue',
                    style: 'destructive',
                    onPress: () => confirmFinalDelete(teamName),
                  },
                ]
              );
            } else {
              confirmFinalDelete(teamName);
            }
          },
        },
      ]
    );
  };

  const confirmFinalDelete = (teamName: string) => {
    // Final confirmation
    Alert.alert(
      'Permanently Delete?',
      `This will permanently delete "${teamName}". All drivers, constructor, and team data will be lost. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteTeam();
            } catch {
              Alert.alert('Error', 'Failed to delete team');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  // Memoize enriched driver data to avoid recomputing on every render
  const enrichedDrivers = useMemo(() => {
    if (!currentTeam?.drivers) return [];
    return [...currentTeam.drivers]
      .map(driver => {
        const marketDriver = allDrivers?.find(d => d.id === driver.driverId);
        const livePrice = marketDriver?.price ?? driver.currentPrice;
        const driverNumber = marketDriver?.number;
        const resolvedConstructorId = marketDriver?.constructorId ?? driver.constructorId;
        const cInfo = constructorLookup[resolvedConstructorId];
        const isAce = currentTeam?.aceDriverId === driver.driverId;
        const canBeAce = livePrice <= PRICING_CONFIG.ACE_MAX_PRICE;
        const priceDiff = livePrice - driver.purchasePrice;
        const nextRate = getNextLoyaltyRate(driver.racesHeld || 0);
        const contractLen = driver.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
        const contractRemaining = contractLen - (driver.racesHeld || 0);
        const isLastRace = contractRemaining === 1;
        const isReserve = driver.isReservePick;
        const inGracePeriod = (driver.racesHeld || 0) === 0;
        const earlyTermFee = (isReserve || inGracePeriod) ? 0 : calculateEarlyTerminationFee(livePrice, contractLen, driver.racesHeld || 0);
        const effectiveSaleValue = Math.max(0, livePrice - earlyTermFee);
        const saleProfit = effectiveSaleValue - driver.purchasePrice;
        const accentColor = isReserve ? COLORS.text.muted : cInfo?.primaryColor || COLORS.text.muted;
        return {
          ...driver,
          livePrice, driverNumber, resolvedConstructorId, cInfo,
          isAce, canBeAce, priceDiff, nextRate, contractLen,
          contractRemaining, isLastRace, isReserve, inGracePeriod,
          earlyTermFee, effectiveSaleValue, saleProfit, accentColor,
        };
      })
      .sort((a, b) => b.livePrice - a.livePrice);
  }, [currentTeam?.drivers, currentTeam?.aceDriverId, allDrivers, constructorLookup]);

  // --- Early returns ---

  if (!hasHydrated) {
    return <Loading fullScreen message="Loading..." />;
  }

  if (!currentTeam && userTeams.length > 0) {
    return <Loading fullScreen message="Loading your team..." />;
  }

  if (!isLoading && !currentTeam && userTeams.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.welcomeContainer}>
          <View style={styles.welcomeIconContainer}>
            <Ionicons name="people" size={48} color={theme.primary} />
          </View>
          <Text style={[styles.welcomeTitle, { fontSize: scaledFonts.xxl }]}>Create Your Team</Text>
          <Text style={[styles.welcomeMessage, { fontSize: scaledFonts.lg }]}>
            Build your team with 5 drivers and 1 constructor.
            Play solo or compete in leagues with friends!
          </Text>
          <Button
            title="Create Team"
            onPress={() => router.push('/my-team/create')}
            fullWidth
            style={{ marginBottom: SPACING.md }}
          />
          <Text style={styles.welcomeHint}>
            You'll choose to play solo or join a league during setup
          </Text>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return <Loading fullScreen message="Loading your team..." />;
  }

  const driversCount = currentTeam?.drivers.length || 0;
  const hasConstructor = !!currentTeam?.constructor;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Team Switcher */}
        {userTeams.length > 1 && (
          <View style={styles.teamSwitcher}>
            {userTeams.map((team) => (
              <TouchableOpacity
                key={team.id}
                style={[
                  styles.teamTab,
                  currentTeam?.id === team.id && [styles.teamTabActive, { backgroundColor: theme.primary, borderColor: theme.primary }],
                ]}
                onPress={() => selectTeam(team.id)}
              >
                <Text
                  style={[
                    styles.teamTabText,
                    currentTeam?.id === team.id && styles.teamTabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {team.name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.teamTabNew}
              onPress={() => router.push('/my-team/create')}
            >
              <Ionicons name="add" size={18} color={theme.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* New Team button when only 1 team */}
        {userTeams.length === 1 && (
          <TouchableOpacity
            style={styles.newTeamLink}
            onPress={() => router.push('/my-team/create')}
          >
            <Ionicons name="add-circle-outline" size={14} color={theme.primary} />
            <Text style={[styles.newTeamLinkText, { color: theme.primary }]}>New Team</Text>
          </TouchableOpacity>
        )}

        {/* Team Name Header with Avatar */}
        <View style={styles.teamNameRow}>
          <Avatar
            name={currentTeam?.name || 'My Team'}
            size="medium"
            variant="team"
            imageUrl={teamAvatarUrl}
            isGenerating={isGeneratingAvatar}
            editable={canModify}
            onPress={canModify ? () => setShowAvatarPicker(true) : undefined}
          />
          <TouchableOpacity
            style={styles.teamNameContent}
            onPress={canModify ? handleEditName : undefined}
            activeOpacity={canModify ? 0.6 : 1}
          >
            <View style={styles.teamNameLine}>
              <Text style={[styles.teamName, { fontSize: scaledFonts.xxl }]}>{currentTeam?.name || 'My Team'}</Text>
              {canModify && (
                <Ionicons name="pencil" size={14} color={COLORS.text.muted} />
              )}
              {currentTeam?.isLocked && (
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={12} color={COLORS.white} />
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* V5: Lockout Banner */}
        {lockoutInfo.isLocked && (
          <View style={styles.lockoutBanner}>
            <Ionicons name="lock-closed" size={16} color="#7c3aed" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.lockoutBannerText, { fontSize: scaledFonts.md }]}>
                {lockoutInfo.lockReason || 'Teams locked'}
              </Text>
              {!lockoutInfo.aceLocked && (
                <Text style={styles.lockoutBannerHint}>Ace selection still open until race start</Text>
              )}
            </View>
          </View>
        )}

        {/* Live Countdown Banner */}
        {lockoutInfo.nextRace && !lockoutInfo.isLocked && (
          <CountdownBanner race={lockoutInfo.nextRace} accentColor="#7c3aed" />
        )}

        {/* Team Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { fontSize: scaledFonts.lg }]}>
              {teamStats.hasCompletedRaces ? teamStats.lastRacePoints : '-'}
            </Text>
            <Text style={[styles.statLabel, { fontSize: scaledFonts.sm }]}>Last Race</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { fontSize: scaledFonts.lg }]}>{formatPoints(teamStats.totalPoints)}</Text>
            <Text style={[styles.statLabel, { fontSize: scaledFonts.sm }]}>Total Pts</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { fontSize: scaledFonts.lg }]}>${formatPoints(currentTeam?.budget || 0)}</Text>
            <Text style={[styles.statLabel, { fontSize: scaledFonts.sm }]}>Bank</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { fontSize: scaledFonts.lg }]}>${formatPoints(teamValue)}</Text>
            <Text style={[styles.statLabel, { fontSize: scaledFonts.sm }]}>Value</Text>
          </View>
          <View style={styles.statDivider} />
          {teamStats.leagueId ? (
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push(`/leagues/${teamStats.leagueId}`)}
            >
              <Text style={[styles.statValue, { fontSize: scaledFonts.lg }]}>
                {teamStats.leagueRank !== null ? `#${teamStats.leagueRank}` : '—'}
              </Text>
              <Text style={[styles.statLabel, { fontSize: scaledFonts.sm }]} numberOfLines={1}>
                {teamStats.leagueName || 'League'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.statItem}
              onPress={handleJoinLeague}
            >
              <Ionicons name="trophy-outline" size={20} color={theme.primary} />
              <Text style={[styles.joinLeagueText, { fontSize: scaledFonts.sm, color: theme.primary }]}>
                {availableLeague ? 'Join League' : 'Solo'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Team Completion Alerts */}
        {currentTeam && driversCount < TEAM_SIZE && canModify && (
          <TouchableOpacity
            style={[styles.teamAlert, { backgroundColor: COLORS.warning + '15', borderColor: COLORS.warning + '30' }]}
            onPress={() => router.push('/my-team/select-driver')}
            activeOpacity={0.7}
          >
            <Ionicons name="alert-circle" size={16} color={COLORS.warning} />
            <Text style={[styles.teamAlertText, { color: COLORS.warning, fontSize: scaledFonts.md }]}>
              {TEAM_SIZE - driversCount} driver slot{TEAM_SIZE - driversCount !== 1 ? 's' : ''} empty — tap to add
            </Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.warning} />
          </TouchableOpacity>
        )}
        {currentTeam && !currentTeam.constructor && canModify && (
          <TouchableOpacity
            style={[styles.teamAlert, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '30' }]}
            onPress={() => router.push('/my-team/select-constructor')}
            activeOpacity={0.7}
          >
            <Ionicons name="construct" size={16} color={theme.primary} />
            <Text style={[styles.teamAlertText, { color: theme.primary, fontSize: scaledFonts.md }]}>
              No constructor selected — tap to add
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.primary} />
          </TouchableOpacity>
        )}
        {currentTeam && !currentTeam.aceDriverId && !currentTeam.aceConstructorId && driversCount > 0 &&
          (currentTeam.drivers.some(d => {
            const md = allDrivers?.find(m => m.id === d.driverId);
            return (md?.price ?? d.currentPrice) <= PRICING_CONFIG.ACE_MAX_PRICE;
          }) || (currentTeam.constructor && (
            allConstructors?.find(c => c.id === currentTeam.constructor?.constructorId)?.price ?? currentTeam.constructor.currentPrice
          ) <= PRICING_CONFIG.ACE_MAX_PRICE)) && (
          <View style={[styles.teamAlert, { backgroundColor: COLORS.gold + '15', borderColor: COLORS.gold + '30' }]}>
            <Ionicons name="diamond-outline" size={16} color={COLORS.gold} />
            <Text style={[styles.teamAlertText, { color: COLORS.gold, fontSize: scaledFonts.md }]}>
              No Ace selected — tap the diamond icon on an eligible driver or constructor (under ${PRICING_CONFIG.ACE_MAX_PRICE})
            </Text>
          </View>
        )}

        {/* V5: Driver lockout notice */}
        {lockedOutDriverNames.length > 0 && (
          <View style={styles.lockoutNotice}>
            <Ionicons name="time-outline" size={14} color={COLORS.warning} />
            <Text style={styles.lockoutNoticeText}>
              {lockedOutDriverNames.join(', ')} {lockedOutDriverNames.length === 1 ? 'is' : 'are'} locked out for 1 race after contract expiry
            </Text>
          </View>
        )}

        {/* Driver list */}
        {enrichedDrivers.length > 0 ? (
          enrichedDrivers.map((driver) => (
            <DriverTeamCard
              key={driver.driverId}
              driver={driver}
              lastRaceEntry={lastRaceBreakdown[driver.driverId]}
              canModify={canModify}
              canChangeAce={canChangeAce}
              onSetAce={handleSetAce}
              onClearAce={handleClearAce}
              onRemoveDriver={handleRemoveDriver}
            />
          ))
        ) : null}

        {/* Add Driver button */}
        {driversCount < TEAM_SIZE && canModify && (
          <TouchableOpacity
            testID="add-driver-btn"
            style={[styles.addSlotButton, { borderColor: theme.primary + '30', backgroundColor: theme.primary + '06' }]}
            onPress={() => router.push('/my-team/select-driver')}
          >
            <Ionicons name="add" size={18} color={theme.primary} />
            <Text style={[styles.addSlotText, { fontSize: scaledFonts.md, color: theme.primary }]}>Add Driver ({TEAM_SIZE - driversCount} remaining)</Text>
          </TouchableOpacity>
        )}

        {/* Constructor row */}
        {currentTeam?.constructor ? (() => {
          const c = currentTeam.constructor;
          const marketC = allConstructors?.find(mc => mc.id === c.constructorId);
          const livePrice = marketC?.price ?? c.currentPrice;
          const cInfo = constructorLookup[c.constructorId];
          const cPriceDiff = livePrice - c.purchasePrice;
          const cNextRate = getNextLoyaltyRate(c.racesHeld || 0);
          const cContractLen = c.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
          const cContractRemaining = cContractLen - (c.racesHeld || 0);
          const cIsLastRace = cContractRemaining === 1;
          const cIsReserve = !!c.isReservePick;
          const cInGracePeriod = (c.racesHeld || 0) === 0;
          const cEarlyTermFee = (cIsReserve || cInGracePeriod) ? 0 : calculateEarlyTerminationFee(livePrice, cContractLen, c.racesHeld || 0);
          const cEffectiveSaleValue = Math.max(0, livePrice - cEarlyTermFee);
          const cSaleProfit = cEffectiveSaleValue - c.purchasePrice;
          const cAccent = cInfo?.primaryColor || theme.primary;

          const isAceConstructor = currentTeam?.aceConstructorId === c.constructorId;
          const canBeAceConstructor = livePrice <= PRICING_CONFIG.ACE_MAX_PRICE;
          const hasNoAce = !currentTeam?.aceDriverId && !currentTeam?.aceConstructorId;

          return (
            <View style={styles.card}>
              <View style={[styles.cardAccent, { backgroundColor: cAccent }]} />
              <View style={styles.cardBody}>
                <View style={styles.cardTopRow}>
                  <View style={styles.cardIdentity}>
                    <Ionicons name="construct" size={14} color={cAccent} />
                    <Text style={[styles.cardName, { fontSize: scaledFonts.lg }]} numberOfLines={1}>{c.name}</Text>
                    {isAceConstructor && (
                      <TouchableOpacity onPress={() => handleClearAce()} hitSlop={8}>
                        <View style={styles.aceActive}>
                          <Ionicons name="diamond" size={12} color={COLORS.white} />
                        </View>
                      </TouchableOpacity>
                    )}
                    {!isAceConstructor && canBeAceConstructor && canChangeAce && hasNoAce && (
                      <TouchableOpacity onPress={() => handleSetAceConstructor(c.constructorId)} hitSlop={8}>
                        <Ionicons name="diamond-outline" size={15} color={COLORS.gold} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {!cIsReserve ? (
                    <View style={styles.cardPriceBlock}>
                      <Text style={[styles.cardPrice, { fontSize: scaledFonts.lg }]}>${livePrice}</Text>
                      {cPriceDiff !== 0 && (
                        <View style={[styles.cardPriceDiff, cPriceDiff > 0 ? styles.priceUp : styles.priceDown]}>
                          <Ionicons name={cPriceDiff > 0 ? 'caret-up' : 'caret-down'} size={10} color={COLORS.white} />
                          <Text style={styles.cardPriceDiffText}>${Math.abs(cPriceDiff)}</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.reserveTag}>
                      <Text style={styles.reserveTagText}>AUTO-FILL</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardMetaRow}>
                  {cInfo && (
                    <View style={[styles.metaChip, { backgroundColor: cAccent + '18' }]}>
                      <Text style={[styles.metaChipText, { color: cAccent }]}>{cInfo.shortName}</Text>
                    </View>
                  )}
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>{formatPoints(c.pointsScored)} pts</Text>
                  </View>
                  {lastRaceBreakdown[c.constructorId] != null && (
                    <View style={[styles.metaChip, { backgroundColor: lastRaceBreakdown[c.constructorId].base > 0 ? '#16a34a18' : undefined }]}>
                      <Text style={[styles.metaChipText, lastRaceBreakdown[c.constructorId].base > 0 && { color: '#16a34a' }]}>
                        +{lastRaceBreakdown[c.constructorId].base}
                        {lastRaceBreakdown[c.constructorId].aceBonus > 0 ? ` (+${lastRaceBreakdown[c.constructorId].aceBonus})` : ''}
                        {' last'}
                      </Text>
                    </View>
                  )}
                  {!cIsReserve ? (
                    <>
                      <View style={[styles.metaChip, cIsLastRace && { backgroundColor: COLORS.warning + '18' }]}>
                        <Ionicons name="document-text-outline" size={10} color={cIsLastRace ? COLORS.warning : COLORS.text.muted} />
                        <Text style={[styles.metaChipText, cIsLastRace && { color: COLORS.warning, fontWeight: '700' }]}>
                          {cIsLastRace ? 'LAST' : `${c.racesHeld || 0}/${cContractLen}`}
                        </Text>
                      </View>
                      <View style={styles.metaChip}>
                        <Ionicons name="flame" size={10} color={cNextRate > 1 ? COLORS.gold : COLORS.text.muted} />
                        <Text style={[styles.metaChipText, cNextRate > 1 && { color: COLORS.gold }]}>+{cNextRate}/r</Text>
                      </View>
                    </>
                  ) : (
                    <View style={[styles.metaChip, { backgroundColor: COLORS.warning + '18' }]}>
                      <Ionicons name="timer-outline" size={10} color={COLORS.warning} />
                      <Text style={[styles.metaChipText, { color: COLORS.warning }]}>
                        Expires in {cContractRemaining} race{cContractRemaining !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }} />
                  {canModify && !cIsReserve && (
                    <TouchableOpacity
                      onPress={handleRemoveConstructor}
                      hitSlop={6}
                      style={[styles.sellChip, cInGracePeriod ? styles.sellChipNeutral : cSaleProfit >= 0 ? styles.sellChipProfit : styles.sellChipLoss]}
                    >
                      <Text style={[styles.sellChipText, cInGracePeriod ? styles.sellChipTextNeutral : cSaleProfit >= 0 ? styles.sellChipTextProfit : styles.sellChipTextLoss]}>
                        {cInGracePeriod ? `Sell $${livePrice}` : `Sell ${cSaleProfit >= 0 ? '+' : '-'}$${Math.abs(cSaleProfit)}`}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {canModify && cIsReserve && (
                    <TouchableOpacity
                      onPress={handleRemoveConstructor}
                      hitSlop={6}
                      style={[styles.swapChip, { backgroundColor: theme.primary + '12', borderColor: theme.primary + '25' }]}
                    >
                      <Text style={[styles.swapChipText, { color: theme.primary }]}>Swap</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        })() : null}

        {/* Add Constructor button */}
        {!hasConstructor && canModify && (
          <TouchableOpacity
            testID="add-constructor-btn"
            style={[styles.addSlotButton, { borderColor: theme.primary + '30', backgroundColor: theme.primary + '06' }]}
            onPress={() => router.push('/my-team/select-constructor')}
          >
            <Ionicons name="add" size={18} color={theme.primary} />
            <Text style={[styles.addSlotText, { fontSize: scaledFonts.md, color: theme.primary }]}>Add Constructor (0/1)</Text>
          </TouchableOpacity>
        )}

        {/* Auto-fill button — shown when team has empty slots */}
        {canModify && (driversCount < TEAM_SIZE || !hasConstructor) && (
          <TouchableOpacity
            testID="auto-fill-btn"
            style={styles.autoFillButton}
            onPress={handleAutoFill}
            disabled={isAutoFilling}
            activeOpacity={0.7}
          >
            <Text style={styles.autoFillIcon}>⚡</Text>
            <Text style={[styles.autoFillText, { fontSize: scaledFonts.lg }]}>
              {isAutoFilling ? 'Filling...' : 'Auto-Fill Remaining Slots'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Delete Team button */}
        <TouchableOpacity
          style={styles.deleteTeamButton}
          onPress={handleDeleteTeam}
          disabled={isDeleting}
        >
          <Ionicons name="trash-outline" size={16} color={COLORS.error} />
          <Text style={[styles.deleteTeamText, { fontSize: scaledFonts.lg }]}>
            {isDeleting ? 'Deleting...' : 'Delete Team'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Avatar Picker Modal */}
      {currentTeam && (
        <AvatarPicker
          visible={showAvatarPicker}
          onClose={() => setShowAvatarPicker(false)}
          name={currentTeam.name}
          type="team"
          currentAvatarUrl={teamAvatarUrl}
          onSelectAvatar={handleSelectTeamAvatar}
          onGenerateAI={handleGenerateTeamAvatar}
          isGeneratingAI={isGeneratingAvatar}
          canGenerateAI={isAvatarAvailable}
          userId={user?.id}
        />
      )}

      {/* Edit Name Modal */}
      <Modal
        visible={showEditNameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditNameModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Team Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editingName}
              onChangeText={setEditingName}
              placeholder="Enter team name"
              placeholderTextColor={COLORS.gray[400]}
              maxLength={30}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowEditNameModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSaveButton,
                  { backgroundColor: theme.primary },
                  (!editingName.trim() || isSavingName) && { opacity: 0.5 },
                ]}
                onPress={handleSaveName}
                disabled={!editingName.trim() || isSavingName}
              >
                <Text style={styles.modalSaveText}>
                  {isSavingName ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  welcomeContainer: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'center',
  },
  welcomeIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.glass.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  welcomeTitle: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  welcomeMessage: {
    fontSize: FONTS.sizes.lg,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  welcomeHint: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
    textAlign: 'center',
  },

  // Team switcher
  teamSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  teamTab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  teamTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  teamTabText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.secondary,
    maxWidth: 120,
  },
  teamTabTextActive: {
    color: COLORS.text.inverse,
  },
  teamTabNew: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border.accent,
    borderStyle: 'dashed',
  },
  newTeamLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-end',
    marginBottom: SPACING.sm,
  },
  newTeamLinkText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    color: COLORS.primary,
  },

  // Team stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  statValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  statLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border.default,
  },
  joinLeagueText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 2,
  },

  // Team name header
  teamNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  teamNameContent: {
    flex: 1,
  },
  teamNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  teamName: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },
  lockBadge: {
    backgroundColor: COLORS.error,
    borderRadius: SPACING.xs,
    padding: 4,
  },

  // Driver/Constructor card
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    overflow: 'hidden',
  },
  cardReserve: {
    opacity: 0.6,
  },
  cardAccent: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    gap: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  cardNumberBadge: {
    minWidth: 28,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  cardNumberText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '800',
    color: COLORS.white,
  },
  cardName: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
    flexShrink: 1,
  },
  aceActive: {
    backgroundColor: COLORS.gold,
    borderRadius: 8,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPriceBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardPrice: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  cardPriceDiff: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  priceUp: {
    backgroundColor: '#16a34a',
  },
  priceDown: {
    backgroundColor: COLORS.error,
  },
  cardPriceDiffText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
  },
  reserveTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: COLORS.text.muted + '20',
  },
  reserveTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text.muted,
    letterSpacing: 0.5,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  metaChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text.muted,
  },
  sellChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
  },
  sellChipProfit: {
    backgroundColor: '#16a34a12',
    borderColor: '#16a34a25',
  },
  sellChipLoss: {
    backgroundColor: COLORS.error + '12',
    borderColor: COLORS.error + '25',
  },
  sellChipNeutral: {
    backgroundColor: COLORS.text.muted + '12',
    borderColor: COLORS.text.muted + '25',
  },
  sellChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sellChipTextProfit: {
    color: '#16a34a',
  },
  sellChipTextLoss: {
    color: COLORS.error,
  },
  sellChipTextNeutral: {
    color: COLORS.text.muted,
  },
  swapChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.primary + '12',
    borderWidth: 1,
    borderColor: COLORS.primary + '25',
  },
  swapChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  // V5: Lockout styles
  lockoutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: '#7c3aed' + '15',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#7c3aed' + '30',
  },
  lockoutBannerText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: '#7c3aed',
  },
  lockoutBannerHint: {
    fontSize: FONTS.sizes.sm,
    color: '#7c3aed' + 'AA',
    marginTop: 2,
  },
  lockoutNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.warning + '15',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },
  lockoutNoticeText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    lineHeight: 18,
  },

  teamAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
  },
  teamAlertText: {
    flex: 1,
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    lineHeight: 20,
  },

  // Add slot button
  addSlotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    borderStyle: 'dashed',
    backgroundColor: COLORS.primary + '06',
  },
  addSlotText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Manage button
  autoFillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.button,
    backgroundColor: COLORS.success,
  },
  autoFillIcon: {
    fontSize: FONTS.sizes.lg,
  },
  autoFillText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.white,
  },
  deleteTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  deleteTeamText: {
    fontSize: FONTS.sizes.lg,
    color: COLORS.error,
    fontWeight: '500',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  modalTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border.default,
    borderRadius: BORDER_RADIUS.input,
    padding: SPACING.md,
    fontSize: FONTS.sizes.md,
    color: COLORS.text.primary,
    backgroundColor: COLORS.card,
    marginBottom: SPACING.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    backgroundColor: COLORS.card,
  },
  modalCancelText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.button,
    backgroundColor: COLORS.primary,
  },
  modalSaveText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.inverse,
    fontWeight: '600',
  },
});
