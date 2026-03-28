import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONTS } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { useLockoutStatus } from '../../hooks/useLockoutStatus';

export const SimpleCountdownBanner = React.memo(function SimpleCountdownBanner() {
  const { colors, fonts, spacing } = useSimpleTheme();
  const lockoutInfo = useLockoutStatus();
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const styles = useMemo(() => ({
    collapsed: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: S_RADIUS.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    collapsedText: {
      fontSize: fonts.xs,
      fontWeight: S_FONTS.weights.semibold,
    },
    expanded: {
      backgroundColor: colors.surface,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    expandedRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
    },
    raceName: {
      fontSize: fonts.sm,
      fontWeight: S_FONTS.weights.semibold,
      color: colors.text.primary,
      flex: 1,
    },
    timeText: {
      fontSize: fonts.sm,
      color: colors.text.muted,
      fontWeight: S_FONTS.weights.medium,
    },
    lockRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      marginTop: 2,
    },
    lockText: {
      fontSize: fonts.xs,
      color: colors.warning,
      fontWeight: S_FONTS.weights.medium,
    },
    lockHint: {
      fontSize: fonts.xs,
      color: colors.text.muted,
    },
  }), [colors, fonts, spacing]);

  if (!lockoutInfo.nextRace) {
    console.log('[Countdown] No next race found');
    return null;
  }

  const raceTime = new Date(lockoutInfo.nextRace.schedule.race).getTime();
  const diff = raceTime - now;
  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const secs = Math.floor((diff / 1000) % 60);

  let timeStr = '';
  if (days > 0) timeStr = `${days}d ${hours}h ${mins}m ${secs}s`;
  else if (hours > 0) timeStr = `${hours}h ${mins}m ${secs}s`;
  else timeStr = `${mins}m ${secs}s`;

  // Determine lockout time
  let lockTimeStr = '';
  const lockTime = lockoutInfo.lockTime ? new Date(lockoutInfo.lockTime).getTime() : null;
  if (lockTime) {
    const lockDiff = lockTime - now;
    if (lockDiff > 0) {
      const ld = Math.floor(lockDiff / (1000 * 60 * 60 * 24));
      const lh = Math.floor((lockDiff / (1000 * 60 * 60)) % 24);
      const lm = Math.floor((lockDiff / (1000 * 60)) % 60);
      const ls = Math.floor((lockDiff / 1000) % 60);
      if (ld > 0) lockTimeStr = `${ld}d ${lh}h ${lm}m`;
      else if (lh > 0) lockTimeStr = `${lh}h ${lm}m ${ls}s`;
      else lockTimeStr = `${lm}m ${ls}s`;
    }
  }

  const isClose = days <= 2; // Within 2 days = more urgent
  const iconColor = lockoutInfo.isLocked ? colors.warning : isClose ? colors.primary : colors.text.muted;

  // Collapsed: compact pill with time
  if (!expanded) {
    return (
      <TouchableOpacity style={styles.collapsed} onPress={() => setExpanded(true)} activeOpacity={0.7}>
        <Ionicons
          name={lockoutInfo.isLocked ? 'lock-closed' : 'flag-outline'}
          size={12}
          color={iconColor}
        />
        <Text style={[styles.collapsedText, { color: iconColor }]}>{timeStr}</Text>
      </TouchableOpacity>
    );
  }

  // Expanded: full countdown details
  return (
    <TouchableOpacity style={styles.expanded} onPress={() => setExpanded(false)} activeOpacity={0.8}>
      <View style={styles.expandedRow}>
        <Ionicons name="flag-outline" size={14} color={colors.primary} />
        <Text style={styles.raceName}>{lockoutInfo.nextRace.name}</Text>
        <Text style={styles.timeText}>in {timeStr}</Text>
      </View>
      {lockoutInfo.isLocked ? (
        <View style={styles.lockRow}>
          <Ionicons name="lock-closed" size={10} color={colors.warning} />
          <Text style={styles.lockText}>Teams locked</Text>
        </View>
      ) : lockTimeStr ? (
        <View style={styles.lockRow}>
          <Ionicons name="time-outline" size={10} color={colors.text.muted} />
          <Text style={styles.lockHint}>Lockdown in {lockTimeStr}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
});
