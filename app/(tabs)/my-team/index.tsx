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
import { useAdminStore } from '../../../src/store/admin.store';
import { useDrivers, useConstructors, useAvatarGeneration } from '../../../src/hooks';
import { saveAvatarUrl } from '../../../src/services/avatarGeneration.service';
import {
  Card,
  Loading,
  EmptyState,
  BudgetBar,
  DriverCard,
  ConstructorCard,
  Button,
  Avatar,
  AvatarPicker,
} from '../../../src/components';
import { COLORS, SPACING, FONTS, BUDGET, TEAM_SIZE, BORDER_RADIUS, SALE_COMMISSION_RATE } from '../../../src/config/constants';
import { PRICING_CONFIG } from '../../../src/config/pricing.config';
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
  const { currentTeam, userTeams, isLoading, error, hasHydrated, loadUserTeams, updateTeamName, removeDriver, removeConstructor, setCaptain, clearCaptain, selectTeam, recalculateAllTeamsPoints, swapDriver, addDriver, setConstructor, setCurrentTeam } = useTeamStore();
  const { leagues, loadUserLeagues } = useLeagueStore();
  const { raceResults } = useAdminStore();
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
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

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
        const ppm = (d.currentSeasonPoints || 0) / d.price; // Points per million
        const pointsDiff = (d.currentSeasonPoints || 0) - fantasyDriver.pointsScored;
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

  // Load user teams on mount
  useEffect(() => {
    if (user) {
      loadUserLeagues(user.id);
      loadUserTeams(user.id);
      recalculateAllTeamsPoints();
    }
  }, [user]);

  // Reload data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadUserTeams(user.id);
        loadUserLeagues(user.id);
      }
    }, [user])
  );

  // Auto-select team when userTeams changes and no team is selected
  useEffect(() => {
    if (userTeams.length > 0 && !currentTeam) {
      selectTeam(userTeams[0].id);
    }
  }, [userTeams.length, currentTeam, selectTeam]);

  // Calculate team stats (must be before any conditional returns)
  const teamStats = useMemo(() => {
    // Get last completed race points
    const completedRaces = Object.entries(raceResults)
      .filter(([_, result]) => result.isComplete)
      .sort((a, b) => b[0].localeCompare(a[0]));

    let lastRacePoints = 0;
    if (completedRaces.length > 0 && currentTeam) {
      const [_, lastResult] = completedRaces[0];
      currentTeam.drivers.forEach(driver => {
        const driverResult = lastResult.driverResults.find(dr => dr.driverId === driver.driverId);
        if (driverResult) {
          // V3: Captain gets 2x points
          const multiplier = currentTeam.captainDriverId === driver.driverId ? 2 : 1;
          lastRacePoints += Math.floor(driverResult.points * multiplier);
        }
      });
      if (currentTeam.constructor) {
        const constructorResult = lastResult.constructorResults.find(
          cr => cr.constructorId === currentTeam.constructor?.constructorId
        );
        if (constructorResult) {
          // V3: Constructor doesn't get captain bonus
          lastRacePoints += constructorResult.points;
        }
      }
    }

    let leagueRank: number | null = null;
    let leagueSize = 0;
    if (currentTeam?.leagueId) {
      const leagueTeams = userTeams.filter(t => t.leagueId === currentTeam.leagueId);
      leagueSize = leagueTeams.length;
      const sorted = [...leagueTeams].sort((a, b) => b.totalPoints - a.totalPoints);
      const rankIndex = sorted.findIndex(t => t.id === currentTeam.id);
      if (rankIndex !== -1) {
        leagueRank = rankIndex + 1;
      }
    }

    return {
      lastRacePoints,
      totalPoints: currentTeam?.totalPoints || 0,
      leagueRank,
      leagueSize,
      hasCompletedRaces: completedRaces.length > 0,
    };
  }, [raceResults, currentTeam, userTeams]);

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

  const handleSelectTeamAvatar = async (url: string) => {
    if (!currentTeam) return;
    const result = await saveAvatarUrl('team', currentTeam.id, url);
    if (result.success && result.imageUrl) {
      setTeamAvatarUrl(result.imageUrl);
    }
  };

  const handleOpenAvatarPicker = () => {
    if (currentTeam?.lockStatus.canModify) {
      setShowAvatarPicker(true);
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

  // V3: Set ace driver (any driver can be ace, gets 2x points)
  const handleSetCaptain = async (driverId: string) => {
    try {
      await setCaptain(driverId);
    } catch (err) {
      Alert.alert('Error', 'Failed to set Ace');
    }
  };

  const handleClearCaptain = async () => {
    try {
      await clearCaptain();
    } catch (err) {
      Alert.alert('Error', 'Failed to clear Ace');
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

    // Verify the recommended team is valid
    const totalDriverCost = recommended.drivers.reduce((sum, d) => sum + d.price, 0);
    const totalCost = totalDriverCost + recommended.constructor.price;
    console.log('Recommended team:', {
      drivers: recommended.drivers.map(d => `${d.name}: $${d.price}`),
      constructor: `${recommended.constructor.name}: $${recommended.constructor.price}`,
      totalCost,
      budget: BUDGET,
    });

    if (totalCost > BUDGET) {
      Alert.alert('Error', `Recommended team costs $${totalCost} but budget is $${BUDGET}. Please try again.`);
      return;
    }

    setIsBuildingRecommended(true);
    try {
      // Build the team directly by updating team state atomically
      // This avoids issues with sequential budget validation
      if (!currentTeam) {
        Alert.alert('Error', 'No team found. Please create a team first.');
        return;
      }

      // Create fantasy driver objects with correct prices from allDrivers
      const fantasyDrivers = recommended.drivers.map(driver => ({
        driverId: driver.id,
        name: driver.name,
        shortName: driver.shortName,
        constructorId: driver.constructorId,
        purchasePrice: driver.price,
        currentPrice: driver.price,
        pointsScored: 0,
        racesHeld: 0,
      }));

      const fantasyConstructor = {
        constructorId: recommended.constructor.id,
        name: recommended.constructor.name,
        purchasePrice: recommended.constructor.price,
        currentPrice: recommended.constructor.price,
        pointsScored: 0,
        racesHeld: 0,
      };

      // Update team atomically
      const updatedTeam = {
        ...currentTeam,
        drivers: fantasyDrivers,
        constructor: fantasyConstructor,
        totalSpent: totalCost,
        budget: BUDGET - totalCost,
        racesSinceTransfer: 0,
        updatedAt: new Date(),
      };

      // Update the team store directly
      setCurrentTeam(updatedTeam);

      // V3: Don't auto-set ace - user chooses each race weekend
      Alert.alert('Success', `Your recommended team has been built! ($${totalCost} spent, $${BUDGET - totalCost} remaining)\n\nSelect an Ace before qualifying.`);
    } catch (err) {
      console.error('Build recommended team error:', err);
      Alert.alert('Error', 'Failed to build recommended team. Please try again.');
    } finally {
      setIsBuildingRecommended(false);
    }
  };

  // Wait for hydration before showing empty state
  if (!hasHydrated) {
    return <Loading fullScreen message="Loading..." />;
  }

  // If we have teams but no current team selected, show loading while auto-selection happens
  if (!currentTeam && userTeams.length > 0) {
    return <Loading fullScreen message="Loading your team..." />;
  }

  // No team created - prompt to create team
  if (!isLoading && !currentTeam && userTeams.length === 0) {
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

  // Check if team has a valid league (league exists in user's leagues)
  const teamLeague = currentTeam?.leagueId
    ? leagues.find(l => l.id === currentTeam.leagueId)
    : null;

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
            editable={currentTeam?.lockStatus.canModify}
            onPress={handleOpenAvatarPicker}
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
        {teamLeague ? (
          <TouchableOpacity
            style={styles.leagueInfoRow}
            onPress={() => router.push(`/leagues/${teamLeague.id}`)}
          >
            <View style={styles.leagueInfoLeft}>
              <Ionicons name="trophy" size={14} color={COLORS.accent} />
              <Text style={styles.leagueInfoText}>{teamLeague.name}</Text>
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

      {/* Team Stats */}
      <View style={styles.statsCard}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {teamStats.hasCompletedRaces ? teamStats.lastRacePoints : '-'}
            </Text>
            <Text style={styles.statLabel}>Last Race</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{teamStats.totalPoints}</Text>
            <Text style={styles.statLabel}>Total Points</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {teamStats.leagueRank !== null
                ? `${teamStats.leagueRank}/${teamStats.leagueSize}`
                : '-'}
            </Text>
            <Text style={styles.statLabel}>League Rank</Text>
          </View>
        </View>
      </View>

      {/* V3: Ace Reminder Note */}
      {currentTeam &&
       !currentTeam.captainDriverId &&
       driversCount > 0 && (
        <View style={styles.starReminderNote}>
          <Ionicons name="diamond-outline" size={16} color={COLORS.primary} />
          <Text style={styles.starReminderText}>
            Select an Ace (drivers under ${PRICING_CONFIG.CAPTAIN_MAX_PRICE} only) to earn 2x points this race weekend!
          </Text>
        </View>
      )}

      {/* Team Composition Status */}
      <View style={styles.compositionStatus}>
        <Text style={styles.compositionText}>
          <Text style={driversCount === TEAM_SIZE ? styles.compositionComplete : styles.compositionIncomplete}>
            {driversCount}/{TEAM_SIZE}
          </Text>
          <Text style={styles.compositionLabel}> Drivers</Text>
          <Text style={styles.compositionDivider}>  •  </Text>
          <Text style={hasConstructor ? styles.compositionComplete : styles.compositionIncomplete}>
            {hasConstructor ? '1/1' : '0/1'}
          </Text>
          <Text style={styles.compositionLabel}> Constructor</Text>
        </Text>
      </View>

      {/* Drivers Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Drivers</Text>
        </View>
        {driversCount < TEAM_SIZE && currentTeam?.lockStatus.canModify && (
          <TouchableOpacity
            onPress={() => router.push('/my-team/select-driver')}
            style={styles.addLargeButton}
          >
            <Ionicons name="add-circle" size={28} color={COLORS.primary} />
            <Text style={styles.addLargeButtonText}>Add Driver</Text>
            <Text style={styles.addLargeButtonSubtext}>{driversCount}/{TEAM_SIZE} selected</Text>
          </TouchableOpacity>
        )}

        {currentTeam?.drivers && currentTeam.drivers.length > 0 ? (
          [...currentTeam.drivers].sort((a, b) => b.pointsScored - a.pointsScored).map((driver) => (
            <Card
              key={driver.driverId}
              variant="outlined"
              padding="small"
              style={styles.driverItem}
            >
              <View style={styles.driverInfo}>
                <View style={styles.driverMain}>
                  <View style={styles.driverNameRow}>
                    <Text style={styles.driverNumber}>
                      #{allDrivers?.find(d => d.id === driver.driverId)?.number || ''}
                    </Text>
                    <Text style={styles.driverName}>{driver.name}</Text>
                  </View>
                  <View style={styles.driverCodeRow}>
                    <Text style={styles.driverTeam}>{driver.shortName}</Text>
                    {/* V3: Ace icon inline with driver code */}
                    {/* V3 Rule: Only drivers with price <= CAPTAIN_MAX_PRICE can be ace */}
                    {currentTeam?.captainDriverId === driver.driverId && (
                      <View style={styles.captainBadgeInline}>
                        <Ionicons name="diamond" size={12} color={COLORS.white} />
                      </View>
                    )}
                    {currentTeam?.captainDriverId !== driver.driverId &&
                     currentTeam?.lockStatus.canModify &&
                     driver.currentPrice <= PRICING_CONFIG.CAPTAIN_MAX_PRICE && (
                      <TouchableOpacity
                        style={styles.captainIconButton}
                        onPress={() => handleSetCaptain(driver.driverId)}
                      >
                        <Ionicons name="diamond-outline" size={16} color={COLORS.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={styles.driverActions}>
                  <View style={styles.driverStats}>
                    <Text style={styles.driverPoints}>
                      {formatPoints(driver.pointsScored)} pts
                    </Text>
                    {/* Purchase price and current value with profit/loss */}
                    <View style={styles.priceComparison}>
                      <Text style={styles.purchasePrice}>
                        Paid: ${driver.purchasePrice}
                      </Text>
                      <View style={styles.currentValueRow}>
                        <Text style={[
                          styles.currentValueLabel,
                          driver.currentPrice > driver.purchasePrice && styles.priceUp,
                          driver.currentPrice < driver.purchasePrice && styles.priceDown,
                        ]}>Now: </Text>
                        <Text style={[
                          styles.currentValue,
                          driver.currentPrice > driver.purchasePrice && styles.priceUp,
                          driver.currentPrice < driver.purchasePrice && styles.priceDown,
                        ]}>
                          ${driver.currentPrice}
                        </Text>
                        {driver.currentPrice !== driver.purchasePrice && (
                          <View style={[
                            styles.profitBadge,
                            driver.currentPrice > driver.purchasePrice ? styles.profitUp : styles.profitDown,
                          ]}>
                            <Ionicons
                              name={driver.currentPrice > driver.purchasePrice ? 'arrow-up' : 'arrow-down'}
                              size={10}
                              color={COLORS.white}
                            />
                            <Text style={styles.profitText}>
                              {Math.abs(driver.currentPrice - driver.purchasePrice)}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                  {currentTeam?.lockStatus.canModify && (
                    <TouchableOpacity
                      style={styles.sellButton}
                      onPress={() => handleRemoveDriver(driver.driverId, driver.name)}
                    >
                      <Ionicons name="cash-outline" size={22} color={COLORS.error} />
                      <Text style={styles.sellButtonText}>Sell</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              {/* Alternative Recommendation - always show for all drivers */}
              {currentTeam?.lockStatus.canModify && (() => {
                const swap = getSwapRecommendation(driver);
                if (!swap) {
                  // Show "No better alternative" when none available
                  return (
                    <View style={styles.alternativeRowCompact}>
                      <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
                      <Text style={styles.alternativeCompactTextMuted}>
                        Alternative: None better available
                      </Text>
                    </View>
                  );
                }
                return (
                  <TouchableOpacity
                    style={styles.alternativeRowCompact}
                    onPress={() => handleShowSwap(driver)}
                  >
                    <Ionicons name="swap-horizontal" size={12} color={COLORS.primary} />
                    <Text style={styles.alternativeCompactText}>
                      Alternative: {swap.recommendedDriver.shortName || swap.recommendedDriver.name.split(' ').pop()} (+{swap.pointsDiff} pts)
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={COLORS.gray[400]} />
                  </TouchableOpacity>
                );
              })()}
              {driver.racesHeld > 0 && (
                <Text style={styles.lockBonusCompact}>
                  +{driver.racesHeld} race lock
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
        </View>
        {!hasConstructor && currentTeam?.lockStatus.canModify && (
          <TouchableOpacity
            onPress={() => router.push('/my-team/select-constructor')}
            style={styles.addLargeButton}
          >
            <Ionicons name="add-circle" size={28} color={COLORS.primary} />
            <Text style={styles.addLargeButtonText}>Add Constructor</Text>
            <Text style={styles.addLargeButtonSubtext}>0/1 selected</Text>
          </TouchableOpacity>
        )}

        {currentTeam?.constructor ? (
          <Card variant="outlined" padding="small" style={styles.constructorItem}>
            <View style={styles.constructorInfo}>
              <View style={styles.constructorMain}>
                <Text style={styles.constructorName}>
                  {currentTeam.constructor.name}
                </Text>
                {/* V3: Constructors don't have captain option - only drivers */}
              </View>
              <View style={styles.constructorActions}>
                <View style={styles.constructorStats}>
                  <Text style={styles.constructorPoints}>
                    {formatPoints(currentTeam.constructor.pointsScored)} pts
                  </Text>
                  {/* Purchase price and current value with profit/loss */}
                  <View style={styles.priceComparison}>
                    <Text style={styles.purchasePrice}>
                      Paid: ${currentTeam.constructor.purchasePrice}
                    </Text>
                    <View style={styles.currentValueRow}>
                      <Text style={[
                        styles.currentValueLabel,
                        currentTeam.constructor.currentPrice > currentTeam.constructor.purchasePrice && styles.priceUp,
                        currentTeam.constructor.currentPrice < currentTeam.constructor.purchasePrice && styles.priceDown,
                      ]}>Now: </Text>
                      <Text style={[
                        styles.currentValue,
                        currentTeam.constructor.currentPrice > currentTeam.constructor.purchasePrice && styles.priceUp,
                        currentTeam.constructor.currentPrice < currentTeam.constructor.purchasePrice && styles.priceDown,
                      ]}>
                        ${currentTeam.constructor.currentPrice}
                      </Text>
                      {currentTeam.constructor.currentPrice !== currentTeam.constructor.purchasePrice && (
                        <View style={[
                          styles.profitBadge,
                          currentTeam.constructor.currentPrice > currentTeam.constructor.purchasePrice ? styles.profitUp : styles.profitDown,
                        ]}>
                          <Ionicons
                            name={currentTeam.constructor.currentPrice > currentTeam.constructor.purchasePrice ? 'arrow-up' : 'arrow-down'}
                            size={10}
                            color={COLORS.white}
                          />
                          <Text style={styles.profitText}>
                            {Math.abs(currentTeam.constructor.currentPrice - currentTeam.constructor.purchasePrice)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                {currentTeam?.lockStatus.canModify && (
                  <TouchableOpacity
                    style={styles.sellButton}
                    onPress={handleRemoveConstructor}
                  >
                    <Ionicons name="cash-outline" size={22} color={COLORS.error} />
                    <Text style={styles.sellButtonText}>Sell</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {currentTeam.constructor.racesHeld > 0 && (
              <Text style={styles.lockBonusCompact}>
                +{currentTeam.constructor.racesHeld} race lock
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
                      <Text style={styles.swapDriverPointsGreen}>{selectedSwap.recommendedDriver.currentSeasonPoints || 0} pts</Text>
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
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    padding: SPACING.sm,
    paddingBottom: SPACING.lg,
  },

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
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },

  createButton: {
    marginBottom: SPACING.md,
  },

  createHint: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
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
    color: COLORS.text.inverse,
  },

  optionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.xs,
  },

  optionDescription: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },

  optionButton: {
    marginTop: SPACING.xs,
  },

  currentLeagueHint: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginTop: SPACING.md,
  },

  teamSelectorSection: {
    marginBottom: SPACING.md,
  },

  teamSelectorLabel: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.secondary,
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
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border.default,
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
    color: COLORS.text.primary,
  },

  teamSelectorNameActive: {
    color: COLORS.text.inverse,
  },

  teamSelectorMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  teamSelectorPoints: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
  },

  teamSelectorPointsActive: {
    color: COLORS.text.inverse,
    opacity: 0.8,
  },

  newTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.glass.cyan,
    borderWidth: 1,
    borderColor: COLORS.border.accent,
    borderStyle: 'dashed',
  },

  newTeamText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    color: COLORS.primary,
  },

  teamHeader: {
    marginBottom: SPACING.xs,
    padding: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  teamHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  teamNameRow: {
    flex: 1,
  },

  teamNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },

  teamName: {
    fontSize: FONTS.sizes.lg,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  editNameButton: {
    padding: 2,
  },

  teamPoints: {
    fontSize: 10,
    color: COLORS.text.secondary,
    marginTop: 1,
  },

  leagueInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
  },

  leagueInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  leagueInfoText: {
    fontSize: FONTS.sizes.md,
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
    borderTopColor: COLORS.border.default,
  },

  joinLeagueText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
    color: COLORS.primary,
  },

  statsCard: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },

  statItem: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '700',
    color: COLORS.text.primary,
  },

  statLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border.default,
  },

  starReminderNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },

  starReminderText: {
    flex: 1,
    fontSize: FONTS.sizes.xs,
    color: COLORS.gold,
    fontWeight: '500',
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
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },

  compositionText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
  },

  compositionLabel: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  compositionDivider: {
    fontSize: FONTS.sizes.lg,
    color: COLORS.text.muted,
  },

  compositionComplete: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.success,
  },

  compositionIncomplete: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
  },

  section: {
    marginBottom: SPACING.sm,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
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

  addLargeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary + '15',
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.sm,
  },

  addLargeButtonText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },

  addLargeButtonSubtext: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginLeft: SPACING.xs,
  },

  driverItem: {
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    padding: SPACING.md,
  },

  driverInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  driverMain: {},

  driverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  driverNumber: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },

  driverName: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '700',
    color: COLORS.text.primary,
  },

  driverCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },

  driverTeam: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
  },

  // V3: Captain badge styles (replaces star)
  captainBadgeInline: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  captainIconButton: {
    padding: SPACING.xs,
  },

  // Keep for backwards compatibility in case needed
  starBadgeInline: {
    backgroundColor: COLORS.gold,
    borderRadius: 8,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  starIconButton: {
    padding: SPACING.xs,
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

  sellButton: {
    padding: SPACING.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sellButtonText: {
    fontSize: 10,
    color: COLORS.error,
    fontWeight: '600',
    marginTop: 2,
  },

  driverPoints: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
  },

  driverPrice: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
  },

  priceComparison: {
    alignItems: 'flex-end',
  },

  purchasePrice: {
    fontSize: 11,
    color: COLORS.text.muted,
  },

  currentValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },

  currentValueLabel: {
    fontSize: 11,
    color: COLORS.text.muted,
  },

  currentValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  priceUp: {
    color: COLORS.success,
  },

  priceDown: {
    color: COLORS.error,
  },

  profitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 8,
    marginLeft: 4,
    gap: 2,
  },

  profitUp: {
    backgroundColor: COLORS.success,
  },

  profitDown: {
    backgroundColor: COLORS.error,
  },

  profitText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
  },

  sellValue: {
    fontSize: 11,
    color: COLORS.text.secondary,
    marginTop: 2,
    fontWeight: '500',
  },

  driverActionsRow: {
    flexDirection: 'row',
    marginTop: SPACING.xs,
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },

  lockBonus: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.accent,
    marginTop: SPACING.xs,
  },

  lockBonusCompact: {
    fontSize: 10,
    color: COLORS.accent,
    marginTop: 2,
  },

  swapRecommendationRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
  },

  swapRecommendationCompactText: {
    flex: 1,
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: '500',
  },

  alternativeRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
  },

  alternativeCompactText: {
    flex: 1,
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: '500',
  },

  alternativeCompactTextMuted: {
    flex: 1,
    fontSize: 10,
    color: COLORS.text.muted,
    fontWeight: '500',
  },

  constructorItem: {
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    padding: SPACING.md,
  },

  constructorInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  constructorMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  constructorName: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '700',
    color: COLORS.text.primary,
  },

  constructorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  constructorStats: {
    alignItems: 'flex-end',
  },

  constructorPoints: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '700',
    color: COLORS.primary,
  },

  constructorPrice: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
  },

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
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

  modalSaveButtonDisabled: {
    opacity: 0.5,
  },

  modalSaveText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.inverse,
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
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: COLORS.border.default,
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
    color: COLORS.text.primary,
  },

  swapDriverCard: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  swapDriverCardRecommended: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.success,
  },

  swapDriverLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.text.muted,
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
    color: COLORS.text.primary,
  },

  swapDriverStats: {
    alignItems: 'flex-end',
  },

  swapDriverPoints: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },

  swapDriverPointsGreen: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.success,
  },

  swapDriverPrice: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
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
    borderTopColor: COLORS.border.default,
  },

  swapSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },

  swapSummaryLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
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
    borderRadius: BORDER_RADIUS.button,
    backgroundColor: COLORS.primary,
  },

  swapConfirmText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.inverse,
    fontWeight: '600',
  },
});
