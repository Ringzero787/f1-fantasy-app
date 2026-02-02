import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, SHADOWS } from '../config/constants';
import { formatPoints } from '../utils/formatters';
import { Avatar } from './Avatar';
import type { LeagueMember } from '../types';

interface LeaderboardItemProps {
  member: LeagueMember;
  isCurrentUser?: boolean;
  onPress?: () => void;
}

export function LeaderboardItem({ member, isCurrentUser = false, onPress }: LeaderboardItemProps) {
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
        </View>
        <Text style={styles.ownerName}>{member.displayName}</Text>
      </View>

      {/* Points */}
      <View style={styles.points}>
        <Text style={[styles.pointsValue, member.rank <= 3 && styles.topPointsValue]}>
          {formatPoints(member.totalPoints)}
        </Text>
        <Text style={styles.pointsLabel}>points</Text>
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
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
    ...SHADOWS.xs,
  },

  currentUser: {
    backgroundColor: COLORS.purple[50],
    borderWidth: 2,
    borderColor: COLORS.purple[200],
    ...SHADOWS.glow,
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
    color: COLORS.purple[700],
  },

  youBadge: {
    backgroundColor: COLORS.purple[100],
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },

  youText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.purple[600],
  },

  ownerName: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 2,
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
    color: COLORS.purple[700],
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
