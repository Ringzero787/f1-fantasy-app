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
import { useTeamStore } from '../../../src/store/team.store';
import { useLeagueStore } from '../../../src/store/league.store';
import { useDrivers, useConstructors, useAvatarGeneration } from '../../../src/hooks';
import {
  Card,
  Loading,
  EmptyState,
  BudgetBar,
  DriverCard,
  ConstructorCard,
  Button,
  Avatar,
} from '../../../src/components';
import { COLORS, SPACING, FONTS, BUDGET, TEAM_SIZE, BORDER_RADIUS, SALE_COMMISSION_RATE } from '../../../src/config/constants';
import { formatPoints } from '../../../src/utils/formatters';
import type { Driver, FantasyDriver } from '../../../src/types';

// Swap recommendation type
interface SwapRecommendation {
  currentDriver: FantasyDriver;
  recommendedDriver: Driver;
  reason: string;
  pointsDiff: number;
  priceDiff: number;
  canAfford: boolean;
}

export default function MyTeamScreen() {
  const { user } = useAuth();
  const { currentTeam, userTeams, isLoading, error, hasHydrated, loadUserTeams, updateTeamName, removeDriver, removeConstructor, setStarDriver, setStarConstructor, getEligibleStarDrivers, selectTeam, recalculateAllTeamsPoints, swapDriver, addDriver, setConstructor } = useTeamStore();

  // Get eligible star drivers (bottom 10 by points)
  const eligibleStarDrivers = getEligibleStarDrivers();
  const { leagues, loadUserLeagues } = useLeagueStore();
  const { data: allDrivers, isLoading: isLoadingDrivers } = useDrivers();
  const { data: allConstructors, isLoading: isLoadingConstructors } = useConstructors();

  const [refreshing, setRefreshing] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState<SwapRecommendation | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [teamAvatarUrl, setTeamAvatarUrl] = useState<string | null>(null);
  const [isBuildingRecommended, setIsBuildingRecommended] = useState(false);

  const { generate: generateAvatar, regenerate: regenerateAvatar, isGenerating: isGeneratingAvatar, isAvailable: isAvatarAvailable } = useAvatarGeneration({
    onSuccess: (url) => setTeamAvatarUrl(url),
  });

  // Calculate swap recommendations for each driver
  const getSwapRecommendation = useMemo(() => {
    return (fantasyDriver: FantasyDriver): SwapRecommendation | null => {
      if (!allDrivers || !currentTeam) return null;

      // Get IDs of drivers already on the team
      const teamDriverIds = new Set(currentTeam.drivers.map(d => d.driverId));

      // Calculate sale value of current driver (minus 5% commission)
      const saleValue = Math.floor(fantasyDriver.currentPrice * (1 - SALE_COMMISSION_RATE));
      const availableBudget = currentTeam.budget + saleValue;

      // Find drivers not on team that we can afford
      const availableDrivers = allDrivers.filter(d =>
        !teamDriverIds.has(d.id) && d.price <= availableBudget
      );

      if (availableDrivers.length === 0) return null;

      // Score each driver by value (points per price) and total points
      const scoredDrivers = availableDrivers.map(d => {
        const ppm = d.seasonPoints / d.price; // Points per million
        const pointsDiff = d.seasonPoints - fantasyDriver.pointsScored;
        const priceDiff = d.price - fantasyDriver.currentPrice;

        return {
          driver: d,
          ppm,
          pointsDiff,
          priceDiff,
          // Score: prioritize more points, then better value
          score: pointsDiff * 2 + (ppm * 100)
        };
      });

      // Sort by score descending
      scoredDrivers.sort((a, b) => b.score - a.score);

      // Get best recommendation
      const best = scoredDrivers[0];
      if (!best || best.pointsDiff <= 0) return null; // Only recommend if it's an upgrade

      let reason = '';
      if (best.pointsDiff > 50) {
        reason = `+${best.pointsDiff} more season points`;
      } else if (best.ppm > (fantasyDriver.pointsScored / fantasyDriver.currentPrice)) {
        reason = 'Better value (points per cost)';
      } else {
        reason = `+${best.pointsDiff} pts improvement`;
      }

      return {
        currentDriver: fantasyDriver,
        recommendedDriver: best.driver,
        reason,
        pointsDiff: best.pointsDiff,
        priceDiff: best.priceDiff,
        canAfford: best.driver.price <= availableBudget,
      };
    };
  }, [allDrivers, currentTeam]);

  const handleShowSwap = (driver: FantasyDriver) => {
    const recommendation = getSwapRecommendation(driver);
    if (recommendation) {
      setSelectedSwap(recommendation);
      setShowSwapModal(true);
    } else {
      Alert.alert('No Recommendation', 'No better driver options available within your budget.');
    }
  };

  const handleConfirmSwap = async () => {
    if (!selectedSwap) return;

    setIsSwapping(true);
    try {
      await swapDriver(selectedSwap.currentDriver.driverId, selectedSwap.recommendedDriver.id);
      setShowSwapModal(false);
      setSelectedSwap(null);
      Alert.alert('Success', `Swapped ${selectedSwap.currentDriver.name} for ${selectedSwap.recommendedDriver.name}!`);
    } catch (err) {
      Alert.alert('Error', 'Failed to swap driver');
    } finally {
      setIsSwapping(false);
    }
  };

  // Load user teams on mount and ensure currentTeam is synced
  useEffect(() => {
    if (user) {
      loadUserLeagues(user.id);
      loadUserTeams(user.id);
      // Recalculate points from race results
      recalculateAllTeamsPoints();
    }
  }, [user]);

  // Reload team and league data when screen comes into focus (handles navigation from create/build/join screens)
  useFocusEffect(
    useCallback(() => {
      if (user) {
        // First, directly check the store state and auto-select if needed
        const storeState = useTeamStore.getState();
        if (storeState.userTeams.length > 0 && !storeState.currentTeam) {
          storeState.selectTeam(storeState.userTeams[0].id);
        }
        // Then refresh from store
        loadUserTeams(user.id);
        loadUserLeagues(user.id);
      }
    }, [user])
  );

  // Ensure currentTeam is synced with userTeams (in case of stale data or missing selection)
  useEffect(() => {
    if (userTeams.length > 0) {
      if (!currentTeam) {
        // No current team selected but we have teams - auto-select the first one
        useTeamStore.getState().selectTeam(userTeams[0].id);
      } else {
        // Find the matching team in userTeams to ensure we have latest data
        const teamInList = userTeams.find(t => t.id === currentTeam.id);
        if (teamInList) {
          // Check if the stored currentTeam is stale compared to userTeams
          const driversOutOfSync = teamInList.drivers.length !== currentTeam.drivers.length;
          const constructorOutOfSync = !!teamInList.constructor !== !!currentTeam.constructor;
          const leagueOutOfSync = teamInList.leagueId !== currentTeam.leagueId;

          if (driversOutOfSync || constructorOutOfSync || leagueOutOfSync) {
            // Team data is out of sync, update currentTeam from userTeams
            useTeamStore.getState().selectTeam(currentTeam.id);
          }
        } else {
          // Current team not in userTeams, select first available
          useTeamStore.getState().selectTeam(userTeams[0].id);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTeams]); // Only run when userTeams changes, not on every currentTeam change

  // Update avatar URL when team changes
  useEffect(() => {
    if (currentTeam?.avatarUrl) {
      setTeamAvatarUrl(currentTeam.avatarUrl);
    } else {
      setTeamAvatarUrl(null);
    }
  }, [currentTeam?.id, currentTeam?.avatarUrl]);

  const handleGenerateTeamAvatar = async () => {
    if (!currentTeam) return;
    if (teamAvatarUrl) {
      await regenerateAvatar(currentTeam.name, 'team', currentTeam.id);
    } else {
      await generateAvatar(currentTeam.name, 'team', currentTeam.id);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (user) {
      await loadUserTeams(user.id);
      // Recalculate points from race results
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
    } catch (err) {
      // Error handled by store
    } finally {
      setIsSavingName(false);
    }
  };

  const handleRemoveDriver = (driverId: string, driverName: string) => {
    Alert.alert(
      'Remove Driver',
      `Are you sure you want to remove ${driverName} from your team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeDriver(driverId);
            } catch (err) {
              // Error handled by store
            }
          },
        },
      ]
    );
  };

  const handleRemoveConstructor = () => {
    if (!currentTeam?.constructor) return;

    Alert.alert(
      'Remove Constructor',
      `Are you sure you want to remove ${currentTeam.constructor.name} from your team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeConstructor();
            } catch (err) {
              // Error handled by store
            }
          },
        },
      ]
    );
  };

  const handleSetStarDriver = async (driverId: string) => {
    if (!eligibleStarDrivers.includes(driverId)) {
      Alert.alert('Not Eligible', 'Only bottom 10 drivers by points can be star driver. Try setting your constructor as star instead.');
      return;
    }
    try {
      await setStarDriver(driverId);
    } catch (err) {
      Alert.alert('Error', 'Failed to set star driver');
    }
  };

  const handleSetStarConstructor = async () => {
    try {
      await setStarConstructor();
    } catch (err) {
      Alert.alert('Error', 'Failed to set star constructor');
    }
  };

  // Generate a recommended team that maximizes budget usage
  const generateRecommendedTeam = useCallback(() => {
    if (!allDrivers || allDrivers.length < TEAM_SIZE || !allConstructors || allConstructors.length === 0) {
      return null;
    }

    // Always use full budget since this is only called when team is empty
    const budget = BUDGET;
    let bestTeam: { drivers: Driver[]; constructor: any; totalSpent: number } | null = null;

    // Sort drivers by price descending for greedy selection
    const sortedDrivers = [...allDrivers].sort((a, b) => b.price - a.price);
    // Sort constructors by price ascending to leave more budget for drivers
    const sortedConstructors = [...allConstructors].sort((a, b) => a.price - b.price);

    // Try each constructor starting from cheapest
    for (const constructor of sortedConstructors) {
      let remainingBudget = budget - constructor.price;
      if (remainingBudget < 0) continue;

      const selectedDrivers: Driver[] = [];

      // Greedy: pick cheapest drivers first to ensure we can fit 5
      const cheapestDrivers = [...sortedDrivers].sort((a, b) => a.price - b.price);

      // First pass: ensure we CAN fit 5 drivers
      let testBudget = remainingBudget;
      let canFit = 0;
      for (const driver of cheapestDrivers) {
        if (driver.price <= testBudget) {
          testBudget -= driver.price;
          canFit++;
          if (canFit >= TEAM_SIZE) break;
        }
      }

      if (canFit < TEAM_SIZE) continue; // Can't fit 5 drivers with this constructor

      // Second pass: greedily pick expensive drivers while ensuring we can still fill the team
      const availableDrivers = [...sortedDrivers]; // sorted by price desc

      while (selectedDrivers.length < TEAM_SIZE && availableDrivers.length > 0) {
        const spotsLeft = TEAM_SIZE - selectedDrivers.length;

        // Find the most expensive driver we can afford while still being able to fill remaining spots
        let picked = false;
        for (let i = 0; i < availableDrivers.length; i++) {
          const candidate = availableDrivers[i];
          if (candidate.price > remainingBudget) continue;

          // Check if we can still fill remaining spots after picking this driver
          const budgetAfter = remainingBudget - candidate.price;
          const remainingDrivers = availableDrivers.filter((d, idx) => idx !== i);
          const cheapest = remainingDrivers.sort((a, b) => a.price - b.price).slice(0, spotsLeft - 1);
          const minCostToFill = cheapest.reduce((sum, d) => sum + d.price, 0);

          if (budgetAfter >= minCostToFill) {
            selectedDrivers.push(candidate);
            remainingBudget -= candidate.price;
            availableDrivers.splice(i, 1);
            picked = true;
            break;
          }
        }

        if (!picked) {
          // Fallback: just pick the cheapest affordable driver
          const affordable = availableDrivers.filter(d => d.price <= remainingBudget);
          if (affordable.length === 0) break;
          const cheapest = affordable.sort((a, b) => a.price - b.price)[0];
          selectedDrivers.push(cheapest);
          remainingBudget -= cheapest.price;
          const idx = availableDrivers.indexOf(cheapest);
          if (idx !== -1) availableDrivers.splice(idx, 1);
        }
      }

      if (selectedDrivers.length === TEAM_SIZE) {
        const totalSpent = budget - remainingBudget;
        if (!bestTeam || totalSpent > bestTeam.totalSpent) {
          bestTeam = { drivers: selectedDrivers, constructor, totalSpent };
        }
      }
    }

    return bestTeam;
  }, [allDrivers, allConstructors]);

  const handleBuildRecommendedTeam = async () => {
    // Check if data is still loading
    if (isLoadingDrivers || isLoadingConstructors) {
      Alert.alert('Loading', 'Please wait while driver data loads...');
      return;
    }

    // Check if we have the required data
    if (!allDrivers || allDrivers.length < TEAM_SIZE) {
      Alert.alert('Error', `Not enough drivers available. Need at least ${TEAM_SIZE} drivers.`);
      return;
    }

    if (!allConstructors || allConstructors.length === 0) {
      Alert.alert('Error', 'No constructors available. Please try again later.');
      return;
    }

    const recommended = generateRecommendedTeam();
    if (!recommended) {
      Alert.alert('Error', 'Could not find a valid team within budget. Please try again.');
      return;
    }

    setIsBuildingRecommended(true);
    try {
      // Add all recommended drivers
      for (const driver of recommended.drivers) {
        await addDriver(driver.id, false);
      }

      // Add constructor
      await setConstructor(recommended.constructor.id);

      // Set constructor as star (since we're building fresh)
      await setStarConstructor();

      Alert.alert('Success', 'Your recommended team has been built!');
    } catch (err) {
      Alert.alert('Error', 'Failed to build recommended team. Please try again.');
    } finally {
      setIsBuildingRecommended(false);
    }
  };

  // Wait for hydration before showing empty state
  if (!hasHydrated) {
    return <Loading fullScreen message="Loading..." />;
  }

  // Double-check store state directly to handle potential stale hook values
  const storeState = useTeamStore.getState();
  const actualUserTeams = storeState.userTeams;
  const actualCurrentTeam = storeState.currentTeam;

  // If we have teams but no current team selected, show loading while auto-selection happens
  if ((!currentTeam && userTeams.length > 0) || (!actualCurrentTeam && actualUserTeams.length > 0)) {
    // Trigger auto-selection if not already done
    if (actualUserTeams.length > 0 && !actualCurrentTeam) {
      storeState.selectTeam(actualUserTeams[0].id);
    }
    return <Loading fullScreen message="Loading your team..." />;
  }

  // No team created - prompt to create team (check both hook state and direct state)
  if (!isLoading && !currentTeam && userTeams.length === 0 && actualUserTeams.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.welcomeContainer}>
          <View style={styles.welcomeIconContainer}>
            <Ionicons name="people" size={48} color={COLORS.primary} />
          </View>
          <Text style={styles.welcomeTitle}>Create Your Team</Text>
          <Text style={styles.welcomeMessage}>
            Build your fantasy F1 team with 5 drivers and 1 constructor.
            Play solo or compete in leagues with friends!
          </Text>

          <Button
            title="Create Team"
            onPress={() => router.push('/my-team/create')}
            fullWidth
            style={styles.createButton}
          />

          <Text style={styles.createHint}>
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
      {/* Team Selector */}
      {userTeams.length > 0 && (
        <View style={styles.teamSelectorSection}>
          <Text style={styles.teamSelectorLabel}>Your Teams</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.teamSelectorScroll}
          >
            {userTeams.map((team) => (
              <TouchableOpacity
                key={team.id}
                style={[
                  styles.teamSelectorItem,
                  currentTeam?.id === team.id && styles.teamSelectorItemActive,
                ]}
                onPress={() => selectTeam(team.id)}
              >
                <Avatar
                  name={team.name}
                  size="small"
                  variant="team"
                  imageUrl={team.avatarUrl}
                  useGradient={currentTeam?.id !== team.id}
                />
                <View style={styles.teamSelectorItemContent}>
                  <Text
                    style={[
                      styles.teamSelectorName,
                      currentTeam?.id === team.id && styles.teamSelectorNameActive,
                    ]}
                    numberOfLines={1}
                  >
                    {team.name}
                  </Text>
                  <View style={styles.teamSelectorMeta}>
                    {team.leagueId ? (
                      <Ionicons name="trophy" size={10} color={currentTeam?.id === team.id ? COLORS.white : COLORS.accent} />
                    ) : (
                      <Ionicons name="person" size={10} color={currentTeam?.id === team.id ? COLORS.white : COLORS.gray[400]} />
                    )}
                    <Text
                      style={[
                        styles.teamSelectorPoints,
                        currentTeam?.id === team.id && styles.teamSelectorPointsActive,
                      ]}
                    >
                      {team.totalPoints} pts
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.newTeamButton}
              onPress={() => router.push('/my-team/create')}
            >
              <Ionicons name="add" size={20} color={COLORS.primary} />
              <Text style={styles.newTeamText}>New Team</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Team Header */}
      <Card variant="elevated" style={styles.teamHeader}>
        <View style={styles.teamHeaderTop}>
          <Avatar
            name={currentTeam?.name || 'My Team'}
            size="medium"
            variant="team"
            imageUrl={teamAvatarUrl}
            isGenerating={isGeneratingAvatar}
            showGenerateButton={isAvatarAvailable}
            onGeneratePress={handleGenerateTeamAvatar}
          />
          <View style={styles.teamNameRow}>
            <View style={styles.teamNameContainer}>
              <Text style={styles.teamName}>{currentTeam?.name || 'My Team'}</Text>
              {currentTeam?.lockStatus.canModify && (
                <TouchableOpacity onPress={handleEditName} style={styles.editNameButton}>
                  <Ionicons name="pencil" size={14} color={COLORS.gray[500]} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.teamPoints}>
              {formatPoints(currentTeam?.totalPoints || 0)} points
            </Text>
          </View>
          {currentTeam?.isLocked && (
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={14} color={COLORS.white} />
              <Text style={styles.lockText}>Locked</Text>
            </View>
          )}
        </View>

        {/* League Info or Join League */}
        {currentTeam?.leagueId ? (
          <TouchableOpacity
            style={styles.leagueInfoRow}
            onPress={() => router.push(`/leagues/${currentTeam.leagueId}`)}
          >
            <View style={styles.leagueInfoLeft}>
              <Ionicons name="trophy" size={14} color={COLORS.accent} />
              <Text style={styles.leagueInfoText}>
                {leagues.find(l => l.id === currentTeam.leagueId)?.name || 'League'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={COLORS.gray[400]} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.joinLeagueRow}
            onPress={() => router.push('/leagues?join=true')}
          >
            <View style={styles.leagueInfoLeft}>
              <Ionicons name="trophy-outline" size={14} color={COLORS.primary} />
              <Text style={styles.joinLeagueText}>Join a League</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={COLORS.gray[400]} />
          </TouchableOpacity>
        )}
      </Card>

      {/* Budget Widget */}
      <BudgetBar
        remaining={currentTeam?.budget || BUDGET}
        total={BUDGET}
      />

      {/* Team Composition Status */}
      <View style={styles.compositionStatus}>
        <View style={styles.compositionItem}>
          <Text style={styles.compositionLabel}>Drivers</Text>
          <Text style={[
            styles.compositionValue,
            driversCount === TEAM_SIZE && styles.compositionComplete,
          ]}>
            {driversCount}/{TEAM_SIZE}
          </Text>
        </View>
        <View style={styles.compositionItem}>
          <Text style={styles.compositionLabel}>Constructor</Text>
          <Text style={[
            styles.compositionValue,
            hasConstructor && styles.compositionComplete,
          ]}>
            {hasConstructor ? '1/1' : '0/1'}
          </Text>
        </View>
      </View>

      {/* Drivers Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Drivers</Text>
          {driversCount < TEAM_SIZE && currentTeam?.lockStatus.canModify && (
            <TouchableOpacity
              onPress={() => router.push('/my-team/select-driver')}
              style={styles.addButton}
            >
              <Ionicons name="add" size={20} color={COLORS.primary} />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {currentTeam?.drivers && currentTeam.drivers.length > 0 ? (
          currentTeam.drivers.map((driver) => (
            <Card
              key={driver.driverId}
              variant="outlined"
              padding="medium"
              style={styles.driverItem}
            >
              <View style={styles.driverInfo}>
                <View style={styles.driverMain}>
                  <Text style={styles.driverName}>{driver.name}</Text>
                  <Text style={styles.driverTeam}>{driver.shortName}</Text>
                </View>
                <View style={styles.driverActions}>
                  <View style={styles.driverStats}>
                    <Text style={styles.driverPoints}>
                      {formatPoints(driver.pointsScored)} pts
                    </Text>
                    <Text style={styles.driverPrice}>
                      {formatPoints(driver.currentPrice)}
                    </Text>
                  </View>
                  {currentTeam?.lockStatus.canModify && (
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleRemoveDriver(driver.driverId, driver.name)}
                    >
                      <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              {/* Star Driver Selection */}
              {eligibleStarDrivers.includes(driver.driverId) && (
                <View style={styles.driverActionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.starButton,
                      driver.isStarDriver && styles.starButtonActive,
                    ]}
                    onPress={() => handleSetStarDriver(driver.driverId)}
                    disabled={!currentTeam?.lockStatus.canModify || driver.isStarDriver}
                  >
                    <Ionicons
                      name={driver.isStarDriver ? 'star' : 'star-outline'}
                      size={16}
                      color={driver.isStarDriver ? COLORS.white : COLORS.gold}
                    />
                    <Text style={[
                      styles.starButtonText,
                      driver.isStarDriver && styles.starButtonTextActive,
                    ]}>
                      {driver.isStarDriver ? 'Star (+50%)' : 'Set as Star'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* Swap Recommendation */}
              {currentTeam?.lockStatus.canModify && (() => {
                const swap = getSwapRecommendation(driver);
                if (!swap) return null;
                return (
                  <TouchableOpacity
                    style={styles.swapRecommendationRow}
                    onPress={() => handleShowSwap(driver)}
                  >
                    <View style={styles.swapRecommendationContent}>
                      <View style={styles.swapRecommendationHeader}>
                        <Ionicons name="swap-horizontal" size={14} color={COLORS.primary} />
                        <Text style={styles.swapRecommendationLabel}>Alternate: </Text>
                        <Text style={styles.swapRecommendationDriver}>{swap.recommendedDriver.name}</Text>
                      </View>
                      <View style={styles.swapRecommendationDetails}>
                        <Text style={styles.swapBenefit}>+{swap.pointsDiff} pts</Text>
                        <Text style={styles.swapCost}>
                          {swap.priceDiff > 0 ? `+${swap.priceDiff}` : swap.priceDiff} cost
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.gray[400]} />
                  </TouchableOpacity>
                );
              })()}
              {driver.racesHeld > 0 && (
                <Text style={styles.lockBonus}>
                  Lock bonus: {driver.racesHeld} race(s)
                </Text>
              )}
            </Card>
          ))
        ) : (
          <Card variant="outlined" padding="large">
            <Text style={styles.emptyText}>
              No drivers selected. Add drivers to your team.
            </Text>
          </Card>
        )}
      </View>

      {/* Constructor Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Constructor</Text>
          {!hasConstructor && currentTeam?.lockStatus.canModify && (
            <TouchableOpacity
              onPress={() => router.push('/my-team/select-constructor')}
              style={styles.addButton}
            >
              <Ionicons name="add" size={20} color={COLORS.primary} />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {currentTeam?.constructor ? (
          <Card variant="outlined" padding="medium" style={styles.constructorItem}>
            <View style={styles.constructorInfo}>
              <Text style={styles.constructorName}>
                {currentTeam.constructor.name}
              </Text>
              <View style={styles.constructorActions}>
                <View style={styles.constructorStats}>
                  <Text style={styles.constructorPoints}>
                    {formatPoints(currentTeam.constructor.pointsScored)} pts
                  </Text>
                  <Text style={styles.constructorPrice}>
                    {formatPoints(currentTeam.constructor.currentPrice)}
                  </Text>
                </View>
                {currentTeam?.lockStatus.canModify && (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={handleRemoveConstructor}
                  >
                    <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {/* Star Constructor Selection */}
            <View style={styles.driverActionsRow}>
              <TouchableOpacity
                style={[
                  styles.starButton,
                  currentTeam.constructor.isStarDriver && styles.starButtonActive,
                ]}
                onPress={handleSetStarConstructor}
                disabled={!currentTeam?.lockStatus.canModify || currentTeam.constructor.isStarDriver}
              >
                <Ionicons
                  name={currentTeam.constructor.isStarDriver ? 'star' : 'star-outline'}
                  size={16}
                  color={currentTeam.constructor.isStarDriver ? COLORS.white : COLORS.gold}
                />
                <Text style={[
                  styles.starButtonText,
                  currentTeam.constructor.isStarDriver && styles.starButtonTextActive,
                ]}>
                  {currentTeam.constructor.isStarDriver ? 'Star (+50%)' : 'Set as Star'}
                </Text>
              </TouchableOpacity>
            </View>
            {currentTeam.constructor.racesHeld > 0 && (
              <Text style={styles.lockBonus}>
                Lock bonus: {currentTeam.constructor.racesHeld} race(s)
              </Text>
            )}
          </Card>
        ) : (
          <Card variant="outlined" padding="large">
            <Text style={styles.emptyText}>
              No constructor selected. Add a constructor to your team.
            </Text>
          </Card>
        )}
      </View>

        {/* Actions */}
        {currentTeam?.lockStatus.canModify && (
          <View style={styles.actions}>
            <View style={styles.actionButtons}>
              <Button
                title="Edit Team"
                onPress={() => router.push('/my-team/edit')}
                variant="outline"
                style={styles.actionButton}
              />
              {!currentTeam?.leagueId && (
                <Button
                  title="Join League"
                  onPress={() => router.push('/leagues?join=true')}
                  style={styles.actionButton}
                />
              )}
            </View>
            {/* Build Recommended Team - only show when no drivers or constructor selected */}
            {driversCount === 0 && !hasConstructor && (
              <Button
                title={isLoadingDrivers || isLoadingConstructors ? "Loading Data..." : "Build Recommended Team"}
                onPress={handleBuildRecommendedTeam}
                loading={isBuildingRecommended}
                disabled={isLoadingDrivers || isLoadingConstructors}
                style={styles.recommendedButton}
                fullWidth
              />
            )}
          </View>
        )}

      </ScrollView>

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
                  (!editingName.trim() || isSavingName) && styles.modalSaveButtonDisabled,
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

      {/* Swap Recommendation Modal */}
      <Modal
        visible={showSwapModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSwapModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.swapModalContent}>
            <View style={styles.swapModalHeader}>
              <Ionicons name="swap-horizontal" size={24} color={COLORS.primary} />
              <Text style={styles.swapModalTitle}>Swap Recommendation</Text>
            </View>

            {selectedSwap && (
              <>
                {/* Current Driver */}
                <View style={styles.swapDriverCard}>
                  <Text style={styles.swapDriverLabel}>Current</Text>
                  <View style={styles.swapDriverInfo}>
                    <Text style={styles.swapDriverName}>{selectedSwap.currentDriver.name}</Text>
                    <View style={styles.swapDriverStats}>
                      <Text style={styles.swapDriverPoints}>{selectedSwap.currentDriver.pointsScored} pts</Text>
                      <Text style={styles.swapDriverPrice}>{formatPoints(selectedSwap.currentDriver.currentPrice)}</Text>
                    </View>
                  </View>
                </View>

                {/* Arrow */}
                <View style={styles.swapArrow}>
                  <Ionicons name="arrow-down" size={24} color={COLORS.primary} />
                </View>

                {/* Recommended Driver */}
                <View style={[styles.swapDriverCard, styles.swapDriverCardRecommended]}>
                  <Text style={styles.swapDriverLabelRecommended}>Recommended</Text>
                  <View style={styles.swapDriverInfo}>
                    <Text style={styles.swapDriverName}>{selectedSwap.recommendedDriver.name}</Text>
                    <View style={styles.swapDriverStats}>
                      <Text style={styles.swapDriverPointsGreen}>{selectedSwap.recommendedDriver.seasonPoints} pts</Text>
                      <Text style={styles.swapDriverPrice}>{formatPoints(selectedSwap.recommendedDriver.price)}</Text>
                    </View>
                  </View>
                  <Text style={styles.swapReason}>{selectedSwap.reason}</Text>
                </View>

                {/* Summary */}
                <View style={styles.swapSummary}>
                  <View style={styles.swapSummaryRow}>
                    <Text style={styles.swapSummaryLabel}>Points Improvement</Text>
                    <Text style={[styles.swapSummaryValue, { color: COLORS.success }]}>
                      +{selectedSwap.pointsDiff}
                    </Text>
                  </View>
                  <View style={styles.swapSummaryRow}>
                    <Text style={styles.swapSummaryLabel}>Price Difference</Text>
                    <Text style={[
                      styles.swapSummaryValue,
                      { color: selectedSwap.priceDiff > 0 ? COLORS.error : COLORS.success }
                    ]}>
                      {selectedSwap.priceDiff > 0 ? '+' : ''}{selectedSwap.priceDiff}
                    </Text>
                  </View>
                </View>

                {/* Buttons */}
                <View style={styles.swapModalButtons}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={() => setShowSwapModal(false)}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.swapConfirmButton,
                      isSwapping && styles.modalSaveButtonDisabled,
                    ]}
                    onPress={handleConfirmSwap}
                    disabled={isSwapping}
                  >
                    <Ionicons name="swap-horizontal" size={18} color={COLORS.white} />
                    <Text style={styles.swapConfirmText}>
                      {isSwapping ? 'Swapping...' : 'Confirm Swap'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray[50],
  },

  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },

  emptyContainer: {
    flex: 1,
    backgroundColor: COLORS.gray[50],
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
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },

  welcomeTitle: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.gray[900],
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },

  welcomeMessage: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[600],
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },

  createButton: {
    marginBottom: SPACING.md,
  },

  createHint: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
    textAlign: 'center',
  },

  optionCard: {
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },

  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },

  optionBadge: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: SPACING.xs,
  },

  optionBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.white,
  },

  optionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.gray[900],
    marginBottom: SPACING.xs,
  },

  optionDescription: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[600],
    marginBottom: SPACING.md,
    lineHeight: 20,
  },

  optionButton: {
    marginTop: SPACING.xs,
  },

  currentLeagueHint: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
    textAlign: 'center',
    marginTop: SPACING.md,
  },

  teamSelectorSection: {
    marginBottom: SPACING.md,
  },

  teamSelectorLabel: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.gray[600],
    marginBottom: SPACING.sm,
  },

  teamSelectorScroll: {
    gap: SPACING.sm,
    paddingRight: SPACING.md,
  },

  teamSelectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    minWidth: 120,
  },

  teamSelectorItemActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  teamSelectorItemContent: {
    gap: 2,
  },

  teamSelectorName: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.gray[900],
  },

  teamSelectorNameActive: {
    color: COLORS.white,
  },

  teamSelectorMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  teamSelectorPoints: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[500],
  },

  teamSelectorPointsActive: {
    color: COLORS.white,
    opacity: 0.8,
  },

  newTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary + '10',
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    borderStyle: 'dashed',
  },

  newTeamText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    color: COLORS.primary,
  },

  teamHeader: {
    marginBottom: SPACING.sm,
  },

  teamHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  teamNameRow: {
    flex: 1,
  },

  teamNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  teamName: {
    fontSize: FONTS.sizes.lg,
    fontWeight: 'bold',
    color: COLORS.gray[900],
  },

  editNameButton: {
    padding: 2,
  },

  teamPoints: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[600],
    marginTop: 2,
  },

  leagueInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[100],
  },

  leagueInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  leagueInfoText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
    color: COLORS.accent,
  },

  joinLeagueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[100],
  },

  joinLeagueText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
    color: COLORS.primary,
  },

  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.error,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: SPACING.xs,
    gap: 2,
  },

  lockText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.white,
  },

  compositionStatus: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },

  compositionItem: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },

  compositionLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
  },

  compositionValue: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.gray[900],
    marginTop: SPACING.xs,
  },

  compositionComplete: {
    color: COLORS.success,
  },

  section: {
    marginBottom: SPACING.lg,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.gray[900],
  },

  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  addButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },

  driverItem: {
    marginBottom: SPACING.sm,
  },

  driverInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  driverMain: {},

  driverName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[900],
  },

  driverTeam: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
  },

  driverActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },

  driverStats: {
    alignItems: 'flex-end',
  },

  deleteButton: {
    padding: SPACING.xs,
  },

  driverPoints: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[900],
  },

  driverPrice: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
  },

  driverActionsRow: {
    flexDirection: 'row',
    marginTop: SPACING.sm,
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },

  starButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.gold,
    gap: SPACING.xs,
  },

  starButtonActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },

  starButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    color: COLORS.gold,
  },

  starButtonTextActive: {
    color: COLORS.white,
  },

  starDriverBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: SPACING.xs,
    marginTop: SPACING.sm,
  },

  starDriverText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.white,
  },

  lockBonus: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.accent,
    marginTop: SPACING.sm,
  },

  constructorItem: {},

  constructorInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  constructorName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[900],
  },

  constructorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },

  constructorStats: {
    alignItems: 'flex-end',
  },

  constructorPoints: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[900],
  },

  constructorPrice: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
  },

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[500],
    textAlign: 'center',
  },

  actions: {
    marginTop: SPACING.md,
  },

  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },

  actionButton: {
    flex: 1,
  },

  recommendedButton: {
    marginTop: SPACING.md,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },

  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
  },

  modalTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.gray[900],
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },

  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.gray[300],
    borderRadius: 8,
    padding: SPACING.md,
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[900],
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
  },

  modalCancelText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[600],
    fontWeight: '500',
  },

  modalSaveButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },

  modalSaveButtonDisabled: {
    opacity: 0.5,
  },

  modalSaveText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.white,
    fontWeight: '600',
  },

  // Swap Recommendation Inline Styles
  swapRecommendationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[100],
  },

  swapRecommendationContent: {
    flex: 1,
  },

  swapRecommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
  },

  swapRecommendationLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[600],
    marginLeft: SPACING.xs,
  },

  swapRecommendationDriver: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },

  swapRecommendationDetails: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: 2,
    marginLeft: 18,
  },

  swapBenefit: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.success,
  },

  swapCost: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[500],
  },

  // Swap Modal Styles
  swapModalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
  },

  swapModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },

  swapModalTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.gray[900],
  },

  swapDriverCard: {
    backgroundColor: COLORS.gray[50],
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },

  swapDriverCardRecommended: {
    backgroundColor: COLORS.success + '10',
    borderColor: COLORS.success,
  },

  swapDriverLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.gray[500],
    marginBottom: SPACING.xs,
  },

  swapDriverLabelRecommended: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.success,
    marginBottom: SPACING.xs,
  },

  swapDriverInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  swapDriverName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[900],
  },

  swapDriverStats: {
    alignItems: 'flex-end',
  },

  swapDriverPoints: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.gray[700],
  },

  swapDriverPointsGreen: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.success,
  },

  swapDriverPrice: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[500],
  },

  swapReason: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.success,
    fontWeight: '500',
    marginTop: SPACING.sm,
  },

  swapArrow: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },

  swapSummary: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[200],
  },

  swapSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },

  swapSummaryLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[600],
  },

  swapSummaryValue: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
  },

  swapModalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },

  swapConfirmButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },

  swapConfirmText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.white,
    fontWeight: '600',
  },
});
