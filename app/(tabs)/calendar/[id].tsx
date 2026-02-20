import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Switch,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRace, useRaceResults } from '../../../src/hooks';
import { Card, Loading, EmptyState, TrackIcon } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../../src/config/constants';
import { useTheme } from '../../../src/hooks/useTheme';
import { formatCountdown, formatTimeWithZone, formatDateWithZone } from '../../../src/utils/formatters';
import { usePrefsStore } from '../../../src/store/prefs.store';

export default function RaceDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: race, isLoading, refetch } = useRace(id || '');
  const { data: results } = useRaceResults(id || '');
  const { showLocalTime, toggleLocalTime } = usePrefsStore();

  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!race || race.status !== 'upcoming') return;

    const updateCountdown = () => {
      const now = new Date();
      const raceTime = new Date(race.schedule.race);
      const diff = raceTime.getTime() - now.getTime();
      setCountdown(formatCountdown(diff));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [race]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return <Loading fullScreen message="Loading race details..." />;
  }

  if (!race) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Race Not Found"
        message="This race could not be found"
      />
    );
  }

  const sessions = [
    { name: 'Practice 1', time: race.schedule.fp1, icon: 'speedometer-outline' },
    { name: 'Practice 2', time: race.schedule.fp2, icon: 'speedometer-outline' },
    { name: 'Practice 3', time: race.schedule.fp3, icon: 'speedometer-outline' },
    { name: 'Sprint Qualifying', time: race.schedule.sprintQualifying, icon: 'timer-outline' },
    { name: 'Sprint', time: race.schedule.sprint, icon: 'flag-outline' },
    { name: 'Qualifying', time: race.schedule.qualifying, icon: 'timer-outline' },
    { name: 'Race', time: race.schedule.race, icon: 'flag-outline' },
  ].filter((s) => s.time);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <Card variant="elevated" style={styles.headerCard}>
        {/* Track Layout */}
        <View style={styles.trackContainer}>
          <TrackIcon country={race.country} city={race.city} size={100} />
        </View>

        <View style={[styles.roundBadge, { backgroundColor: theme.primary }]}>
          <Text style={styles.roundText}>Round {race.round}</Text>
        </View>

        <Text style={styles.raceName}>{race.name}</Text>
        <Text style={styles.circuitName}>{race.circuitName}</Text>

        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={16} color={COLORS.text.secondary} />
          <Text style={styles.location}>
            {race.city}, {race.country}
          </Text>
        </View>

        {race.hasSprint && (
          <View style={styles.sprintBadge}>
            <Ionicons name="flash" size={14} color={COLORS.white} />
            <Text style={styles.sprintText}>Sprint Weekend</Text>
          </View>
        )}

        {race.status === 'upcoming' && (
          <View style={styles.countdownContainer}>
            <Text style={styles.countdownLabel}>Race starts in</Text>
            <Text style={[styles.countdownValue, { color: theme.primary }]}>{countdown}</Text>
          </View>
        )}
      </Card>

      {/* Schedule */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Schedule</Text>
        <View style={styles.timezoneToggleRow}>
          <Ionicons name="globe-outline" size={18} color={COLORS.text.secondary} />
          <Text style={styles.timezoneLabel}>
            {showLocalTime ? 'My Time' : 'Track Time'}
          </Text>
          <Switch
            value={showLocalTime}
            onValueChange={toggleLocalTime}
            trackColor={{ false: COLORS.border.default, true: theme.primary }}
            thumbColor={COLORS.white}
          />
        </View>
        <Card variant="outlined" padding="none">
          {sessions.map((session, index) => (
            <View
              key={session.name}
              style={[
                styles.sessionRow,
                index < sessions.length - 1 && styles.sessionBorder,
              ]}
            >
              <View style={styles.sessionIcon}>
                <Ionicons
                  name={session.icon as any}
                  size={20}
                  color={COLORS.text.secondary}
                />
              </View>
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionName}>{session.name}</Text>
                <Text style={styles.sessionDate}>
                  {formatDateWithZone(session.time!, race.timezone, showLocalTime)}
                </Text>
              </View>
              <Text style={styles.sessionTime}>
                {formatTimeWithZone(session.time!, race.timezone, showLocalTime)}
              </Text>
            </View>
          ))}
        </Card>
      </View>

      {/* Results (if completed) */}
      {race.status === 'completed' && results && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Race Results</Text>
          <Card variant="outlined" padding="none">
            {results.raceResults.slice(0, 10).map((result, index) => (
              <View
                key={result.driverId}
                style={[
                  styles.resultRow,
                  index < 9 && styles.resultBorder,
                ]}
              >
                <View style={[
                  styles.positionBadge,
                  index === 0 && styles.gold,
                  index === 1 && styles.silver,
                  index === 2 && styles.bronze,
                ]}>
                  <Text style={styles.positionText}>{result.position}</Text>
                </View>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultDriver}>{result.driverId}</Text>
                  <Text style={styles.resultStatus}>
                    {result.status === 'finished'
                      ? `+${result.positionsGained > 0 ? result.positionsGained : 0} positions`
                      : result.status.toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.resultPoints, { color: theme.primary }]}>{result.points} pts</Text>
              </View>
            ))}
          </Card>
        </View>
      )}

      {/* Circuit Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Circuit Information</Text>
        <Card variant="outlined">
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Circuit</Text>
            <Text style={styles.infoValue}>{race.circuitName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Location</Text>
            <Text style={styles.infoValue}>{race.city}, {race.country}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Timezone</Text>
            <Text style={styles.infoValue}>{race.timezone}</Text>
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },

  headerCard: {
    marginBottom: SPACING.lg,
    alignItems: 'center',
  },

  trackContainer: {
    width: 120,
    height: 120,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },

  roundBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.md,
  },

  roundText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.white,
  },

  raceName: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    textAlign: 'center',
  },

  circuitName: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },

  location: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
  },

  sprintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },

  sprintText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.white,
  },

  countdownContainer: {
    marginTop: SPACING.lg,
    alignItems: 'center',
  },

  countdownLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
  },

  countdownValue: {
    fontSize: FONTS.sizes.xxxl,
    fontWeight: 'bold',
    color: COLORS.primary,
    fontVariant: ['tabular-nums'],
  },

  section: {
    marginBottom: SPACING.lg,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.md,
  },

  timezoneToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },

  timezoneLabel: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },

  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },

  sessionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  sessionIcon: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },

  sessionInfo: {
    flex: 1,
  },

  sessionName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  sessionDate: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginTop: 2,
  },

  sessionTime: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },

  resultBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  positionBadge: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },

  gold: {
    backgroundColor: COLORS.gold,
  },

  silver: {
    backgroundColor: COLORS.silver,
  },

  bronze: {
    backgroundColor: COLORS.bronze,
  },

  positionText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: 'bold',
    color: COLORS.white,
  },

  resultInfo: {
    flex: 1,
  },

  resultDriver: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  resultStatus: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginTop: 2,
  },

  resultPoints: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.primary,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },

  infoLabel: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
  },

  infoValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    color: COLORS.text.primary,
  },
});
