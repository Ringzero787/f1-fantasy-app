import React, { useState, useMemo, useEffect, useRef } from 'react';
import { maybeRequestReview } from '../../utils/reviewPrompt';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONTS } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { SimpleDriverRow } from './SimpleDriverRow';
import { SimpleConstructorRow } from './SimpleConstructorRow';
import { SimpleCreateTeam } from './SimpleCreateTeam';
import { SimpleTeamToggle } from './SimpleTeamToggle';
import { SimpleCountdownBanner } from './SimpleCountdownBanner';
import { Avatar } from '../../components/Avatar';
import { generateAvatar, saveAvatarUrl } from '../../services/avatarGeneration.service';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useSimpleTeam } from '../hooks/useSimpleTeam';
import { useAuthStore } from '../../store/auth.store';
import { useAdminStore } from '../../store/admin.store';
import { useLeagueStore } from '../../store/league.store';
import { useTeamStore } from '../../store/team.store';
import { useLockoutStatus } from '../../hooks/useLockoutStatus';
import { useRaceScoresStore } from '../../store/raceScores.store';
import { TEAM_SIZE, BUDGET } from '../../config/constants';
import { PRICING_CONFIG } from '../../config/pricing.config';
import type { SimplePanel } from './SimpleToggleBar';

interface Props {
  onNavigateToMarket: () => void;
  refreshing: boolean;
  onRefresh: () => void;
}

export const SimpleMyTeamPanel = React.memo(function SimpleMyTeamPanel({
  onNavigateToMarket,
  refreshing,
  onRefresh,
}: Props) {
  const { colors, fonts, spacing } = useSimpleTheme();
  const {
    team,
    teamConstructor,
    hasTeam,
    driversCount,
    isFull,
    budget,
    createTeam,
    removeDriver,
    removeConstructor,
    setAce,
    setAceConstructor,
    clearAce,
    updateTeamName,
    syncToFirebase,
    teamCount,
    activeTeamIndex,
    canCreateSecondTeam,
    switchTeam,
  } = useSimpleTeam();
  const lockoutInfo = useLockoutStatus();
  const locked = lockoutInfo.isLocked || !(team?.lockStatus?.canModify ?? true);
  const aceLocked = locked;
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingSecondTeam, setCreatingSecondTeam] = useState(false);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const leagueMembers = useLeagueStore((s) => s.members);
  const loadLeagueMembers = useLeagueStore((s) => s.loadLeagueMembers);
  const driverPrices = useAdminStore((s) => s.driverPrices);
  const constructorPrices = useAdminStore((s) => s.constructorPrices);
  const setCurrentTeam = useTeamStore((s) => s.setCurrentTeam);
  const { lastRaceScores, fetchLastRaceScores } = useRaceScoresStore();

  // Fetch last race scores and league members on mount
  React.useEffect(() => { fetchLastRaceScores(); }, []);
  React.useEffect(() => {
    if (team?.leagueId && leagueMembers.length === 0) {
      loadLeagueMembers(team.leagueId);
    }
  }, [team?.leagueId]);

  const styles = useMemo(() => ({
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl + 40, // room for profile pill
    },
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    nameRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
      flex: 1,
    },
    teamName: {
      fontSize: fonts.xxl,
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.primary,
    },
    editNameRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      flex: 1,
      gap: spacing.xs,
    },
    editNameInput: {
      flex: 1,
      fontSize: fonts.xl,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.primary,
      borderBottomWidth: 2,
      borderBottomColor: colors.primary,
      paddingVertical: spacing.xs,
    },
    editNameBtn: {
      padding: spacing.xs,
    },
    lockBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      backgroundColor: colors.lockedBg,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: S_RADIUS.pill,
    },
    lockText: {
      fontSize: fonts.xs,
      color: colors.locked,
      fontWeight: S_FONTS.weights.medium,
    },
    statsRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.card,
      borderRadius: S_RADIUS.md,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    statItem: {
      flex: 1,
      alignItems: 'center' as const,
    },
    statDivider: {
      borderLeftWidth: 1,
      borderLeftColor: colors.borderLight,
    },
    statValue: {
      fontSize: fonts.xl,
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.primary,
    },
    statLabel: {
      fontSize: fonts.sm,
      color: colors.text.muted,
      marginTop: 2,
    },
    sectionTitle: {
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.muted,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.8,
      marginBottom: spacing.sm,
    },
    emptySlot: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: S_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed' as const,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    emptySlotText: {
      fontSize: fonts.md,
      color: colors.primary,
      fontWeight: S_FONTS.weights.medium,
    },
    readyBanner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
      backgroundColor: colors.positiveFaint,
      borderRadius: S_RADIUS.md,
      padding: spacing.md,
      marginTop: spacing.lg,
    },
    readyText: {
      fontSize: fonts.md,
      color: colors.positive,
      fontWeight: S_FONTS.weights.medium,
      flex: 1,
    },
  }), [colors, fonts, spacing]);

  if (!hasTeam) {
    return <SimpleCreateTeam onCreate={async (name, joinCode) => { await createTeam(name, joinCode); }} />;
  }

  // creatingSecondTeam is handled inline below with the toggle still visible

  const handleEditName = () => {
    setNewName(team!.name);
    setEditingName(true);
  };

  const handleSaveName = async () => {
    const trimmed = newName.trim();
    if (trimmed.length < 2) {
      Alert.alert('Invalid', 'Team name must be at least 2 characters.');
      return;
    }
    try {
      await updateTeamName(trimmed);
      setEditingName(false);
    } catch {
      Alert.alert('Error', 'Failed to update team name.');
    }
  };

  const handleTeamAvatarTap = () => {
    Alert.alert('Team Avatar', 'Choose how to set your team avatar', [
      {
        text: 'Generate with AI',
        onPress: async () => {
          try {
            const result = await generateAvatar(team!.name, 'team', team!.id, 'detailed');
            if (result.success && result.imageUrl) {
              setCurrentTeam({ ...team!, avatarUrl: result.imageUrl });
              syncToFirebase();
            }
          } catch { Alert.alert('Error', 'Generation failed'); }
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) { Alert.alert('Permission Required'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
            });
            if (result.canceled || !result.assets[0]) return;
            const uri = result.assets[0].uri;
            if (isDemoMode) {
              setCurrentTeam({ ...team!, avatarUrl: uri });
              return;
            }
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            const { uploadProfileImage } = await import('../../services/profileImage.service');
            const url = await uploadProfileImage(team!.id, base64, 'image/jpeg');
            await saveAvatarUrl('team', team!.id, url);
            setCurrentTeam({ ...team!, avatarUrl: url });
            syncToFirebase();
          } catch { Alert.alert('Error', 'Upload failed'); }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const emptyDriverSlots = TEAM_SIZE - driversCount;

  // Prompt for review when team is complete
  const reviewTriggered = useRef(false);
  useEffect(() => {
    if (isFull && !reviewTriggered.current) {
      reviewTriggered.current = true;
      maybeRequestReview();
    }
  }, [isFull]);

  // Enrich drivers with live market prices
  const enrichedDrivers = (team!.drivers ?? []).map(d => {
    const marketPrice = driverPrices[d.driverId]?.currentPrice;
    return marketPrice ? { ...d, currentPrice: marketPrice } : d;
  });
  const enrichedConstructor = teamConstructor
    ? { ...teamConstructor, currentPrice: constructorPrices[teamConstructor.constructorId]?.currentPrice ?? teamConstructor.currentPrice }
    : null;
  const totalValue = enrichedDrivers.reduce((s, d) => s + (d.currentPrice || 0), 0)
    + (enrichedConstructor?.currentPrice || 0);
  const totalPurchaseValue = enrichedDrivers.reduce((s, d) => s + (d.purchasePrice || 0), 0)
    + (enrichedConstructor?.purchasePrice || 0);
  const valueChange = totalValue - totalPurchaseValue;

  // Last race points from raceScores store
  const lastRacePoints = (() => {
    const driverIds = enrichedDrivers.map(d => d.driverId);
    const ctorId = enrichedConstructor?.constructorId;
    const scores = driverIds.map(id => lastRaceScores[id]?.totalPoints ?? 0);
    if (ctorId && lastRaceScores[ctorId]) scores.push(lastRaceScores[ctorId].totalPoints);
    // Only show if we have any scores loaded
    if (Object.keys(lastRaceScores).length === 0) return null;
    return scores.reduce((a, b) => a + b, 0);
  })();

  // League rank
  const userId = team!.userId;
  const myLeagueMember = leagueMembers.find(m => m.userId === userId);
  const myRank = myLeagueMember?.rank;
  const leagueSize = leagueMembers.length;

  const handleToggleAce = async (driverId: string) => {
    if (aceLocked) return;
    if (team!.aceDriverId === driverId) {
      await clearAce();
    } else {
      await setAce(driverId);
    }
  };

  const handleToggleAceConstructor = async () => {
    if (aceLocked || !teamConstructor) return;
    if (team!.aceConstructorId === teamConstructor.constructorId) {
      await clearAce();
    } else {
      await setAceConstructor(teamConstructor.constructorId);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* Team Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleTeamAvatarTap} activeOpacity={0.7}>
          <Avatar name={team!.name} size={40} variant="team" imageUrl={team!.avatarUrl} />
        </TouchableOpacity>
        {editingName ? (
          <View style={styles.editNameRow}>
            <TextInput
              style={styles.editNameInput}
              value={newName}
              onChangeText={setNewName}
              maxLength={30}
              autoFocus
              onSubmitEditing={handleSaveName}
              returnKeyType="done"
            />
            <TouchableOpacity onPress={handleSaveName} style={styles.editNameBtn}>
              <Ionicons name="checkmark" size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingName(false)} style={styles.editNameBtn}>
              <Ionicons name="close" size={18} color={colors.text.muted} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={handleEditName} style={styles.nameRow} activeOpacity={0.7}>
            <Text style={styles.teamName}>{team!.name}</Text>
            <Ionicons name="pencil" size={14} color={colors.text.muted} />
          </TouchableOpacity>
        )}
        <SimpleCountdownBanner />
        {locked && (
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={12} color={colors.locked} />
            <Text style={styles.lockText}>Locked</Text>
          </View>
        )}
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <SimpleTeamToggle
          activeIndex={creatingSecondTeam ? 1 : activeTeamIndex}
          teamCount={creatingSecondTeam ? 2 : teamCount}
          canCreateSecond={canCreateSecondTeam && !creatingSecondTeam}
          onSwitch={(idx) => {
            if (creatingSecondTeam && idx === 0) {
              setCreatingSecondTeam(false);
            } else if (!creatingSecondTeam) {
              switchTeam(idx);
            }
          }}
          onCreateSecond={() => {
            Alert.alert(
              'Create a Second Team?',
              'You can have up to 2 teams — one for each league or solo play.',
              [
                { text: 'Not Now', style: 'cancel' },
                { text: 'Create', onPress: () => setCreatingSecondTeam(true) },
              ],
            );
          }}
        />
        <View style={[styles.statItem, { marginLeft: spacing.sm }]}>
          <Text style={styles.statValue}>
            {(() => {
              const leaguePts = myLeagueMember?.totalPoints ?? 0;
              const teamPts = team!.totalPoints ?? 0;
              const computedPts = enrichedDrivers.reduce((s, d) => s + (d.pointsScored || 0), 0)
                + (enrichedConstructor?.pointsScored || 0) + (team!.lockedPoints || 0);
              return Math.max(leaguePts, teamPts, computedPts);
            })()}
          </Text>
          {lastRacePoints !== null && (
            <Text style={{ fontSize: fonts.xs, color: lastRacePoints >= 0 ? colors.positive : colors.negative, fontWeight: S_FONTS.weights.medium }}>
              {lastRacePoints >= 0 ? '+' : ''}{lastRacePoints} last
            </Text>
          )}
          <Text style={styles.statLabel}>Points</Text>
        </View>
        <View style={[styles.statItem, styles.statDivider]}>
          {myRank ? (
            <>
              <Text style={styles.statValue}>{myRank}<Text style={{ fontSize: fonts.xs, color: colors.text.muted }}>/{leagueSize}</Text></Text>
              <Text style={styles.statLabel}>Rank</Text>
            </>
          ) : (
            <>
              <Text style={styles.statValue}>—</Text>
              <Text style={styles.statLabel}>Rank</Text>
            </>
          )}
        </View>
        <View style={[styles.statItem, styles.statDivider]}>
          <Text style={styles.statValue}>${totalValue}</Text>
          {valueChange !== 0 && (
            <Text style={{ fontSize: fonts.xs, color: valueChange > 0 ? colors.positive : colors.negative, fontWeight: S_FONTS.weights.medium }}>
              {valueChange > 0 ? '+' : ''}{valueChange}
            </Text>
          )}
          <Text style={styles.statLabel}>Value</Text>
        </View>
        <View style={[styles.statItem, styles.statDivider]}>
          <Text style={styles.statValue}>${budget}</Text>
          <Text style={styles.statLabel}>Budget</Text>
        </View>
      </View>

      {/* Second team creation (inline, toggle stays visible) */}
      {creatingSecondTeam && (
        <SimpleCreateTeam
          isSecondTeam
          onCreate={async (name, joinCode) => {
            await createTeam(name, joinCode);
            setCreatingSecondTeam(false);
          }}
          onCancel={() => setCreatingSecondTeam(false)}
        />
      )}

      {/* Drivers Section */}
      {!creatingSecondTeam && (<>
      <Text style={styles.sectionTitle}>Drivers</Text>
      {enrichedDrivers.map((driver) => (
        <SimpleDriverRow
          key={driver.driverId}
          driver={driver}
          isAce={team!.aceDriverId === driver.driverId}
          locked={locked}
          aceLocked={aceLocked}
          lastRacePoints={lastRaceScores[driver.driverId]?.totalPoints ?? null}
          onRemove={() => {
            const racesLeft = (driver.contractLength ?? 3) - (driver.racesHeld ?? 0);
            const earlyTermFee = racesLeft > 0 ? Math.round(driver.currentPrice * 0.1 * racesLeft) : 0;
            Alert.alert(
              'Remove Driver',
              `Remove ${driver.name}?\n\nSale price: $${driver.currentPrice}${earlyTermFee > 0 ? `\nEarly termination: -$${earlyTermFee}\nYou receive: $${driver.currentPrice - earlyTermFee}` : ''}`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => removeDriver(driver.driverId) },
              ]
            );
          }}
          onToggleAce={() => handleToggleAce(driver.driverId)}
        />
      ))}

      {/* Empty driver slots */}
      {emptyDriverSlots > 0 && (
        <TouchableOpacity
          style={styles.emptySlot}
          onPress={onNavigateToMarket}
          disabled={locked}
          activeOpacity={0.6}
        >
          <Ionicons name="add-circle-outline" size={22} color={locked ? colors.text.muted : colors.primary} />
          <Text style={[styles.emptySlotText, locked && { color: colors.text.muted }]}>
            Add driver ({emptyDriverSlots} slot{emptyDriverSlots !== 1 ? 's' : ''} remaining)
          </Text>
        </TouchableOpacity>
      )}

      {/* Constructor Section */}
      <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Constructor</Text>
      {enrichedConstructor ? (
        <SimpleConstructorRow
          constructor={enrichedConstructor}
          isAce={team!.aceConstructorId === teamConstructor.constructorId}
          locked={locked}
          aceLocked={aceLocked}
          lastRacePoints={lastRaceScores[teamConstructor.constructorId]?.totalPoints ?? null}
          onRemove={() => {
            const racesLeft = (teamConstructor.contractLength ?? 3) - (teamConstructor.racesHeld ?? 0);
            const earlyTermFee = racesLeft > 0 ? Math.round(teamConstructor.currentPrice * 0.1 * racesLeft) : 0;
            Alert.alert(
              'Remove Constructor',
              `Remove ${teamConstructor.name}?\n\nSale price: $${teamConstructor.currentPrice}${earlyTermFee > 0 ? `\nEarly termination: -$${earlyTermFee}\nYou receive: $${teamConstructor.currentPrice - earlyTermFee}` : ''}`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => removeConstructor() },
              ]
            );
          }}
          onToggleAce={handleToggleAceConstructor}
        />
      ) : (
        <TouchableOpacity
          style={styles.emptySlot}
          onPress={onNavigateToMarket}
          disabled={locked}
          activeOpacity={0.6}
        >
          <Ionicons name="add-circle-outline" size={22} color={locked ? colors.text.muted : colors.primary} />
          <Text style={[styles.emptySlotText, locked && { color: colors.text.muted }]}>
            Add constructor
          </Text>
        </TouchableOpacity>
      )}

      {/* Ready banner */}
      {isFull && !locked && (
        <View style={styles.readyBanner}>
          <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
          <Text style={styles.readyText}>
            {lockoutInfo.nextRace
              ? `Your team is full and ready for ${lockoutInfo.nextRace.name}!`
              : 'Your team is complete!'}
          </Text>
        </View>
      )}
      </>)}
    </ScrollView>
  );
});
