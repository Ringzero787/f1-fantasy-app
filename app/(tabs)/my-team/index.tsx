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
import { useTeamStore, getLockedOutDriverIds, calculateEarlyTerminationFee } from '../../../src/store/team.store';
import { useLeagueStore } from '../../../src/store/league.store';
import { useAdminStore } from '../../../src/store/admin.store';
import { useDrivers, useConstructors, useAvatarGeneration, useLockoutStatus } from '../../../src/hooks';
import { saveAvatarUrl } from '../../../src/services/avatarGeneration.service';
import { Loading, Button, Avatar, AvatarPicker } from '../../../src/components';
import { COLORS, SPACING, FONTS, BUDGET, TEAM_SIZE, BORDER_RADIUS } from '../../../src/config/constants';
import { PRICING_CONFIG } from '../../../src/config/pricing.config';
import { formatPoints } from '../../../src/utils/formatters';

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

export default function MyTeamScreen() {
  const { user } = useAuth();
  const { currentTeam, userTeams, isLoading, hasHydrated, loadUserTeams, updateTeamName, removeDriver, removeConstructor, setCaptain, clearCaptain, selectTeam, recalculateAllTeamsPoints, setCurrentTeam } = useTeamStore();
  const { leagues, loadUserLeagues } = useLeagueStore();
  const { raceResults } = useAdminStore();
  const { data: allDrivers } = useDrivers();
  const { data: allConstructors } = useConstructors();
  const lockoutInfo = useLockoutStatus();

  const [refreshing, setRefreshing] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [teamAvatarUrl, setTeamAvatarUrl] = useState<string | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const { generate: generateAvatar, regenerate: regenerateAvatar, isGenerating: isGeneratingAvatar, isAvailable: isAvatarAvailable } = useAvatarGeneration({
    onSuccess: (url) => {
      setTeamAvatarUrl(url);
      const team = useTeamStore.getState().currentTeam;
      if (team) {
        useTeamStore.getState().setCurrentTeam({ ...team, avatarUrl: url, updatedAt: new Date() });
      }
    },
  });

  // Load user teams on mount
  useEffect(() => {
    if (user) {
      loadUserTeams(user.id);
      loadUserLeagues(user.id);
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
          const multiplier = currentTeam.captainDriverId === driver.driverId ? 2 : 1;
          lastRacePoints += Math.floor(driverResult.points * multiplier);
        }
      });
      if (currentTeam.constructor) {
        const constructorResult = lastResult.constructorResults.find(
          (cr: any) => cr.constructorId === currentTeam.constructor?.constructorId
        );
        if (constructorResult) lastRacePoints += constructorResult.points;
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

    return {
      lastRacePoints,
      totalPoints: currentTeam?.totalPoints || 0,
      leagueRank,
      leagueSize,
      hasCompletedRaces: completedRaces.length > 0,
    };
  }, [raceResults, currentTeam, userTeams, leagues]);

  // Build a lookup: constructorId -> { shortName, primaryColor }
  const constructorLookup = useMemo(() => {
    const map: Record<string, { shortName: string; primaryColor: string }> = {};
    allConstructors?.forEach(c => {
      map[c.id] = { shortName: c.shortName, primaryColor: c.primaryColor };
    });
    return map;
  }, [allConstructors]);

  // V5: Locked-out driver names for the lockout banner
  const lockedOutDriverNames = useMemo(() => {
    const completedRaceCount = Object.values(raceResults).filter(r => r.isComplete).length;
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

  const handleRemoveDriver = (driverId: string, driverName: string) => {
    // V6: Calculate and show early termination fee in confirmation
    const driver = currentTeam?.drivers.find(d => d.driverId === driverId);
    const contractLen = driver?.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
    const fee = driver ? calculateEarlyTerminationFee(driver.purchasePrice, contractLen, driver.racesHeld || 0) : 0;
    const marketDriver = allDrivers?.find(d => d.id === driverId);
    const livePrice = marketDriver?.price ?? driver?.currentPrice ?? 0;
    const saleProceeds = Math.max(0, livePrice - fee);
    const feeMessage = fee > 0
      ? `\n\nEarly termination fee: $${fee}\nYou'll receive: $${saleProceeds}`
      : '';

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
            try { await removeConstructor(); } catch { /* store handles */ }
          },
        },
      ]
    );
  };

  const handleSetCaptain = async (driverId: string) => {
    try { await setCaptain(driverId); } catch { Alert.alert('Error', 'Failed to set Ace'); }
  };

  const handleClearCaptain = async () => {
    try { await clearCaptain(); } catch { Alert.alert('Error', 'Failed to clear Ace'); }
  };

  // V5: Lockout-aware canModify and canChangeCaptain
  const canModify = !lockoutInfo.isLocked && (currentTeam?.lockStatus.canModify ?? true);
  const canChangeCaptain = !lockoutInfo.captainLocked && (currentTeam?.lockStatus.canModify ?? true);

  // Countdown text for lockout
  const lockCountdownText = useMemo(() => {
    if (!lockoutInfo.lockTime || lockoutInfo.isLocked) return null;
    const diff = lockoutInfo.lockTime.getTime() - Date.now();
    if (diff <= 0 || diff > 24 * 60 * 60 * 1000) return null;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `Locks in ${hours}h ${minutes}m`;
  }, [lockoutInfo.lockTime, lockoutInfo.isLocked]);

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
                  currentTeam?.id === team.id && styles.teamTabActive,
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
              <Ionicons name="add" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* New Team button when only 1 team */}
        {userTeams.length === 1 && (
          <TouchableOpacity
            style={styles.newTeamLink}
            onPress={() => router.push('/my-team/create')}
          >
            <Ionicons name="add-circle-outline" size={14} color={COLORS.primary} />
            <Text style={styles.newTeamLinkText}>New Team</Text>
          </TouchableOpacity>
        )}

        {/* Team Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {teamStats.hasCompletedRaces ? teamStats.lastRacePoints : '-'}
            </Text>
            <Text style={styles.statLabel}>Last Race</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatPoints(teamStats.totalPoints)}</Text>
            <Text style={styles.statLabel}>Total Pts</Text>
          </View>
          <View style={styles.statDivider} />
          {teamStats.leagueRank !== null ? (
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {teamStats.leagueRank}/{teamStats.leagueSize}
              </Text>
              <Text style={styles.statLabel}>League</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push('/leagues')}
            >
              <Ionicons name="trophy-outline" size={20} color={COLORS.primary} />
              <Text style={styles.joinLeagueText}>Join League</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* V5: Lockout Banner */}
        {lockoutInfo.isLocked && (
          <View style={styles.lockoutBanner}>
            <Ionicons name="lock-closed" size={16} color={COLORS.white} />
            <View style={{ flex: 1 }}>
              <Text style={styles.lockoutBannerText}>
                {lockoutInfo.lockReason || 'Teams locked'}
              </Text>
              {!lockoutInfo.captainLocked && (
                <Text style={styles.lockoutBannerHint}>Ace selection still open until race start</Text>
              )}
            </View>
          </View>
        )}

        {/* V5: Lockout Countdown */}
        {lockCountdownText && !lockoutInfo.isLocked && (
          <View style={styles.lockCountdown}>
            <Ionicons name="time-outline" size={14} color={COLORS.warning} />
            <Text style={styles.lockCountdownText}>{lockCountdownText}</Text>
          </View>
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
              <Text style={styles.teamName}>{currentTeam?.name || 'My Team'}</Text>
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

        {/* Bank + Team Value row */}
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryLabel}>BANK</Text>
            <Text style={styles.summaryValue}>${formatPoints(currentTeam?.budget || 0)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.summaryLabel}>TEAM VALUE</Text>
            <Text style={styles.summaryValue}>${formatPoints(teamValue)}</Text>
          </View>
        </View>

        {/* Ace reminder */}
        {currentTeam && !currentTeam.captainDriverId && driversCount > 0 &&
          currentTeam.drivers.some(d => {
            const md = allDrivers?.find(m => m.id === d.driverId);
            return (md?.price ?? d.currentPrice) <= PRICING_CONFIG.CAPTAIN_MAX_PRICE;
          }) && (
          <View style={styles.aceNotice}>
            <Ionicons name="diamond-outline" size={14} color={COLORS.gold} />
            <Text style={styles.aceNoticeText}>
              Select an Ace driver to earn 2x points! Tap the <Ionicons name="diamond-outline" size={12} color={COLORS.gold} /> icon on an eligible driver (under ${PRICING_CONFIG.CAPTAIN_MAX_PRICE}).
            </Text>
          </View>
        )}

        {/* Constructor reminder */}
        {currentTeam && !currentTeam.constructor && driversCount > 0 && (
          <View style={styles.constructorNotice}>
            <Ionicons name="construct-outline" size={14} color={COLORS.primary} />
            <Text style={styles.constructorNoticeText}>
              Make sure you select a constructor!
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
        {currentTeam?.drivers && currentTeam.drivers.length > 0 ? (
          [...currentTeam.drivers]
            .map(driver => {
              const marketDriver = allDrivers?.find(d => d.id === driver.driverId);
              const livePrice = marketDriver?.price ?? driver.currentPrice;
              const driverNumber = marketDriver?.number;
              const resolvedConstructorId = marketDriver?.constructorId ?? driver.constructorId;
              return { ...driver, livePrice, driverNumber, resolvedConstructorId };
            })
            .sort((a, b) => b.livePrice - a.livePrice)
            .map((driver) => {
              const cInfo = constructorLookup[driver.resolvedConstructorId];
              const isAce = currentTeam?.captainDriverId === driver.driverId;
              const canBeAce = driver.livePrice <= PRICING_CONFIG.CAPTAIN_MAX_PRICE;

              const priceDiff = driver.livePrice - driver.purchasePrice;
              const loyalty = getLoyaltyBonus(driver.racesHeld || 0);
              const nextRate = getNextLoyaltyRate(driver.racesHeld || 0);
              const contractLen = driver.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
              const contractRemaining = contractLen - (driver.racesHeld || 0);
              const isLastRace = contractRemaining === 1;
              const isReserve = driver.isReservePick;
              // V6: Early termination fee
              const earlyTermFee = calculateEarlyTerminationFee(driver.purchasePrice, contractLen, driver.racesHeld || 0);
              const effectiveSaleValue = Math.max(0, driver.livePrice - earlyTermFee);

              return (
                <View key={driver.driverId} style={[styles.driverRow, isReserve && styles.reserveRow]}>
                  {/* Top line: name + constructor badge + ace + sell */}
                  <View style={styles.driverRowTop}>
                    <View style={styles.driverRowLeft}>
                      <View style={styles.driverNameLine}>
                        {driver.driverNumber != null && (
                          <Text style={[styles.driverNumber, cInfo && { color: isReserve ? COLORS.text.muted : cInfo.primaryColor }]}>
                            {driver.driverNumber}
                          </Text>
                        )}
                        <Text style={[styles.driverName, isReserve && styles.reserveDriverName]}>{driver.name}</Text>
                        {cInfo && (
                          <View style={[styles.constructorBadge, { backgroundColor: isReserve ? COLORS.text.muted : cInfo.primaryColor }]}>
                            <Text style={styles.constructorBadgeText}>{cInfo.shortName}</Text>
                          </View>
                        )}
                        {isReserve && (
                          <View style={styles.reserveBadge}>
                            <Text style={styles.reserveBadgeText}>AUTO-FILL</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.driverRowRight}>
                      <Text style={styles.driverPoints}>{formatPoints(driver.pointsScored)} pts</Text>
                      {!isReserve && (isAce ? (
                        <TouchableOpacity onPress={() => handleClearCaptain()} hitSlop={8}>
                          <View style={styles.aceBadge}>
                            <Ionicons name="diamond" size={14} color={COLORS.white} />
                          </View>
                        </TouchableOpacity>
                      ) : canBeAce && canChangeCaptain ? (
                        <TouchableOpacity onPress={() => handleSetCaptain(driver.driverId)} hitSlop={8}>
                          <Ionicons name="diamond-outline" size={18} color={COLORS.gold} />
                        </TouchableOpacity>
                      ) : (
                        <View style={{ width: 18 }} />
                      ))}
                      {canModify && (() => {
                        const saleDiff = effectiveSaleValue - driver.purchasePrice;
                        const saleColor = saleDiff > 0 ? '#16a34a' : saleDiff < 0 ? COLORS.error : COLORS.text.muted;
                        return (
                          <TouchableOpacity
                            onPress={() => handleRemoveDriver(driver.driverId, driver.name)}
                            hitSlop={8}
                            style={[styles.sellButton, { backgroundColor: saleColor + '15' }]}
                          >
                            <Ionicons name="cash-outline" size={16} color={saleColor} />
                          </TouchableOpacity>
                        );
                      })()}
                    </View>
                  </View>

                  {/* Bottom line: reserve notice or price info + loyalty */}
                  {isReserve ? (
                    <View style={styles.driverMeta}>
                      <Ionicons name="information-circle-outline" size={12} color={COLORS.text.muted} />
                      <Text style={styles.reserveMetaText}>
                        Auto-filled · No contract · No loyalty bonus · Swap anytime for free
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.driverMeta}>
                      <Text style={styles.driverPrice}>${driver.livePrice}</Text>
                      {priceDiff !== 0 && (
                        <View style={[styles.priceDiffBadge, priceDiff > 0 ? styles.priceUp : styles.priceDown]}>
                          <Ionicons name={priceDiff > 0 ? 'arrow-up' : 'arrow-down'} size={11} color={COLORS.white} />
                          <Text style={styles.priceDiffText}>${Math.abs(priceDiff)}</Text>
                        </View>
                      )}
                      <Text style={styles.metaSeparator}>·</Text>
                      <Text style={styles.saleText}>
                        Sell: ${effectiveSaleValue}{earlyTermFee > 0 ? ` (-$${earlyTermFee} fee)` : priceDiff > 0 ? ` (+$${priceDiff})` : priceDiff < 0 ? ` (-$${Math.abs(priceDiff)})` : ''}
                      </Text>
                      <Text style={styles.metaSeparator}>·</Text>
                      <Ionicons name="document-text-outline" size={12} color={isLastRace ? COLORS.warning : COLORS.text.muted} />
                      {isLastRace ? (
                        <Text style={styles.contractLastRace}>LAST RACE</Text>
                      ) : (
                        <Text style={[styles.contractText, contractRemaining <= 1 && { color: COLORS.warning }]}>
                          {driver.racesHeld || 0}/{contractLen}
                        </Text>
                      )}
                      <Text style={styles.metaSeparator}>·</Text>
                      <Ionicons name="flame" size={12} color={loyalty > 0 ? COLORS.gold : COLORS.text.muted} />
                      <Text style={[styles.loyaltyText, loyalty > 0 && { color: COLORS.gold }]}>
                        +{nextRate}/race
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
        ) : null}

        {/* Add Driver button */}
        {driversCount < TEAM_SIZE && canModify && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/my-team/select-driver')}
          >
            <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
            <Text style={styles.addButtonText}>Add Driver ({driversCount}/{TEAM_SIZE})</Text>
          </TouchableOpacity>
        )}

        {/* Constructor row */}
        {currentTeam?.constructor ? (() => {
          const c = currentTeam.constructor;
          const marketC = allConstructors?.find(mc => mc.id === c.constructorId);
          const livePrice = marketC?.price ?? c.currentPrice;
          const cInfo = constructorLookup[c.constructorId];
          const cPriceDiff = livePrice - c.purchasePrice;
          const cLoyalty = getLoyaltyBonus(c.racesHeld || 0);
          const cNextRate = getNextLoyaltyRate(c.racesHeld || 0);

          return (
            <View style={styles.driverRow}>
              <View style={styles.driverRowTop}>
                <View style={styles.driverRowLeft}>
                  <View style={styles.driverNameLine}>
                    <Text style={styles.driverName}>{c.name}</Text>
                    {cInfo && (
                      <View style={[styles.constructorBadge, { backgroundColor: cInfo.primaryColor }]}>
                        <Text style={styles.constructorBadgeText}>{cInfo.shortName}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.driverRowRight}>
                  <Text style={styles.driverPoints}>{formatPoints(c.pointsScored)} pts</Text>
                  <View style={{ width: 18 }} />
                  {canModify && (() => {
                    const cSaleColor = cPriceDiff > 0 ? '#16a34a' : cPriceDiff < 0 ? COLORS.error : COLORS.text.muted;
                    return (
                      <TouchableOpacity
                        onPress={handleRemoveConstructor}
                        hitSlop={8}
                        style={[styles.sellButton, { backgroundColor: cSaleColor + '15' }]}
                      >
                        <Ionicons name="cash-outline" size={16} color={cSaleColor} />
                      </TouchableOpacity>
                    );
                  })()}
                </View>
              </View>
              <View style={styles.driverMeta}>
                <Text style={styles.driverPrice}>${livePrice}</Text>
                {cPriceDiff !== 0 && (
                  <View style={[styles.priceDiffBadge, cPriceDiff > 0 ? styles.priceUp : styles.priceDown]}>
                    <Ionicons name={cPriceDiff > 0 ? 'arrow-up' : 'arrow-down'} size={11} color={COLORS.white} />
                    <Text style={styles.priceDiffText}>${Math.abs(cPriceDiff)}</Text>
                  </View>
                )}
                <Text style={styles.metaSeparator}>·</Text>
                <Text style={styles.saleText}>
                  Sell: ${livePrice}{cPriceDiff > 0 ? ` (+$${cPriceDiff})` : cPriceDiff < 0 ? ` (-$${Math.abs(cPriceDiff)})` : ''}
                </Text>
                <Text style={styles.metaSeparator}>·</Text>
                <Ionicons name="flame" size={12} color={cLoyalty > 0 ? COLORS.gold : COLORS.text.muted} />
                <Text style={[styles.loyaltyText, cLoyalty > 0 && { color: COLORS.gold }]}>
                  +{cNextRate}/race
                </Text>
              </View>
            </View>
          );
        })() : null}

        {/* Add Constructor button */}
        {!hasConstructor && canModify && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/my-team/select-constructor')}
          >
            <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
            <Text style={styles.addButtonText}>Add Constructor (0/1)</Text>
          </TouchableOpacity>
        )}

        {/* Manage button */}
        {canModify && (
          <TouchableOpacity
            style={styles.manageButton}
            onPress={() => router.push('/my-team/edit')}
          >
            <Ionicons name="settings-outline" size={18} color={COLORS.primary} />
            <Text style={styles.manageButtonText}>Manage</Text>
          </TouchableOpacity>
        )}
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
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  welcomeHint: {
    fontSize: FONTS.sizes.sm,
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
    fontSize: FONTS.sizes.sm,
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
    fontSize: FONTS.sizes.sm,
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
    fontSize: FONTS.sizes.xs,
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

  // Bank + Team Value
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },
  summaryLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.text.muted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '700',
    color: COLORS.text.primary,
  },

  // Driver row
  driverRow: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },
  driverRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  driverRowLeft: {
    flex: 1,
  },
  driverNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  driverNumber: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.text.muted,
    minWidth: 24,
  },
  driverName: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  constructorBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  constructorBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
  },
  driverRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  driverPoints: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },
  aceBadge: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  driverPrice: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
    fontWeight: '500',
  },
  priceDiffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priceUp: {
    backgroundColor: '#16a34a',
  },
  priceDown: {
    backgroundColor: COLORS.error,
  },
  priceDiffText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.white,
  },
  metaSeparator: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginHorizontal: 2,
  },
  saleText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },
  loyaltyText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    fontWeight: '600',
  },
  sellButton: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: COLORS.error + '15',
  },
  // V5: Lockout styles
  lockoutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.error,
    borderRadius: BORDER_RADIUS.md,
  },
  lockoutBannerText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.white,
  },
  lockoutBannerHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.white,
    opacity: 0.8,
    marginTop: 2,
  },
  lockCountdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.warning + '15',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },
  lockCountdownText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.warning,
  },
  reserveRow: {
    opacity: 0.6,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.text.muted,
  },
  reserveDriverName: {
    color: COLORS.text.muted,
  },
  reserveMetaText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    fontStyle: 'italic',
    marginLeft: 4,
  },
  reserveBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: COLORS.text.muted + '25',
    borderWidth: 1,
    borderColor: COLORS.text.muted + '40',
  },
  reserveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text.muted,
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
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.secondary,
    lineHeight: 16,
  },
  contractText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    fontWeight: '600',
  },
  contractLastRace: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.warning,
  },

  aceNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.gold + '15',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gold + '30',
  },
  aceNoticeText: {
    flex: 1,
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.secondary,
    lineHeight: 16,
  },
  constructorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.primary + '15',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  constructorNoticeText: {
    flex: 1,
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.secondary,
    lineHeight: 16,
  },

  // Add button
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },
  addButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Manage button
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border.accent,
    backgroundColor: COLORS.glass.cyan,
  },
  manageButtonText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.primary,
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
