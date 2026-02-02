import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/hooks/useAuth';
import { useAuthStore } from '../../../src/store/auth.store';
import { useAdminStore } from '../../../src/store/admin.store';
import { useTeamStore } from '../../../src/store/team.store';
import { demoRaces, demoDrivers, demoConstructors } from '../../../src/data/demoData';
import { Card, Button, EmptyState } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../../src/config/constants';

export default function AdminScreen() {
  const { user } = useAuth();
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const {
    raceResults,
    initializeRaceResult,
    updateDriverPoints,
    updateConstructorPoints,
    markRaceComplete,
    resetRaceResults,
    getRaceResult,
  } = useAdminStore();

  const { recalculateAllTeamsPoints, userTeams } = useTeamStore();

  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);
  const [driverPoints, setDriverPoints] = useState<Record<string, string>>({});
  const [constructorPoints, setConstructorPoints] = useState<Record<string, string>>({});

  // Only show for demo mode
  if (!isDemoMode) {
    return (
      <EmptyState
        icon="lock-closed"
        title="Admin Access Restricted"
        message="This panel is only available in demo mode"
      />
    );
  }

  const selectedRace = selectedRaceId
    ? demoRaces.find(r => r.id === selectedRaceId)
    : null;

  const handleSelectRace = (raceId: string) => {
    setSelectedRaceId(raceId);
    initializeRaceResult(raceId);

    // Load existing points into state
    const result = getRaceResult(raceId);
    if (result) {
      const driverPts: Record<string, string> = {};
      result.driverResults.forEach(dr => {
        driverPts[dr.driverId] = dr.points.toString();
      });
      setDriverPoints(driverPts);

      const constructorPts: Record<string, string> = {};
      result.constructorResults.forEach(cr => {
        constructorPts[cr.constructorId] = cr.points.toString();
      });
      setConstructorPoints(constructorPts);
    } else {
      // Reset to empty
      const driverPts: Record<string, string> = {};
      demoDrivers.forEach(d => { driverPts[d.id] = '0'; });
      setDriverPoints(driverPts);

      const constructorPts: Record<string, string> = {};
      demoConstructors.forEach(c => { constructorPts[c.id] = '0'; });
      setConstructorPoints(constructorPts);
    }
  };

  const handleDriverPointsChange = (driverId: string, value: string) => {
    setDriverPoints(prev => ({ ...prev, [driverId]: value }));
  };

  const handleConstructorPointsChange = (constructorId: string, value: string) => {
    setConstructorPoints(prev => ({ ...prev, [constructorId]: value }));
  };

  const handleSavePoints = () => {
    if (!selectedRaceId) return;

    // Save driver points
    Object.entries(driverPoints).forEach(([driverId, points]) => {
      const numPoints = parseInt(points, 10) || 0;
      updateDriverPoints(selectedRaceId, driverId, numPoints);
    });

    // Save constructor points
    Object.entries(constructorPoints).forEach(([constructorId, points]) => {
      const numPoints = parseInt(points, 10) || 0;
      updateConstructorPoints(selectedRaceId, constructorId, numPoints);
    });

    Alert.alert('Success', 'Race points saved successfully!');
  };

  const handleMarkComplete = () => {
    if (!selectedRaceId) return;

    Alert.alert(
      'Mark Race Complete',
      'This will finalize the race results. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: () => {
            handleSavePoints();
            markRaceComplete(selectedRaceId);
            Alert.alert('Success', 'Race marked as complete!');
          },
        },
      ]
    );
  };

  const handleResetRace = () => {
    if (!selectedRaceId) return;

    Alert.alert(
      'Reset Race Results',
      'This will clear all points for this race. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetRaceResults(selectedRaceId);
            handleSelectRace(selectedRaceId);
            Alert.alert('Success', 'Race results reset!');
          },
        },
      ]
    );
  };

  const raceResult = selectedRaceId ? getRaceResult(selectedRaceId) : null;

  // Count completed races
  const completedRacesCount = Object.values(raceResults).filter(r => r.isComplete).length;

  // Handle manual recalculation
  const handleRecalculatePoints = () => {
    recalculateAllTeamsPoints();
    Alert.alert('Success', 'Team points recalculated from all completed races!');
  };

  // Apply preset F1 points (25-18-15-12-10-8-6-4-2-1)
  const applyPresetPoints = () => {
    const f1Points = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

    // Sort drivers by current season points (as a default order)
    const sortedDrivers = [...demoDrivers].sort((a, b) => b.seasonPoints - a.seasonPoints);

    const newDriverPoints: Record<string, string> = {};
    sortedDrivers.forEach((driver, index) => {
      newDriverPoints[driver.id] = (f1Points[index] || 0).toString();
    });
    setDriverPoints(newDriverPoints);

    // Auto-calculate constructor points from their drivers
    const newConstructorPoints: Record<string, string> = {};
    demoConstructors.forEach(constructor => {
      const driverIds = constructor.drivers;
      let total = 0;
      driverIds.forEach(driverId => {
        total += parseInt(newDriverPoints[driverId] || '0', 10);
      });
      newConstructorPoints[constructor.id] = total.toString();
    });
    setConstructorPoints(newConstructorPoints);
  };

  // Calculate constructor points from driver points
  const autoCalculateConstructorPoints = () => {
    const newConstructorPoints: Record<string, string> = {};
    demoConstructors.forEach(constructor => {
      const driverIds = constructor.drivers;
      let total = 0;
      driverIds.forEach(driverId => {
        total += parseInt(driverPoints[driverId] || '0', 10);
      });
      newConstructorPoints[constructor.id] = total.toString();
    });
    setConstructorPoints(newConstructorPoints);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="settings" size={24} color={COLORS.primary} />
        <Text style={styles.headerTitle}>Race Admin Panel</Text>
      </View>
      <Text style={styles.subtitle}>Demo Mode Only - Manage race results</Text>

      {/* Summary Card */}
      <Card variant="elevated" style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{completedRacesCount}</Text>
            <Text style={styles.summaryLabel}>Races Complete</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{userTeams.length}</Text>
            <Text style={styles.summaryLabel}>Teams</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{24 - completedRacesCount}</Text>
            <Text style={styles.summaryLabel}>Remaining</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.recalcButton} onPress={handleRecalculatePoints}>
          <Ionicons name="refresh" size={16} color={COLORS.primary} />
          <Text style={styles.recalcButtonText}>Recalculate All Team Points</Text>
        </TouchableOpacity>
      </Card>

      {/* Race Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Race</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.raceList}>
            {demoRaces.map(race => {
              const result = raceResults[race.id];
              const isComplete = result?.isComplete;
              const hasData = result && result.driverResults.some(dr => dr.points > 0);

              return (
                <TouchableOpacity
                  key={race.id}
                  style={[
                    styles.raceChip,
                    selectedRaceId === race.id && styles.raceChipSelected,
                    isComplete && styles.raceChipComplete,
                  ]}
                  onPress={() => handleSelectRace(race.id)}
                >
                  <Text style={[
                    styles.raceChipRound,
                    selectedRaceId === race.id && styles.raceChipTextSelected,
                  ]}>
                    R{race.round}
                  </Text>
                  <Text
                    style={[
                      styles.raceChipName,
                      selectedRaceId === race.id && styles.raceChipTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {race.country}
                  </Text>
                  {isComplete && (
                    <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                  )}
                  {!isComplete && hasData && (
                    <Ionicons name="ellipse" size={8} color={COLORS.warning} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Selected Race Details */}
      {selectedRace && (
        <>
          <Card variant="elevated" style={styles.raceCard}>
            <View style={styles.raceCardHeader}>
              <View>
                <Text style={styles.raceName}>{selectedRace.name}</Text>
                <Text style={styles.raceCircuit}>{selectedRace.circuitName}</Text>
              </View>
              {raceResult?.isComplete && (
                <View style={styles.completeBadge}>
                  <Ionicons name="checkmark" size={14} color={COLORS.white} />
                  <Text style={styles.completeBadgeText}>Complete</Text>
                </View>
              )}
            </View>
          </Card>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickButton} onPress={applyPresetPoints}>
              <Ionicons name="flash" size={16} color={COLORS.primary} />
              <Text style={styles.quickButtonText}>Apply F1 Points</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickButton} onPress={autoCalculateConstructorPoints}>
              <Ionicons name="calculator" size={16} color={COLORS.primary} />
              <Text style={styles.quickButtonText}>Auto Constructor</Text>
            </TouchableOpacity>
          </View>

          {/* Driver Points */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Driver Points</Text>
            {demoDrivers.map(driver => (
              <View key={driver.id} style={styles.pointsRow}>
                <View style={styles.pointsInfo}>
                  <Text style={styles.pointsName}>{driver.name}</Text>
                  <Text style={styles.pointsTeam}>{driver.constructorName}</Text>
                </View>
                <TextInput
                  style={styles.pointsInput}
                  value={driverPoints[driver.id] || '0'}
                  onChangeText={(value) => handleDriverPointsChange(driver.id, value)}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
              </View>
            ))}
          </View>

          {/* Constructor Points */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Constructor Points</Text>
            {demoConstructors.map(constructor => (
              <View key={constructor.id} style={styles.pointsRow}>
                <View style={styles.pointsInfo}>
                  <Text style={styles.pointsName}>{constructor.name}</Text>
                  <Text style={styles.pointsTeam}>
                    {constructor.drivers.map(dId =>
                      demoDrivers.find(d => d.id === dId)?.shortName
                    ).join(' / ')}
                  </Text>
                </View>
                <TextInput
                  style={styles.pointsInput}
                  value={constructorPoints[constructor.id] || '0'}
                  onChangeText={(value) => handleConstructorPointsChange(constructor.id, value)}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
              </View>
            ))}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              title="Save Points"
              onPress={handleSavePoints}
              fullWidth
              style={styles.actionButton}
            />
            <Button
              title="Mark Race Complete"
              onPress={handleMarkComplete}
              variant="outline"
              fullWidth
              style={styles.actionButton}
              disabled={raceResult?.isComplete}
            />
            <Button
              title="Reset Race"
              onPress={handleResetRace}
              variant="ghost"
              fullWidth
            />
          </View>
        </>
      )}

      {!selectedRace && (
        <Card variant="outlined" padding="large" style={styles.emptyCard}>
          <Ionicons name="flag-outline" size={48} color={COLORS.gray[300]} />
          <Text style={styles.emptyText}>Select a race above to enter results</Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray[50],
  },

  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },

  headerTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.gray[900],
  },

  subtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
    marginBottom: SPACING.md,
  },

  summaryCard: {
    marginBottom: SPACING.lg,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },

  summaryItem: {
    alignItems: 'center',
  },

  summaryValue: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.gray[900],
  },

  summaryLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[500],
    marginTop: 2,
  },

  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.gray[200],
  },

  recalcButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[100],
    marginTop: SPACING.sm,
  },

  recalcButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    color: COLORS.primary,
  },

  section: {
    marginBottom: SPACING.lg,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[700],
    marginBottom: SPACING.sm,
  },

  raceList: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingRight: SPACING.md,
  },

  raceChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    alignItems: 'center',
    minWidth: 70,
    gap: 2,
  },

  raceChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  raceChipComplete: {
    borderColor: COLORS.success,
  },

  raceChipRound: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.gray[500],
  },

  raceChipName: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    color: COLORS.gray[900],
  },

  raceChipTextSelected: {
    color: COLORS.white,
  },

  raceCard: {
    marginBottom: SPACING.md,
  },

  raceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  raceName: {
    fontSize: FONTS.sizes.lg,
    fontWeight: 'bold',
    color: COLORS.gray[900],
  },

  raceCircuit: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
    marginTop: 2,
  },

  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },

  completeBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.white,
  },

  quickActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },

  quickButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    padding: SPACING.sm,
    backgroundColor: COLORS.primary + '10',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },

  quickButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    color: COLORS.primary,
  },

  pointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },

  pointsInfo: {
    flex: 1,
  },

  pointsName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    color: COLORS.gray[900],
  },

  pointsTeam: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.gray[500],
    marginTop: 2,
  },

  pointsInput: {
    width: 60,
    height: 40,
    backgroundColor: COLORS.gray[50],
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
    textAlign: 'center',
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.gray[900],
  },

  actions: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },

  actionButton: {
    marginBottom: SPACING.xs,
  },

  emptyCard: {
    alignItems: 'center',
    marginTop: SPACING.xl,
  },

  emptyText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[500],
    marginTop: SPACING.md,
    textAlign: 'center',
  },
});
