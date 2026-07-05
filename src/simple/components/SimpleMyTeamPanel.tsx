import React, { useState, useMemo, useEffect, useRef } from 'react';
import { maybeRequestReview } from '../../utils/reviewPrompt';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONTS, S_FONT_FAMILY } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { SimpleDriverRow } from './SimpleDriverRow';
import { SimpleConstructorRow } from './SimpleConstructorRow';
import { SimpleCreateTeam } from './SimpleCreateTeam';
import { SimpleTeamToggle } from './SimpleTeamToggle';
import { SimpleCountdownBanner } from './SimpleCountdownBanner';
import { SectionLabel, SpeedLines } from './RaceDayBits';
import { Avatar } from '../../components/Avatar';
import { generateAvatar, saveAvatarUrl } from '../../services/avatarGeneration.service';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useSimpleTeam } from '../hooks/useSimpleTeam';
import { useAuthStore } from '../../store/auth.store';
import { useAdminStore } from '../../store/admin.store';
import { useLeagueStore } from '../../store/league.store';
import { useTeamStore, estimateSaleQuote } from '../../store/team.store';
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
  const { colors, fonts, spacing, scaled, display } = useSimpleTheme();
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
  // Ace locks at race start (lockoutInfo.aceLocked), not at the earlier FP3
  // team lock — using `locked` here disabled ace changes a day early.
  const aceLocked = lockoutInfo.aceLocked;
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
    // Always (re)load for the current team's league — the store holds one
    // global members array, so with two teams in different leagues the rank
    // stat would otherwise show the OTHER league's members. loadLeagueMembers
    // is internally throttled per league, so this is cheap.
    if (team?.leagueId) {
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
      gap: 10,
    },
    nameInput: {
      flex: 1,
      fontSize: scaled(18),
      fontFamily: S_FONT_FAMILY.display.semibold,
      letterSpacing: -0.3,
      color: colors.text.primary,
      paddingVertical: 2,
      paddingHorizontal: 4,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    nameInputFocused: {
      backgroundColor: colors.surface,
      borderBottomColor: colors.primary,
    },
    lockBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      backgroundColor: colors.lockedBg,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: S_RADIUS.pill,
    },
    lockText: {
      fontSize: scaled(12),
      color: colors.locked,
      fontFamily: S_FONT_FAMILY.body.semibold,
    },
    // Race Day stat bar — 1px border card, 4px red left edge, speed-line texture
    statsRow: {
      flexDirection: 'row' as const,
      alignItems: 'stretch' as const,
      backgroundColor: colors.card,
      borderRadius: S_RADIUS.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden' as const,
    },
    statsEdge: {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
      backgroundColor: colors.primary,
      zIndex: 1,
    },
    statItem: {
      flex: 1,
      alignItems: 'center' as const,
      paddingVertical: scaled(16),
      paddingHorizontal: 6,
      minWidth: 0,
    },
    statDivider: {
      width: 1,
      backgroundColor: colors.border,
      marginVertical: scaled(18),
    },
    statValue: {
      ...display,
      fontSize: scaled(26),
      lineHeight: scaled(28),
      letterSpacing: -0.5,
      color: colors.text.primary,
    },
    statSub: {
      fontSize: scaled(12),
      fontFamily: S_FONT_FAMILY.body.semibold,
      marginTop: 3,
    },
    statLabel: {
      fontSize: scaled(11.5),
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.text.muted,
      marginTop: 2,
    },
    emptySlot: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 10,
      backgroundColor: colors.primaryFaint + '55',
      borderRadius: S_RADIUS.lg,
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderStyle: 'dashed' as const,
      paddingVertical: scaled(16),
      paddingHorizontal: 14,
      marginBottom: spacing.sm,
    },
    emptySlotCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: colors.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    emptySlotText: {
      fontSize: scaled(15),
      color: colors.primary,
      fontFamily: S_FONT_FAMILY.body.semibold,
      letterSpacing: -0.1,
    },
    readyBanner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      backgroundColor: colors.positiveFaint,
      borderWidth: 1,
      borderColor: colors.positive + '33',
      borderRadius: S_RADIUS.lg,
      padding: 14,
      marginTop: spacing.lg,
    },
    readyCheck: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.positive,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    readyText: {
      fontSize: scaled(13.5),
      color: colors.positive,
      fontFamily: S_FONT_FAMILY.body.medium,
      flex: 1,
      lineHeight: scaled(18),
    },
  }), [colors, fonts, spacing, scaled, display]);

  if (!hasTeam) {
    return <SimpleCreateTeam onCreate={async (name, joinCode) => { await createTeam(name, joinCode); }} />;
  }

  // creatingSecondTeam is handled inline below with the toggle still visible

  // Inline rename (Race Day): the name is always an input styled as text;
  // focusing shows the surface bg + primary underline, blur/submit commits.
  const handleNameFocus = () => {
    setNewName(team!.name);
    setEditingName(true);
  };

  const handleNameCommit = async () => {
    setEditingName(false);
    const trimmed = newName.trim();
    if (trimmed === team!.name) return;
    if (trimmed.length < 2) {
      Alert.alert('Invalid', 'Team name must be at least 2 characters.');
      return;
    }
    try {
      await updateTeamName(trimmed);
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

  // League rank — match on BOTH user and league so a stale members array from
  // the user's other league never supplies the rank.
  const userId = team!.userId;
  const myLeagueMember = leagueMembers.find(
    m => m.userId === userId && m.leagueId === team!.leagueId,
  );
  const myRank = myLeagueMember?.rank;
  const leagueSize = leagueMembers.filter(m => m.leagueId === team!.leagueId).length;

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
      {/* Second-team switcher (kept from the previous UI; sits above the header) */}
      {(teamCount > 1 || canCreateSecondTeam || creatingSecondTeam) && (
        <View style={{ marginBottom: spacing.sm, alignSelf: 'flex-start' as const }}>
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
        </View>
      )}

      {/* Team Header — avatar · inline-editable name · lock pill / countdown */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleTeamAvatarTap} activeOpacity={0.7}>
          <Avatar name={team!.name} size={44} variant="team" imageUrl={team!.avatarUrl} />
        </TouchableOpacity>
        <TextInput
          style={[styles.nameInput, editingName && styles.nameInputFocused]}
          value={editingName ? newName : team!.name}
          onChangeText={setNewName}
          onFocus={handleNameFocus}
          onBlur={handleNameCommit}
          onSubmitEditing={handleNameCommit}
          maxLength={30}
          returnKeyType="done"
          numberOfLines={1}
        />
        {locked ? (
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={12} color={colors.locked} />
            <Text style={styles.lockText}>Locked</Text>
          </View>
        ) : (
          <SimpleCountdownBanner />
        )}
      </View>

      {/* Race Day stat bar */}
      <View style={styles.statsRow}>
        <SpeedLines />
        <View style={styles.statsEdge} />
        <View style={styles.statItem}>
          <Text style={styles.statValue} numberOfLines={1}>
            {(team!.totalPoints ?? 0) + (team!.lockedPoints ?? 0)}
          </Text>
          {lastRacePoints !== null ? (
            <Text style={[styles.statSub, { color: lastRacePoints >= 0 ? colors.positive : colors.negative }]}>
              {lastRacePoints >= 0 ? '+' : ''}{lastRacePoints} last
            </Text>
          ) : (
            <View style={{ height: scaled(15), marginTop: 3 }} />
          )}
          <Text style={styles.statLabel}>Points</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue} numberOfLines={1}>
            {myRank ? myRank : '—'}
            {myRank ? <Text style={{ fontSize: scaled(15), color: colors.text.muted }}>/{leagueSize}</Text> : null}
          </Text>
          <View style={{ height: scaled(15), marginTop: 3 }} />
          <Text style={styles.statLabel}>Rank</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue} numberOfLines={1}>${totalValue}</Text>
          {valueChange !== 0 ? (
            <Text style={[styles.statSub, { color: valueChange > 0 ? colors.positive : colors.negative }]}>
              {valueChange > 0 ? '+' : ''}{valueChange}
            </Text>
          ) : (
            <View style={{ height: scaled(15), marginTop: 3 }} />
          )}
          <Text style={styles.statLabel}>Value</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue} numberOfLines={1}>${budget}</Text>
          <View style={{ height: scaled(15), marginTop: 3 }} />
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
      <SectionLabel style={{ marginHorizontal: 0 }}>Drivers</SectionLabel>
      {enrichedDrivers.map((driver) => (
        <SimpleDriverRow
          key={driver.driverId}
          driver={driver}
          isAce={team!.aceDriverId === driver.driverId}
          locked={locked}
          aceLocked={aceLocked}
          lastRacePoints={lastRaceScores[driver.driverId]?.totalPoints ?? null}
          onRemove={() => {
            // estimateSaleQuote mirrors the server's fee exactly (3%/race
            // remaining, waived in grace period / for reserve picks) — the old
            // inline 10% math here quoted ~3.3x the fee actually charged.
            const quote = estimateSaleQuote(driver);
            Alert.alert(
              'Remove Driver',
              `Remove ${driver.name}?\n\nSale price: $${quote.marketPrice}${quote.earlyTermFee > 0 ? `\nEarly termination: -$${quote.earlyTermFee}\nYou receive: $${quote.saleReturn}` : '\nNo early termination fee'}`,
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
          <View style={[styles.emptySlotCircle, locked && { borderColor: colors.text.muted }]}>
            <Ionicons name="add" size={13} color={locked ? colors.text.muted : colors.primary} />
          </View>
          <Text style={[styles.emptySlotText, locked && { color: colors.text.muted }]}>
            Add driver ({emptyDriverSlots} slot{emptyDriverSlots !== 1 ? 's' : ''} remaining)
          </Text>
        </TouchableOpacity>
      )}

      {/* Constructor Section */}
      <SectionLabel style={{ marginHorizontal: 0 }}>Constructor</SectionLabel>
      {enrichedConstructor ? (
        <SimpleConstructorRow
          constructor={enrichedConstructor}
          isAce={team!.aceConstructorId === teamConstructor.constructorId}
          locked={locked}
          aceLocked={aceLocked}
          lastRacePoints={lastRaceScores[teamConstructor.constructorId]?.totalPoints ?? null}
          onRemove={() => {
            // Same shared quote as the actual charge (see driver onRemove).
            const quote = estimateSaleQuote(enrichedConstructor);
            Alert.alert(
              'Remove Constructor',
              `Remove ${teamConstructor.name}?\n\nSale price: $${quote.marketPrice}${quote.earlyTermFee > 0 ? `\nEarly termination: -$${quote.earlyTermFee}\nYou receive: $${quote.saleReturn}` : '\nNo early termination fee'}`,
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
          <View style={[styles.emptySlotCircle, locked && { borderColor: colors.text.muted }]}>
            <Ionicons name="add" size={13} color={locked ? colors.text.muted : colors.primary} />
          </View>
          <Text style={[styles.emptySlotText, locked && { color: colors.text.muted }]}>
            Add constructor
          </Text>
        </TouchableOpacity>
      )}

      {/* Ready banner */}
      {isFull && !locked && (
        <View style={styles.readyBanner}>
          <View style={styles.readyCheck}>
            <Ionicons name="checkmark" size={13} color="#FFFFFF" />
          </View>
          <Text style={styles.readyText}>
            {lockoutInfo.nextRace
              ? `Your team is full and ready for ${lockoutInfo.nextRace.name}.`
              : 'Your team is complete.'}
          </Text>
        </View>
      )}
      </>)}
    </ScrollView>
  );
});
