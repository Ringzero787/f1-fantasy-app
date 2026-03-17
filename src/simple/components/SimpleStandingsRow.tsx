import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { S_COLORS, S_FONTS, S_SPACING, S_RADIUS } from '../theme/simpleTheme';
import type { LeagueMember } from '../../types';

interface Props {
  member: LeagueMember;
  isCurrentUser: boolean;
  onPress: () => void;
  showLastRace?: boolean;
  lastRacePoints?: number;
}

const RANK_COLORS: Record<number, string> = {
  1: S_COLORS.gold,
  2: S_COLORS.silver,
  3: S_COLORS.bronze,
};

export const SimpleStandingsRow = React.memo(function SimpleStandingsRow({
  member,
  isCurrentUser,
  onPress,
  showLastRace,
  lastRacePoints,
}: Props) {
  const rankColor = RANK_COLORS[member.rank] ?? S_COLORS.text.secondary;
  const displayPoints = showLastRace ? (lastRacePoints ?? 0) : member.totalPoints;
  const pointsColor = showLastRace
    ? (displayPoints > 0 ? S_COLORS.positive : displayPoints < 0 ? S_COLORS.negative : S_COLORS.text.muted)
    : S_COLORS.primary;

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

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: S_COLORS.background,
    borderRadius: S_RADIUS.md,
    borderWidth: 1,
    borderColor: S_COLORS.borderLight,
    padding: S_SPACING.md,
    marginBottom: S_SPACING.sm,
  },
  currentUser: {
    backgroundColor: S_COLORS.primaryFaint,
    borderColor: S_COLORS.primaryLight,
  },
  rank: {
    width: 28,
    fontSize: S_FONTS.sizes.lg,
    fontWeight: S_FONTS.weights.bold,
    textAlign: 'center',
    marginRight: S_SPACING.sm,
  },
  info: {
    flex: 1,
    marginLeft: S_SPACING.sm,
  },
  name: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.primary,
  },
  displayName: {
    fontSize: S_FONTS.sizes.sm,
    color: S_COLORS.text.muted,
    marginTop: 1,
  },
  stats: {
    alignItems: 'flex-end',
    marginLeft: S_SPACING.sm,
  },
  points: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.primary,
  },
  subLabel: {
    fontSize: S_FONTS.sizes.xs,
    color: S_COLORS.text.muted,
    marginTop: 1,
  },
});
