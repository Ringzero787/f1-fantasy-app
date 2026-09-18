import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, RefreshControl, Alert, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { useSimpleTeam } from '../hooks/useSimpleTeam';
import { useLockoutStatus } from '../../hooks/useLockoutStatus';
import { useAuthStore } from '../../store/auth.store';
import { useLeagueStore } from '../../store/league.store';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { useRaceScoresStore } from '../../store/raceScores.store';
import { TEAM_SIZE } from '../../config/constants';
import { PRICING_CONFIG } from '../../config/pricing.config';
import { maybeRequestReview } from '../../utils/reviewPrompt';
import { SimpleCreateTeam } from '../components/SimpleCreateTeam';
import { constructorShortName, driverNumber } from '../components/RaceDayBits';
import { GridAvatar, MonoLabel, ScreenHeader } from './GridBits';
import { GridTile } from './GridTile';
import { computeTiles, lineupStatus, openSlotCount, rosterRacePoints, type GridTile as Tile } from './tileState';
import { formatLockStatus, formatRoundStatus, seasonProgress } from './lockStatus';

interface Props {
  refreshing: boolean;
  onRefresh: () => void;
}

// Header + stat row + lineup label + 2-column tile grid (TRANSITION.md §4).
export const GridTeamPanel = React.memo(function GridTeamPanel({ refreshing, onRefresh }: Props) {
  const { colors, family, spacing, scaled, mono, title } = useSimpleTheme();
  const { width } = useWindowDimensions();
  const {
    team, hasTeam, createTeam, setAce, setAceConstructor, clearAce, updateTeamName,
    teamCount, activeTeamIndex, canCreateSecondTeam, switchTeam,
  } = useSimpleTeam();
  const lockoutInfo = useLockoutStatus();
  const user = useAuthStore((s) => s.user);
  const races = useRemoteConfigStore((s) => s.races);
  const remoteDrivers = useRemoteConfigStore((s) => s.drivers);
  const leagueMembers = useLeagueStore((s) => s.members);
  const loadLeagueMembers = useLeagueStore((s) => s.loadLeagueMembers);
  const lastRaceScores = useRaceScoresStore((s) => s.lastRaceScores);
  const prevRaceScores = useRaceScoresStore((s) => s.prevRaceScores);
  const fetchLastRaceScores = useRaceScoresStore((s) => s.fetchLastRaceScores);

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingSecondTeam, setCreatingSecondTeam] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => { fetchLastRaceScores(); }, [fetchLastRaceScores]);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (team?.leagueId) loadLeagueMembers(team.leagueId);
  }, [team?.leagueId, loadLeagueMembers]);

  const locked = lockoutInfo.isLocked || !(team?.lockStatus?.canModify ?? true);
  const aceLocked = lockoutInfo.aceLocked;

  // Review prompt once the lineup is complete (kept from Race Day).
  const tiles = useMemo<Tile[]>(() => {
    if (!team) return [];
    const numbers: Record<string, number | undefined> = {};
    for (const d of remoteDrivers) numbers[d.id] = d.number;
    for (const d of team.drivers ?? []) if (numbers[d.driverId] == null) numbers[d.driverId] = driverNumber(d.driverId) ?? undefined;
    const last: Record<string, number> = {};
    for (const [id, s] of Object.entries(lastRaceScores)) last[id] = s.totalPoints;
    const prev: Record<string, number> = {};
    for (const [id, s] of Object.entries(prevRaceScores)) prev[id] = s.totalPoints;
    const constructorNames: Record<string, string> = {};
    const c = (team as unknown as { constructor?: { constructorId: string; name: string } | null }).constructor;
    if (c && typeof c === 'object') constructorNames[c.constructorId] = constructorShortName(c.constructorId, c.name);
    return computeTiles(team, {
      teamSize: TEAM_SIZE,
      defaultContract: PRICING_CONFIG.CONTRACT_LENGTH,
      lastRace: last,
      prevRace: prev,
      numbers,
      showCarNumbers: true,
      constructorNames,
    });
  }, [team, remoteDrivers, lastRaceScores, prevRaceScores]);

  const open = openSlotCount(tiles);
  const isFull = hasTeam && open === 0;
  const reviewed = React.useRef(false);
  useEffect(() => {
    if (isFull && !reviewed.current) { reviewed.current = true; maybeRequestReview(); }
  }, [isFull]);

  // One season only: the races collection is ordered by round, not filtered.
  const seasonId = lockoutInfo.nextRace?.seasonId ?? races[races.length - 1]?.seasonId;
  const seasonLength = seasonId ? races.filter((r) => r.seasonId === seasonId).length : races.length;
  const nextRound = lockoutInfo.nextRace?.round ?? null;
  const completedRounds = nextRound ? nextRound - 1 : seasonLength;
  const roundStatus = formatRoundStatus(nextRound, seasonLength, lockoutInfo.nextRace?.city || lockoutInfo.nextRace?.country);
  const lockStatus = formatLockStatus({
    isLocked: lockoutInfo.isLocked,
    lockTime: lockoutInfo.lockTime,
    qualifyingTime: lockoutInfo.nextRace ? new Date(lockoutInfo.nextRace.schedule.qualifying) : null,
    raceStartTime: lockoutInfo.raceStartTime,
    hasNextRace: !!lockoutInfo.nextRace,
    now,
  });

  const lastPoints = useMemo(() => {
    if (!team) return null;
    const scores: Record<string, number> = {};
    for (const [id, s] of Object.entries(lastRaceScores)) scores[id] = s.totalPoints;
    return rosterRacePoints(team, scores);
  }, [team, lastRaceScores]);

  const myMember = team ? leagueMembers.find((m) => m.userId === team.userId && m.leagueId === team.leagueId) : undefined;
  const leagueSize = team ? leagueMembers.filter((m) => m.leagueId === team.leagueId).length : 0;

  const goPicker = useCallback((slot?: 'driver' | 'constructor') => {
    router.push({ pathname: '/(simple)/picker', params: slot ? { tab: slot } : {} } as never);
  }, []);
  const goProfile = useCallback(() => router.push('/(simple)/profile' as never), []);

  const handleNameCommit = async () => {
    setEditingName(false);
    const trimmed = newName.trim();
    if (!team || trimmed === team.name) return;
    if (trimmed.length < 2) { Alert.alert('Invalid', 'Team name must be at least 2 characters.'); return; }
    try { await updateTeamName(trimmed); } catch { Alert.alert('Error', 'Failed to update team name.'); }
  };

  const handleToggleAce = async (tile: Tile) => {
    if (!team || aceLocked || tile.kind === 'empty') return;
    try {
      if (tile.ace) await clearAce();
      else if (tile.kind === 'driver') await setAce(tile.id);
      else await setAceConstructor(tile.id);
    } catch (e) {
      Alert.alert('Ace', e instanceof Error ? e.message : 'Could not change your ace.');
    }
  };

  if (!hasTeam) {
    return <SimpleCreateTeam onCreate={async (name, joinCode) => { await createTeam(name, joinCode); }} />;
  }

  const status = lineupStatus(open, locked);
  const editColor = locked ? colors.text.muted : open > 0 ? colors.primary : colors.text.primary;
  const gutter = spacing.xl;
  const isTablet = width >= 600;
  const tileWidth = isTablet ? undefined : (width - gutter * 2 - 10) / 2;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: spacing.md }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <ScreenHeader
        statusLeft={roundStatus}
        statusRight={lockStatus}
        titleNode={
          <View style={{ flex: 1, minWidth: 0 }}>
            <TextInput
              style={[title, { width: '100%', paddingVertical: 0, borderBottomWidth: 1, borderBottomColor: editingName ? colors.primary : 'transparent' }]}
              value={editingName ? newName : team!.name}
              onChangeText={setNewName}
              onFocus={() => { setNewName(team!.name); setEditingName(true); }}
              onBlur={handleNameCommit}
              onSubmitEditing={handleNameCommit}
              maxLength={30}
              returnKeyType="done"
              numberOfLines={1}
              accessibilityLabel="Team name, tap to edit"
            />
          </View>
        }
        right={<View style={{ flexShrink: 0 }}><GridAvatar name={user?.displayName} imageUrl={user?.photoURL} onPress={goProfile} /></View>}
      >
        {/* 3px season progress bar */}
        <View style={{ height: 3, backgroundColor: colors.card, borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(seasonProgress(completedRounds, seasonLength) * 100)}%`, height: '100%', backgroundColor: colors.text.primary }} />
        </View>
      </ScreenHeader>

      {/* Second-team switcher — only when there is (or can be) a second team */}
      {(teamCount > 1 || canCreateSecondTeam || creatingSecondTeam) && (
        <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: gutter, marginTop: 10 }}>
          {Array.from({ length: creatingSecondTeam ? 2 : teamCount }, (_, i) => {
            const active = creatingSecondTeam ? i === 1 : i === activeTeamIndex;
            return (
              <Pressable key={i} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Team ${i + 1}`} accessibilityState={{ selected: active }} onPress={() => { if (creatingSecondTeam && i === 0) setCreatingSecondTeam(false); else if (!creatingSecondTeam) switchTeam(i); }}>
                <MonoLabel color={active ? colors.text.primary : colors.text.muted}>{active ? '● ' : '○ '}TEAM {i + 1}</MonoLabel>
              </Pressable>
            );
          })}
          {canCreateSecondTeam && !creatingSecondTeam && (
            <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel="New team" onPress={() => Alert.alert('Create a second team?', 'You can have up to 2 teams — one for each league or solo play.', [
              { text: 'Not now', style: 'cancel' },
              { text: 'Create', onPress: () => setCreatingSecondTeam(true) },
            ])}>
              <MonoLabel color={colors.primary}>+ NEW TEAM</MonoLabel>
            </Pressable>
          )}
        </View>
      )}

      {creatingSecondTeam ? (
        <SimpleCreateTeam
          isSecondTeam
          onCreate={async (name, joinCode) => { await createTeam(name, joinCode); setCreatingSecondTeam(false); }}
          onCancel={() => setCreatingSecondTeam(false)}
        />
      ) : (
        <>
          {/* Stat row: SEASON PTS · LAST RACE · RANK */}
          <View style={{ marginHorizontal: gutter, marginTop: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ gap: 2, flexShrink: 1 }}>
              <MonoLabel>SEASON PTS</MonoLabel>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ fontFamily: family.ui.black, fontSize: scaled(56), lineHeight: scaled(56) * 0.95, letterSpacing: -scaled(56) * 0.05, color: colors.text.primary, includeFontPadding: false }}
              >
                {((team!.totalPoints ?? 0) + (team!.lockedPoints ?? 0)).toLocaleString()}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 18, alignItems: 'flex-end' }}>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <MonoLabel>LAST RACE</MonoLabel>
                <Text style={{ fontFamily: family.ui.bold, fontSize: scaled(22), lineHeight: scaled(24), letterSpacing: -scaled(22) * 0.02, color: lastPoints != null && lastPoints < 0 ? colors.negative : colors.primary }}>
                  {lastPoints == null ? '—' : `${lastPoints >= 0 ? '+' : ''}${lastPoints}`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <MonoLabel>RANK</MonoLabel>
                <Text style={{ fontFamily: family.ui.bold, fontSize: scaled(22), lineHeight: scaled(24), letterSpacing: -scaled(22) * 0.02, color: colors.text.primary }}>
                  {myMember?.rank ? myMember.rank : '—'}
                  {myMember?.rank ? <Text style={{ fontSize: scaled(13), color: colors.text.muted }}>/{leagueSize}</Text> : null}
                </Text>
              </View>
            </View>
          </View>

          {/* Lineup label + EDIT → */}
          <View style={{ marginHorizontal: gutter, marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <MonoLabel color={status.accent ? colors.primary : colors.text.muted}>LINEUP · {status.text}</MonoLabel>
            <Pressable
              onPress={locked ? undefined : () => goPicker()}
              disabled={locked}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={locked ? 'Lineup locked' : 'Edit lineup'}
              style={({ pressed }) => ({ borderBottomWidth: 1, borderBottomColor: editColor, paddingBottom: 2, opacity: pressed ? 0.6 : 1 })}
            >
              <MonoLabel color={editColor}>{locked ? 'LOCKED' : 'EDIT →'}</MonoLabel>
            </Pressable>
          </View>

          {/* 2-column tile grid */}
          <View style={{ paddingHorizontal: gutter, paddingTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {tiles.map((tile, i) => (
              <View key={tile.kind === 'empty' ? `empty-${i}` : tile.id} style={isTablet ? { width: '31%', flexGrow: 1 } : { width: tileWidth }}>
                <GridTile
                  tile={tile}
                  locked={locked}
                  aceLocked={aceLocked}
                  onOpenSlot={goPicker}
                  onToggleAce={handleToggleAce}
                />
              </View>
            ))}
          </View>
          <View style={{ height: scaled(6) }} />
          <Text style={[mono(10, 'medium'), { color: colors.text.muted, paddingHorizontal: gutter, marginTop: 8 }]}>
            {aceLocked ? 'ACE LOCKED FOR THIS ROUND' : 'TAP ACE ON A TILE FOR 2× POINTS'}
          </Text>
        </>
      )}
    </ScrollView>
  );
});
