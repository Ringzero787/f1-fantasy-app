import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Switch,
  BackHandler,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRace, useRaceResults, useSeasonRaces } from '../../../src/hooks';
import { Card, Loading, EmptyState, TrackIcon } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../../src/config/constants';
import { useTheme } from '../../../src/hooks/useTheme';
import { formatCountdown, formatTimeWithZone, formatDateWithZone, getDriverDisplayName } from '../../../src/utils/formatters';
import { usePrefsStore } from '../../../src/store/prefs.store';

const CURRENT_SEASON_ID = '2026';

export default function RaceDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: race, isLoading, refetch } = useRace(id || '');
  const { data: results } = useRaceResults(id || '');
  const { showLocalTime, toggleLocalTime } = usePrefsStore();
  const { data: allRaces } = useSeasonRaces(CURRENT_SEASON_ID);

  const { prevRace, nextRace } = useMemo(() => {
    if (!allRaces || !id) return { prevRace: null, nextRace: null };
    const sorted = [...allRaces].sort((a, b) => a.round - b.round);
    const idx = sorted.findIndex((r) => r.id === id);
    return {
      prevRace: idx > 0 ? sorted[idx - 1] : null,
      nextRace: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };
  }, [allRaces, id]);

  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState('');

  // Handle Android hardware back button — always go to calendar list
  useEffect(() => {
    const onBackPress = () => {
      router.navigate('/(tabs)/calendar');
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, []);

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
      style={[styles.container, { backgroundColor: theme.background }]}
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
              <View style={[styles.sessionIcon, { backgroundColor: theme.surface }]}>
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
            {results.raceResults.map((result, index) => (
              <View
                key={result.driverId}
                style={[
                  styles.resultRow,
                  index < results.raceResults.length - 1 && styles.resultBorder,
                ]}
              >
                <View style={[
                  styles.positionBadge,
                  { backgroundColor: theme.surface },
                  index === 0 && styles.gold,
                  index === 1 && styles.silver,
                  index === 2 && styles.bronze,
                ]}>
                  <Text style={styles.positionText}>{result.position}</Text>
                </View>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultDriver}>{getDriverDisplayName(result.driverId)}</Text>
                  <Text style={styles.resultStatus}>
                    {result.status === 'finished'
                      ? result.positionsGained > 0
                        ? `+${result.positionsGained} positions gained`
                        : result.positionsGained < 0
                        ? `${result.positionsGained} positions`
                        : 'No change'
                      : result.status.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.resultRight}>
                  {results.fastestLap === result.driverId && (
                    <Ionicons name="stopwatch" size={14} color={COLORS.purple[400]} style={{ marginRight: 4 }} />
                  )}
                  <Text style={[styles.resultPoints, { color: theme.primary }]}>{result.points} pts</Text>
                </View>
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

      {/* Prev / Next Race Navigation */}
      {(prevRace || nextRace) && (
        <View style={[styles.raceNav, { borderTopColor: COLORS.border.default }]}>
          {prevRace ? (
            <TouchableOpacity
              style={styles.raceNavButton}
              onPress={() => router.replace(`/calendar/${prevRace.id}`)}
            >
              <Ionicons name="chevron-back" size={18} color={theme.primary} />
              <View style={styles.raceNavTextBlock}>
                <Text style={styles.raceNavLabel}>Previous</Text>
                <Text style={[styles.raceNavName, { color: theme.primary }]} numberOfLines={1}>
                  {prevRace.name}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.raceNavButton} />
          )}
          {nextRace ? (
            <TouchableOpacity
              style={[styles.raceNavButton, styles.raceNavButtonRight]}
              onPress={() => router.replace(`/calendar/${nextRace.id}`)}
            >
              <View style={[styles.raceNavTextBlock, { alignItems: 'flex-end' }]}>
                <Text style={styles.raceNavLabel}>Next</Text>
                <Text style={[styles.raceNavName, { color: theme.primary }]} numberOfLines={1}>
                  {nextRace.name}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.raceNavButton} />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: undefined, // themed via inline style
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
    backgroundColor: undefined, // themed via inline style
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
    backgroundColor: undefined, // themed via inline style
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

  resultRight: {
    flexDirection: 'row',
    alignItems: 'center',
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

  raceNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
  },

  raceNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.xs,
  },

  raceNavButtonRight: {
    justifyContent: 'flex-end',
  },

  raceNavTextBlock: {
    flexShrink: 1,
  },

  raceNavLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    fontWeight: '500',
  },

  raceNavName: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
  },
});
