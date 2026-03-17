import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_COLORS, S_FONTS, S_SPACING, S_RADIUS, sCard } from '../theme/simpleTheme';
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
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingSecondTeam, setCreatingSecondTeam] = useState(false);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const leagueMembers = useLeagueStore((s) => s.members);
  const driverPrices = useAdminStore((s) => s.driverPrices);
  const constructorPrices = useAdminStore((s) => s.constructorPrices);
  const setCurrentTeam = useTeamStore((s) => s.setCurrentTeam);

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

  const handleToggleAce = async (driverId: string) => {
    if (locked) return;
    if (team!.aceDriverId === driverId) {
      await clearAce();
    } else {
      await setAce(driverId);
    }
  };

  const handleToggleAceConstructor = async () => {
    if (locked || !teamConstructor) return;
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={S_COLORS.primary} />
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
              <Ionicons name="checkmark" size={18} color={S_COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingName(false)} style={styles.editNameBtn}>
              <Ionicons name="close" size={18} color={S_COLORS.text.muted} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={handleEditName} style={styles.nameRow} activeOpacity={0.7}>
            <Text style={styles.teamName}>{team!.name}</Text>
            <Ionicons name="pencil" size={14} color={S_COLORS.text.muted} />
          </TouchableOpacity>
        )}
        <SimpleCountdownBanner />
        {locked && (
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={12} color={S_COLORS.locked} />
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
        <View style={[styles.statItem, { marginLeft: S_SPACING.sm }]}>
          <Text style={styles.statValue}>
            {(() => {
              // Use league member totalPoints as authoritative (includes qualifying, sprint, expired drivers)
              const userId = team!.userId;
              const leagueMember = leagueMembers.find(m => m.userId === userId);
              const leaguePts = leagueMember?.totalPoints ?? 0;
              const teamPts = team!.totalPoints ?? 0;
              const computedPts = enrichedDrivers.reduce((s, d) => s + (d.pointsScored || 0), 0)
                + (enrichedConstructor?.pointsScored || 0) + (team!.lockedPoints || 0);
              return Math.max(leaguePts, teamPts, computedPts);
            })()}
          </Text>
          <Text style={styles.statLabel}>Points</Text>
        </View>
        <View style={[styles.statItem, styles.statDivider]}>
          <Text style={styles.statValue}>${totalValue}</Text>
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
          <Ionicons name="add-circle-outline" size={22} color={locked ? S_COLORS.text.muted : S_COLORS.primary} />
          <Text style={[styles.emptySlotText, locked && { color: S_COLORS.text.muted }]}>
            Add driver ({emptyDriverSlots} slot{emptyDriverSlots !== 1 ? 's' : ''} remaining)
          </Text>
        </TouchableOpacity>
      )}

      {/* Constructor Section */}
      <Text style={[styles.sectionTitle, { marginTop: S_SPACING.lg }]}>Constructor</Text>
      {enrichedConstructor ? (
        <SimpleConstructorRow
          constructor={enrichedConstructor}
          isAce={team!.aceConstructorId === teamConstructor.constructorId}
          locked={locked}
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
          <Ionicons name="add-circle-outline" size={22} color={locked ? S_COLORS.text.muted : S_COLORS.primary} />
          <Text style={[styles.emptySlotText, locked && { color: S_COLORS.text.muted }]}>
            Add constructor
          </Text>
        </TouchableOpacity>
      )}

      {/* Ready banner */}
      {isFull && !locked && (
        <View style={styles.readyBanner}>
          <Ionicons name="checkmark-circle" size={16} color={S_COLORS.positive} />
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

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: S_SPACING.lg,
    paddingBottom: S_SPACING.xxl + 40, // room for profile pill
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: S_SPACING.md,
    gap: S_SPACING.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S_SPACING.xs,
    flex: 1,
  },
  teamName: {
    fontSize: S_FONTS.sizes.xxl,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.text.primary,
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: S_SPACING.xs,
  },
  editNameInput: {
    flex: 1,
    fontSize: S_FONTS.sizes.xl,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.primary,
    borderBottomWidth: 2,
    borderBottomColor: S_COLORS.primary,
    paddingVertical: S_SPACING.xs,
  },
  editNameBtn: {
    padding: S_SPACING.xs,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: S_COLORS.lockedBg,
    paddingHorizontal: S_SPACING.sm,
    paddingVertical: S_SPACING.xs,
    borderRadius: S_RADIUS.pill,
  },
  lockText: {
    fontSize: S_FONTS.sizes.xs,
    color: S_COLORS.locked,
    fontWeight: S_FONTS.weights.medium,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: S_COLORS.card,
    borderRadius: S_RADIUS.md,
    paddingVertical: S_SPACING.lg,
    paddingHorizontal: S_SPACING.sm,
    marginBottom: S_SPACING.lg,
    borderWidth: 1,
    borderColor: S_COLORS.borderLight,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: S_COLORS.borderLight,
  },
  statValue: {
    fontSize: S_FONTS.sizes.hero,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.text.primary,
  },
  statLabel: {
    fontSize: S_FONTS.sizes.sm,
    color: S_COLORS.text.muted,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: S_FONTS.sizes.sm,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: S_SPACING.sm,
  },
  emptySlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S_SPACING.sm,
    backgroundColor: S_COLORS.surface,
    borderRadius: S_RADIUS.md,
    borderWidth: 1,
    borderColor: S_COLORS.border,
    borderStyle: 'dashed',
    padding: S_SPACING.md,
    marginBottom: S_SPACING.sm,
  },
  emptySlotText: {
    fontSize: S_FONTS.sizes.md,
    color: S_COLORS.primary,
    fontWeight: S_FONTS.weights.medium,
  },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S_SPACING.sm,
    backgroundColor: '#E8F5E9',
    borderRadius: S_RADIUS.md,
    padding: S_SPACING.md,
    marginTop: S_SPACING.lg,
  },
  readyText: {
    fontSize: S_FONTS.sizes.md,
    color: S_COLORS.positive,
    fontWeight: S_FONTS.weights.medium,
    flex: 1,
  },
});
