import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, SHADOWS } from '../config/constants';
import { formatPoints } from '../utils/formatters';
import { Avatar } from './Avatar';
import type { LeagueMember } from '../types';

export type LeaderboardView = 'total' | 'ppr' | 'last5' | 'wins';

interface LeaderboardItemProps {
  member: LeagueMember;
  isCurrentUser?: boolean;
  onPress?: () => void;
  view?: LeaderboardView;
}

export const LeaderboardItem = React.memo(function LeaderboardItem({ member, isCurrentUser = false, onPress, view = 'total' }: LeaderboardItemProps) {
  // Get value and label based on view type
  const getDisplayValue = (): { value: number; label: string } => {
    switch (view) {
      case 'ppr':
        return {
          value: member.pprAverage ?? (member.racesPlayed && member.racesPlayed > 0
            ? Math.round((member.totalPoints / member.racesPlayed) * 10) / 10
            : 0),
          label: 'PPR'
        };
      case 'last5':
        return {
          value: member.recentFormPoints ?? 0,
          label: 'last 5'
        };
      case 'wins':
        return {
          value: member.raceWins ?? 0,
          label: 'wins'
        };
      default:
        return {
          value: member.totalPoints,
          label: 'points'
        };
    }
  };

  const { value: displayValue, label: displayLabel } = getDisplayValue();

  const getRankColors = (): readonly [string, string] => {
    switch (member.rank) {
      case 1:
        return ['#FBBF24', '#D97706'] as const; // Gold gradient
      case 2:
        return ['#9CA3AF', '#6B7280'] as const; // Silver gradient
      case 3:
        return ['#D97706', '#B45309'] as const; // Bronze gradient
      default:
        return [COLORS.gray[300], COLORS.gray[400]] as const;
    }
  };

  const getRankIcon = () => {
    if (member.rank === 1) return 'trophy';
    if (member.rank <= 3) return 'medal';
    return null;
  };

  const content = (
    <View style={[styles.container, isCurrentUser && styles.currentUser]}>
      {/* Rank Badge */}
      <LinearGradient
        colors={getRankColors()}
        style={styles.rankBadge}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {getRankIcon() ? (
          <Ionicons name={getRankIcon()!} size={16} color={COLORS.white} />
        ) : (
          <Text style={styles.rankText}>{member.rank}</Text>
        )}
      </LinearGradient>

      {/* Team Avatar */}
      <Avatar
        name={member.teamName || member.displayName}
        size="small"
        variant="team"
        imageUrl={member.teamAvatarUrl}
      />

      {/* Member Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.teamName, isCurrentUser && styles.currentUserText]} numberOfLines={1}>
            {member.teamName || 'No Team'}
          </Text>
          {isCurrentUser && (
            <View style={styles.youBadge}>
              <Text style={styles.youText}>You</Text>
            </View>
          )}
          {member.isInCatchUp && (
            <View style={styles.catchUpBadge}>
              <Ionicons name="rocket" size={10} color={COLORS.white} />
              <Text style={styles.catchUpText}>1.5x</Text>
            </View>
          )}
        </View>
        <View style={styles.subtitleRow}>
          <Text style={styles.ownerName}>{member.displayName}</Text>
          {member.raceWins && member.raceWins > 0 && (
            <View style={styles.winsBadge}>
              <Ionicons name="trophy" size={10} color="#FBBF24" />
              <Text style={styles.winsText}>{member.raceWins}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Points/Value */}
      <View style={styles.points}>
        <Text style={[styles.pointsValue, member.rank <= 3 && styles.topPointsValue]}>
          {view === 'ppr' ? displayValue.toFixed(1) : formatPoints(displayValue)}
        </Text>
        <Text style={styles.pointsLabel}>{displayLabel}</Text>
      </View>

      {/* Chevron for navigation */}
      {onPress && (
        <Ionicons name="chevron-forward" size={18} color={COLORS.gray[300]} style={styles.chevron} />
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  currentUser: {
    backgroundColor: COLORS.primary + '15',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },

  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rankText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '800',
    color: COLORS.white,
  },

  info: {
    flex: 1,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  teamName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
    flexShrink: 1,
  },

  currentUserText: {
    color: COLORS.primary,
  },

  youBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },

  youText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.primary,
  },

  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 2,
  },

  ownerName: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
  },

  catchUpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },

  catchUpText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.white,
  },

  winsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FBBF24' + '20',
    paddingHorizontal: SPACING.xs,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.full,
  },

  winsText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: '#D97706',
  },

  points: {
    alignItems: 'flex-end',
    marginRight: SPACING.xs,
  },

  pointsValue: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '800',
    color: COLORS.text.primary,
    letterSpacing: -0.5,
  },

  topPointsValue: {
    color: COLORS.primary,
  },

  pointsLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: -2,
  },

  chevron: {
    marginLeft: SPACING.sm,
  },
});
