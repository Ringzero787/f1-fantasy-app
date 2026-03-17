import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SimpleDriverRow } from './SimpleDriverRow';
import { SimpleConstructorRow } from './SimpleConstructorRow';
import { teamService } from '../../services/team.service';
import { S_COLORS, S_FONTS, S_SPACING, S_RADIUS } from '../theme/simpleTheme';
import { BUDGET } from '../../config/constants';
import type { FantasyTeam, LeagueMember } from '../../types';

interface Props {
  member: LeagueMember;
  leagueId: string;
  onBack: () => void;
}

export function SimpleMemberTeamView({ member, leagueId, onBack }: Props) {
  const [team, setTeam] = useState<FantasyTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTeam() {
      setLoading(true);
      setError(null);
      try {
        const result = await teamService.getUserTeamInLeague(member.userId, leagueId);
        if (!cancelled) {
          setTeam(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load team');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTeam();
    return () => { cancelled = true; };
  }, [member.userId, leagueId]);

  const teamConstructor = team
    ? (team as Record<string, any>)['constructor'] ?? null
    : null;

  const teamValue = team
    ? (team.drivers?.reduce((sum, d) => sum + (d.currentPrice ?? d.purchasePrice), 0) ?? 0)
      + (teamConstructor?.currentPrice ?? teamConstructor?.purchasePrice ?? 0)
    : 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.6}>
        <Ionicons name="arrow-back" size={20} color={S_COLORS.primary} />
        <Text style={styles.backText}>Standings</Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={S_COLORS.primary} />
        </View>
      )}

      {error && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && !error && !team && (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No team found for this member.</Text>
        </View>
      )}

      {!loading && !error && team && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.teamName}>{team.name}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{team.totalPoints}</Text>
              <Text style={styles.statLabel}>Points</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>${teamValue}</Text>
              <Text style={styles.statLabel}>Team Value</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>${team.budget ?? BUDGET}</Text>
              <Text style={styles.statLabel}>Budget</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Drivers</Text>
          {team.drivers && team.drivers.length > 0 ? (
            team.drivers.map((driver) => (
              <SimpleDriverRow
                key={driver.driverId}
                driver={driver}
                isAce={team.aceDriverId === driver.driverId}
                locked={true}
              />
            ))
          ) : (
            <Text style={styles.emptySlot}>No drivers selected</Text>
          )}

          <Text style={styles.sectionTitle}>Constructor</Text>
          {teamConstructor ? (
            <SimpleConstructorRow
              constructor={teamConstructor}
              isAce={team.aceConstructorId === teamConstructor.constructorId}
              locked={true}
            />
          ) : (
            <Text style={styles.emptySlot}>No constructor selected</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: S_COLORS.background,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: S_SPACING.md,
    paddingBottom: S_SPACING.sm,
  },
  backText: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.medium,
    color: S_COLORS.primary,
    marginLeft: S_SPACING.xs,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: S_SPACING.xl,
  },
  errorText: {
    fontSize: S_FONTS.sizes.md,
    color: S_COLORS.negative,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: S_FONTS.sizes.md,
    color: S_COLORS.text.muted,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: S_SPACING.lg,
    paddingTop: S_SPACING.sm,
  },
  teamName: {
    fontSize: S_FONTS.sizes.xl,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.text.primary,
    marginBottom: S_SPACING.md,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: S_SPACING.lg,
    gap: S_SPACING.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: S_COLORS.surface,
    borderRadius: S_RADIUS.md,
    borderWidth: 1,
    borderColor: S_COLORS.borderLight,
    padding: S_SPACING.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: S_FONTS.sizes.lg,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.text.primary,
  },
  statLabel: {
    fontSize: S_FONTS.sizes.xs,
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
    marginTop: S_SPACING.sm,
  },
  emptySlot: {
    fontSize: S_FONTS.sizes.md,
    color: S_COLORS.text.muted,
    fontStyle: 'italic',
    padding: S_SPACING.md,
    textAlign: 'center',
  },
});
