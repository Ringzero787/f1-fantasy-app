import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../config/constants';
import { useTheme } from '../hooks/useTheme';
import { raceService } from '../services/race.service';
import { formatCountdown } from '../utils/formatters';
import { useLockoutStatus } from '../hooks/useLockoutStatus';
import type { Race } from '../types';

interface CountdownBannerProps {
  race: Race;
  accentColor?: string; // Override the default teal color
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const FIVE_DAYS_MS = 5 * 24 * ONE_HOUR_MS;

export const CountdownBanner = React.memo(function CountdownBanner({ race, accentColor }: CountdownBannerProps) {
  const theme = useTheme();
  const [sessionName, setSessionName] = useState('');
  const [sessionCountdown, setSessionCountdown] = useState('');
  const [lockCountdown, setLockCountdown] = useState('');
  const [urgency, setUrgency] = useState<'normal' | 'warning' | 'critical'>('normal');

  const lockoutInfo = useLockoutStatus();

  useEffect(() => {
    if (race.status !== 'upcoming') return;

    const tick = () => {
      const info = raceService.getRaceCountdown(race);
      if (!info) {
        setSessionName('');
        setSessionCountdown('');
        return;
      }

      setSessionName(info.nextSession);
      setSessionCountdown(formatCountdown(info.timeUntil));

      // Lock deadline countdown
      if (lockoutInfo.lockTime && !lockoutInfo.isLocked) {
        const lockDiff = lockoutInfo.lockTime.getTime() - Date.now();
        if (lockDiff > 0) {
          setLockCountdown(formatCountdown(lockDiff));
          if (lockDiff < ONE_HOUR_MS) {
            setUrgency('critical');
          } else if (lockDiff < 24 * ONE_HOUR_MS) {
            setUrgency('warning');
          } else {
            setUrgency('normal');
          }
        } else {
          setLockCountdown('');
          setUrgency('normal');
        }
      } else {
        setLockCountdown('');
        setUrgency('normal');
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [race, lockoutInfo.lockTime, lockoutInfo.isLocked]);

  if (race.status !== 'upcoming' || !sessionName) return null;

  // Only show banner within 5 days of lockout (or if already locked)
  if (!lockoutInfo.isLocked && lockoutInfo.lockTime) {
    const timeUntilLock = lockoutInfo.lockTime.getTime() - Date.now();
    if (timeUntilLock > FIVE_DAYS_MS) return null;
  }
  if (!lockoutInfo.isLocked && !lockoutInfo.lockTime) return null;

  const normalColor = accentColor || theme.primary;

  const bannerColor =
    urgency === 'critical'
      ? COLORS.error
      : urgency === 'warning'
      ? COLORS.warning
      : normalColor;

  const bannerBg =
    urgency === 'critical'
      ? COLORS.error + '15'
      : urgency === 'warning'
      ? COLORS.warning + '15'
      : normalColor + '15';

  const borderColor =
    urgency === 'critical'
      ? COLORS.error + '40'
      : urgency === 'warning'
      ? COLORS.warning + '40'
      : normalColor + '30';

  return (
    <View style={[styles.container, { backgroundColor: bannerBg, borderColor }]}>
      <View style={styles.sessionRow}>
        <Ionicons name="time-outline" size={18} color={bannerColor} />
        <Text style={[styles.sessionLabel, { color: bannerColor }]}>
          {sessionName} in
        </Text>
        <Text style={[styles.countdown, { color: bannerColor }]}>
          {sessionCountdown}
        </Text>
      </View>
      {lockCountdown !== '' && (
        <View style={styles.lockRow}>
          <Ionicons
            name={urgency === 'critical' ? 'warning' : 'lock-closed-outline'}
            size={16}
            color={bannerColor}
          />
          <Text style={[styles.lockLabel, { color: bannerColor }]}>
            Teams lock in
          </Text>
          <Text style={[styles.lockCountdown, { color: bannerColor }]}>
            {lockCountdown}
          </Text>
        </View>
      )}
      {lockoutInfo.isLocked && (
        <View style={styles.lockRow}>
          <Ionicons name="lock-closed" size={16} color={COLORS.error} />
          <Text style={[styles.lockLabel, { color: COLORS.error }]}>
            Teams locked
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sessionLabel: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
  },
  countdown: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginLeft: 'auto',
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 6,
  },
  lockLabel: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
  },
  lockCountdown: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginLeft: 'auto',
  },
});
