import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { teamService } from '../../services/team.service';
import { useTeamStore } from '../../store/team.store';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { useRaceScoresStore } from '../../store/raceScores.store';
import { TEAM_SIZE } from '../../config/constants';
import { PRICING_CONFIG } from '../../config/pricing.config';
import { constructorShortName, driverNumber } from './entityNames';
import { MonoLabel, ScreenHeader } from './GridBits';
import { GridTile } from './GridTile';
import { GridTileSheet, sheetTargetFor, type SheetTarget } from './GridTileSheet';
import { computeTiles, rosterRacePoints, openSlotCount, lineupStatus, rosterConstructor } from './tileState';
import type { FantasyTeam, LeagueMember } from '../../types';

interface Props {
  member: LeagueMember;
  leagueId: string;
}

// Read-only Team layout for another player (TRANSITION.md §1 "Member team view").
export function GridMemberTeam({ member, leagueId }: Props) {
  const { colors, family, spacing, scaled, mono } = useSimpleTheme();
  const { width } = useWindowDimensions();
  const remoteDrivers = useRemoteConfigStore((s) => s.drivers);
  const lastRaceScores = useRaceScoresStore((s) => s.lastRaceScores);
  const prevRaceScores = useRaceScoresStore((s) => s.prevRaceScores);
  const fetchLastRaceScores = useRaceScoresStore((s) => s.fetchLastRaceScores);
  const [team, setTeam] = useState<FantasyTeam | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sheet, setSheet] = useState<SheetTarget | null>(null);

  useEffect(() => { fetchLastRaceScores(); }, [fetchLastRaceScores]);
  const userTeams = useTeamStore((s) => s.userTeams);
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    // Own row: the roster is already in the store (and demo mode has no server).
    const mine = userTeams.find((t) => t.userId === member.userId && t.leagueId === leagueId);
    if (mine) { setTeam(mine); setState('ready'); return; }
    teamService.getUserTeamInLeague(member.userId, leagueId)
      .then((t) => { if (!cancelled) { setTeam(t); setState('ready'); } })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [member.userId, leagueId, userTeams]);

  const tiles = useMemo(() => {
    if (!team) return [];
    const numbers: Record<string, number | undefined> = {};
    for (const d of remoteDrivers) numbers[d.id] = d.number;
    for (const d of team.drivers ?? []) if (numbers[d.driverId] == null) numbers[d.driverId] = driverNumber(d.driverId) ?? undefined;
    const last: Record<string, number> = {};
    for (const [id, s] of Object.entries(lastRaceScores)) last[id] = s.totalPoints;
    const prev: Record<string, number> = {};
    for (const [id, s] of Object.entries(prevRaceScores)) prev[id] = s.totalPoints;
    const c = rosterConstructor(team);
    const constructorNames: Record<string, string> = {};
    if (c) constructorNames[c.constructorId] = constructorShortName(c.constructorId, c.name);
    return computeTiles(team, { teamSize: TEAM_SIZE, defaultContract: PRICING_CONFIG.CONTRACT_LENGTH, lastRace: last, prevRace: prev, numbers, showCarNumbers: true, constructorNames });
  }, [team, remoteDrivers, lastRaceScores, prevRaceScores]);

  const lastPoints = useMemo(() => {
    if (!team) return null;
    const scores: Record<string, number> = {};
    for (const [id, s] of Object.entries(lastRaceScores)) scores[id] = s.totalPoints;
    return rosterRacePoints(team, scores);
  }, [team, lastRaceScores]);

  const gutter = spacing.xl;
  const isTablet = width >= 600;
  const tileWidth = isTablet ? undefined : (width - gutter * 2 - 10) / 2;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 12, paddingBottom: 34 }} showsVerticalScrollIndicator={false}>
      <ScreenHeader
        statusLeft="← BACK"
        onStatusLeftPress={() => router.back()}
        statusRight={member.displayName.toUpperCase()}
        statusRightAccent={false}
        title={team?.name ?? member.teamName ?? 'Team'}
      />
      {state === 'loading' ? (
        <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : state === 'error' || !team ? (
        <Text style={[mono(11, 'medium'), { color: colors.text.muted, padding: gutter }]}>THIS TEAM ISN'T VISIBLE RIGHT NOW.</Text>
      ) : (
        <>
          <View style={{ marginHorizontal: gutter, marginTop: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ gap: 2, flexShrink: 1 }}>
              <MonoLabel>SEASON PTS</MonoLabel>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: family.ui.black, fontSize: scaled(56), lineHeight: scaled(56) * 0.95, letterSpacing: -scaled(56) * 0.05, color: colors.text.primary, includeFontPadding: false }}>
                {((team.totalPoints ?? 0) + (team.lockedPoints ?? 0)).toLocaleString()}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 18, alignItems: 'flex-end' }}>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <MonoLabel>LAST RACE</MonoLabel>
                <Text style={{ fontFamily: family.ui.bold, fontSize: scaled(22), lineHeight: scaled(24), color: colors.primary }}>{lastPoints == null ? '—' : `${lastPoints >= 0 ? '+' : ''}${lastPoints}`}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <MonoLabel>RANK</MonoLabel>
                <Text style={{ fontFamily: family.ui.bold, fontSize: scaled(22), lineHeight: scaled(24), color: colors.text.primary }}>{member.rank ? `P${member.rank}` : '—'}</Text>
              </View>
            </View>
          </View>
          <View style={{ marginHorizontal: gutter, marginTop: 14 }}>
            <MonoLabel>LINEUP · {lineupStatus(openSlotCount(tiles), false).text}</MonoLabel>
          </View>
          <View style={{ paddingHorizontal: gutter, paddingTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {tiles.map((tile, i) => (
              <View key={tile.kind === 'empty' ? `empty-${i}` : tile.id} style={isTablet ? { width: '31%', flexGrow: 1 } : { width: tileWidth }}>
                <GridTile
                  tile={tile}
                  locked
                  aceLocked
                  readOnly
                  onOpen={(t) => {
                    if (t.kind === 'empty' || !team) return;
                    const d = (team.drivers ?? []).find((x) => x.driverId === t.id);
                    const c = rosterConstructor(team);
                    if (d) setSheet(sheetTargetFor('driver', d, { number: t.kind === 'driver' ? t.tag : undefined, isAce: team.aceDriverId === t.id }));
                    else if (c && c.constructorId === t.id) setSheet(sheetTargetFor('constructor', c, { isAce: team.aceConstructorId === t.id }));
                  }}
                />
              </View>
            ))}
          </View>
        </>
      )}
      <GridTileSheet target={sheet} onClose={() => setSheet(null)} />
    </ScrollView>
  );
}
