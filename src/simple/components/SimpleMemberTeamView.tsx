import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SimpleDriverRow } from './SimpleDriverRow';
import { SimpleConstructorRow } from './SimpleConstructorRow';
import { teamService } from '../../services/team.service';
import { S_RADIUS, S_FONTS } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { BUDGET } from '../../config/constants';
import type { FantasyTeam, LeagueMember } from '../../types';

interface Props {
  member: LeagueMember;
  leagueId: string;
  onBack: () => void;
}

export function SimpleMemberTeamView({ member, leagueId, onBack }: Props) {
  const { colors, fonts, spacing } = useSimpleTheme();
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

  const styles = useMemo(() => ({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    backButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: spacing.md,
      paddingBottom: spacing.sm,
    },
    backText: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.medium,
      color: colors.primary,
      marginLeft: spacing.xs,
    },
    center: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      padding: spacing.xl,
    },
    errorText: {
      fontSize: fonts.md,
      color: colors.negative,
      textAlign: 'center' as const,
    },
    emptyText: {
      fontSize: fonts.md,
      color: colors.text.muted,
      textAlign: 'center' as const,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: spacing.lg,
      paddingTop: spacing.sm,
    },
    teamName: {
      fontSize: fonts.xl,
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.primary,
      marginBottom: spacing.md,
    },
    statsRow: {
      flexDirection: 'row' as const,
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    statBox: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: S_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      alignItems: 'center' as const,
    },
    statValue: {
      fontSize: fonts.lg,
      fontWeight: S_FONTS.weights.bold,
      color: colors.text.primary,
    },
    statLabel: {
      fontSize: fonts.xs,
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
      marginTop: spacing.sm,
    },
    emptySlot: {
      fontSize: fonts.md,
      color: colors.text.muted,
      fontStyle: 'italic' as const,
      padding: spacing.md,
      textAlign: 'center' as const,
    },
  }), [colors, fonts, spacing]);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.6}>
        <Ionicons name="arrow-back" size={20} color={colors.primary} />
        <Text style={styles.backText}>Standings</Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
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
