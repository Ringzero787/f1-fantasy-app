import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, SHADOWS } from '../config/constants';
import { formatDate, formatCountdown, formatCountdownWords } from '../utils/formatters';
import { raceService } from '../services/race.service';
import { TrackIcon } from './TrackIcon';
import type { Race } from '../types';

interface RaceCardProps {
  race: Race;
  onPress?: () => void;
  showCountdown?: boolean;
  compact?: boolean;
}

export function RaceCard({
  race,
  onPress,
  showCountdown = true,
  compact = false,
}: RaceCardProps) {
  const [countdown, setCountdown] = useState<string>('');
  const [nextSession, setNextSession] = useState<string>('');

  useEffect(() => {
    if (!showCountdown || race.status === 'completed') return;

    const updateCountdown = () => {
      const info = raceService.getRaceCountdown(race);
      if (info) {
        setNextSession(info.nextSession);
        setCountdown(formatCountdownWords(info.timeUntil));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);

    return () => clearInterval(interval);
  }, [race, showCountdown]);

  const getStatusColor = () => {
    switch (race.status) {
      case 'in_progress':
        return COLORS.success;
      case 'completed':
        return COLORS.text.muted;
      default:
        return COLORS.primary;
    }
  };

  const getStatusText = () => {
    switch (race.status) {
      case 'in_progress':
        return 'Live';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return formatDate(race.schedule.race);
    }
  };

  if (compact) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.compactContainer,
          { transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
        onPress={onPress}
      >
        <View style={styles.compactRoundBadge}>
          <Text style={styles.compactRoundText}>{race.round}</Text>
        </View>
        <View style={styles.compactInfo}>
          <Text style={styles.compactName} numberOfLines={1}>{race.name}</Text>
          <Text style={styles.compactDate}>{formatDate(race.schedule.race)}</Text>
        </View>
        {race.hasSprint && (
          <View style={styles.sprintTag}>
            <Text style={styles.sprintTagText}>S</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={18} color={COLORS.text.muted} />
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}
      onPress={onPress}
    >
      <View style={styles.header}>
        <View style={styles.trackContainer}>
          <TrackIcon country={race.country} city={race.city} size={56} />
          <View style={styles.roundOverlay}>
            <Text style={styles.roundOverlayText}>{race.round}</Text>
          </View>
        </View>
        <View style={styles.raceInfo}>
          <Text style={styles.name}>{race.name}</Text>
          <Text style={styles.circuit}>{race.circuitName}</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color={COLORS.text.muted} />
            <Text style={styles.location}>
              {race.city}, {race.country}
            </Text>
          </View>
        </View>
        {race.hasSprint && (
          <View style={styles.sprintBadge}>
            <Ionicons name="flash" size={12} color={COLORS.white} />
            <Text style={styles.sprintText}>Sprint</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.dateSection}>
          <Text style={styles.dateLabel}>RACE DAY</Text>
          <Text style={styles.dateValue}>{formatDate(race.schedule.race)}</Text>
        </View>

        {showCountdown && race.status === 'upcoming' && (
          <View style={styles.countdownSection}>
            <Text style={styles.countdownLabel}>{nextSession} in</Text>
            <View style={styles.countdownBadge}>
              <Ionicons name="time-outline" size={14} color={COLORS.primary} />
              <Text style={styles.countdownValue}>{countdown}</Text>
            </View>
          </View>
        )}

        {race.status === 'in_progress' && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}

        {race.status === 'completed' && (
          <View style={styles.completedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.text.muted} />
            <Text style={styles.completedText}>Completed</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  compactContainer: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  header: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
  },

  trackContainer: {
    width: 56,
    height: 56,
    marginRight: SPACING.md,
    position: 'relative',
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  roundOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.purple[600],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.card,
  },

  roundOverlayText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.white,
  },

  roundBadge: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },

  roundLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: COLORS.purple[200],
    letterSpacing: 0.5,
  },

  roundText: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '800',
    color: COLORS.white,
    marginTop: -2,
  },

  compactRoundBadge: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.purple[600] + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },

  compactRoundText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.purple[400],
  },

  raceInfo: {
    flex: 1,
  },

  compactInfo: {
    flex: 1,
  },

  name: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
    letterSpacing: -0.3,
  },

  compactName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  circuit: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginTop: 2,
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
    gap: 4,
  },

  location: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },

  compactDate: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  sprintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.purple[500],
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
    gap: 4,
  },

  sprintText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.white,
  },

  sprintTag: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.purple[500],
    alignItems: 'center',
    justifyContent: 'center',
  },

  sprintTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.white,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
  },

  dateSection: {},

  dateLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.text.muted,
    letterSpacing: 0.5,
  },

  dateValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.text.primary,
    marginTop: 2,
  },

  countdownSection: {
    alignItems: 'flex-end',
  },

  countdownLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
  },

  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: 2,
  },

  countdownValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.primary,
  },

  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successLight,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
  },

  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },

  liveText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.success,
    letterSpacing: 0.5,
  },

  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  completedText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    fontWeight: '500',
  },
});
