import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { S_RADIUS, S_FONTS } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import type { LeagueMember } from '../../types';

interface Props {
  member: LeagueMember;
  isCurrentUser: boolean;
  onPress: () => void;
  showLastRace?: boolean;
  lastRacePoints?: number;
}

export const SimpleStandingsRow = React.memo(function SimpleStandingsRow({
  member,
  isCurrentUser,
  onPress,
  showLastRace,
  lastRacePoints,
}: Props) {
  const { colors, fonts, spacing } = useSimpleTheme();

  const rankColors: Record<number, string> = useMemo(() => ({
    1: colors.gold,
    2: colors.silver,
    3: colors.bronze,
  }), [colors]);

  const rankColor = rankColors[member.rank] ?? colors.text.secondary;
  const displayPoints = showLastRace ? (lastRacePoints ?? 0) : member.totalPoints;
  const pointsColor = showLastRace
    ? (displayPoints > 0 ? colors.positive : displayPoints < 0 ? colors.negative : colors.text.muted)
    : colors.primary;

  const styles = useMemo(() => ({
    container: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.background,
      borderRadius: S_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    currentUser: {
      backgroundColor: colors.primaryFaint,
      borderColor: colors.primaryLight,
    },
    rank: {
      width: 28,
      fontSize: fonts.lg,
      fontWeight: S_FONTS.weights.bold,
      textAlign: 'center' as const,
      marginRight: spacing.sm,
    },
    info: {
      flex: 1,
      marginLeft: spacing.sm,
    },
    name: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.primary,
    },
    displayName: {
      fontSize: fonts.sm,
      color: colors.text.muted,
      marginTop: 1,
    },
    stats: {
      alignItems: 'flex-end' as const,
      marginLeft: spacing.sm,
    },
    points: {
      fontSize: fonts.md,
      fontWeight: S_FONTS.weights.bold,
      color: colors.primary,
    },
    subLabel: {
      fontSize: fonts.xs,
      color: colors.text.muted,
      marginTop: 1,
    },
  }), [colors, fonts, spacing]);

  return (
    <TouchableOpacity
      style={[styles.container, isCurrentUser && styles.currentUser]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text style={[styles.rank, { color: rankColor }]}>{member.rank}</Text>

      <Avatar
        name={member.teamName || member.displayName}
        size="small"
        imageUrl={member.teamAvatarUrl}
      />

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {member.teamName || member.displayName}
        </Text>
        <Text style={styles.displayName} numberOfLines={1}>
          {member.displayName}
        </Text>
      </View>

      <View style={styles.stats}>
        <Text style={[styles.points, { color: pointsColor }]}>
          {showLastRace && displayPoints > 0 ? '+' : ''}{displayPoints} pts
        </Text>
        {showLastRace && (
          <Text style={styles.subLabel}>last race</Text>
        )}
      </View>
    </TouchableOpacity>
  );
});
