import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { S_RADIUS, S_FONT_FAMILY } from '../theme/simpleTheme';
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
  const { colors, scaled, display } = useSimpleTheme();

  const rankColors: Record<number, string> = useMemo(() => ({
    1: colors.gold,
    2: colors.silver,
    3: colors.bronze,
  }), [colors]);

  const rankColor = rankColors[member.rank] ?? colors.text.muted;
  const displayPoints = showLastRace ? (lastRacePoints ?? 0) : member.totalPoints;

  const styles = useMemo(() => ({
    container: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: scaled(14),
      backgroundColor: colors.card,
      borderRadius: S_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: scaled(14),
      paddingHorizontal: scaled(16),
      marginBottom: 10,
    },
    currentUser: {
      backgroundColor: colors.primaryFaint + '88',
      borderColor: colors.primary + '55',
    },
    rank: {
      ...display,
      width: scaled(24),
      fontSize: scaled(18),
      letterSpacing: -0.3,
      textAlign: 'center' as const,
    },
    info: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontSize: scaled(15),
      fontFamily: S_FONT_FAMILY.body.semibold,
      letterSpacing: -0.2,
      color: colors.text.primary,
    },
    displayName: {
      fontSize: scaled(13),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
      marginTop: 1,
    },
    stats: {
      alignItems: 'flex-end' as const,
      minWidth: scaled(64),
      flexShrink: 0,
    },
    points: {
      ...display,
      fontSize: scaled(18),
      letterSpacing: -0.3,
      color: colors.primary,
    },
    subLabel: {
      fontSize: scaled(11.5),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.muted,
      marginTop: 1,
    },
  }), [colors, scaled, display]);

  return (
    <TouchableOpacity
      style={[styles.container, isCurrentUser && styles.currentUser]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text style={[styles.rank, { color: rankColor }]}>{member.rank}</Text>

      <Avatar
        name={member.teamName || member.displayName}
        size={40}
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
        <Text style={styles.points} numberOfLines={1}>
          {showLastRace && displayPoints > 0 ? '+' : ''}{displayPoints} pts
        </Text>
        <Text style={styles.subLabel} numberOfLines={1}>
          {showLastRace ? 'last race' : 'season'}
        </Text>
      </View>
    </TouchableOpacity>
  );
});
