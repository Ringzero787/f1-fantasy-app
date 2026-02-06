import React, { useState, useEffect, useMemo } from 'react';
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

// Filter to only active drivers (should be 22 for full grid)
const activeDrivers = demoDrivers.filter(d => d.isActive);

// Points awarded per finishing position (position 1-22)
// F1 Points + Position Bonus = Total (for drivers)
const POSITION_POINTS: Record<number, number> = {
  1: 47,   // 25 + 22
  2: 39,   // 18 + 21
  3: 35,   // 15 + 20
  4: 31,   // 12 + 19
  5: 28,   // 10 + 18
  6: 25,   // 8 + 17
  7: 22,   // 6 + 16
  8: 19,   // 4 + 15
  9: 16,   // 2 + 14
  10: 14,  // 1 + 13
  11: 12,  // 0 + 12
  12: 11,  // 0 + 11
  13: 10,  // 0 + 10
  14: 9,   // 0 + 9
  15: 8,   // 0 + 8
  16: 7,   // 0 + 7
  17: 6,   // 0 + 6
  18: 5,   // 0 + 5
  19: 4,   // 0 + 4
  20: 3,   // 0 + 3
  21: 2,   // 0 + 2
  22: 1,   // 0 + 1
};

// F1 Points only (for constructors) - positions 11+ get 0
const F1_POINTS: Record<number, number> = {
  1: 25,
  2: 18,
  3: 15,
  4: 12,
  5: 10,
  6: 8,
  7: 6,
  8: 4,
  9: 2,
  10: 1,
};

// Sprint race points (positions 1-8 only get points)
const SPRINT_POINTS: Record<number, number> = {
  1: 8,
  2: 7,
  3: 6,
  4: 5,
  5: 4,
  6: 3,
  7: 2,
  8: 1,
};

// Convert position to total points (for drivers in main race)
const getPointsForPosition = (position: number | null): number => {
  if (!position || position < 1 || position > 22) return 0;
  return POSITION_POINTS[position] || 0;
};

// Convert position to F1 points only (for constructors)
const getF1PointsForPosition = (position: number | null): number => {
  if (!position || position < 1 || position > 10) return 0;
  return F1_POINTS[position] || 0;
};

// Convert position to sprint points (for drivers in sprint race)
const getSprintPointsForPosition = (position: number | null): number => {
  if (!position || position < 1 || position > 8) return 0;
  return SPRINT_POINTS[position] || 0;
};

// Convert position to sprint F1 points (for constructors - same as drivers in sprint)
const getSprintF1PointsForPosition = (position: number | null): number => {
  if (!position || position < 1 || position > 8) return 0;
  return SPRINT_POINTS[position] || 0;
};

export default function AdminScreen() {
  const { user } = useAuth();
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const {
    raceResults,
    initializeRaceResult,
    updateDriverPoints,
    updateConstructorPoints,
    updateSprintDriverPoints,
    updateSprintConstructorPoints,
    updateDriverDnf,
    updateSprintDriverDnf,
    markRaceComplete,
    resetRaceResults,
    getRaceResult,
  } = useAdminStore();

  const { recalculateAllTeamsPoints, userTeams } = useTeamStore();

  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);
  const [driverPositions, setDriverPositions] = useState<Record<string, string>>({});
  const [sprintPositions, setSprintPositions] = useState<Record<string, string>>({});
  const [driverDnf, setDriverDnf] = useState<Record<string, boolean>>({});
  const [sprintDnf, setSprintDnf] = useState<Record<string, boolean>>({});
  const [entryMode, setEntryMode] = useState<'race' | 'sprint'>('race');

  // Only show for admins or demo mode
  if (!isAdmin && !isDemoMode) {
    return (
      <EmptyState
        icon="lock-closed"
        title="Admin Access Restricted"
        message="You don't have permission to access this panel"
      />
    );
  }

  const selectedRace = selectedRaceId
    ? demoRaces.find(r => r.id === selectedRaceId)
    : null;

  // Convert points back to position (for loading existing data)
  const getPositionFromPoints = (points: number): string => {
    for (const [pos, pts] of Object.entries(POSITION_POINTS)) {
      if (pts === points) return pos;
    }
    return '';
  };

  // Convert sprint points back to position
  const getSprintPositionFromPoints = (points: number): string => {
    for (const [pos, pts] of Object.entries(SPRINT_POINTS)) {
      if (pts === points) return pos;
    }
    return '';
  };

  const handleSelectRace = (raceId: string) => {
    setSelectedRaceId(raceId);
    setEntryMode('race'); // Reset to race mode when selecting new race
    initializeRaceResult(raceId);

    // Load existing positions from stored points
    const result = getRaceResult(raceId);
    if (result) {
      // Load race positions and DNF status
      const positions: Record<string, string> = {};
      const dnfStatus: Record<string, boolean> = {};
      result.driverResults.forEach(dr => {
        if (dr.dnf) {
          dnfStatus[dr.driverId] = true;
          positions[dr.driverId] = '';
        } else {
          dnfStatus[dr.driverId] = false;
          positions[dr.driverId] = getPositionFromPoints(dr.points);
        }
      });
      setDriverPositions(positions);
      setDriverDnf(dnfStatus);

      // Load sprint positions and DNF if available
      const sprintPos: Record<string, string> = {};
      const sprintDnfStatus: Record<string, boolean> = {};
      activeDrivers.forEach(d => {
        sprintPos[d.id] = '';
        sprintDnfStatus[d.id] = false;
      });
      if (result.sprintResults) {
        result.sprintResults.forEach((sr) => {
          if (sr.dnf) {
            sprintDnfStatus[sr.driverId] = true;
            sprintPos[sr.driverId] = '';
          } else if (sr.points > 0) {
            sprintPos[sr.driverId] = getSprintPositionFromPoints(sr.points);
          }
        });
      }
      setSprintPositions(sprintPos);
      setSprintDnf(sprintDnfStatus);
    } else {
      // Reset to empty
      const positions: Record<string, string> = {};
      const sprintPos: Record<string, string> = {};
      const dnfStatus: Record<string, boolean> = {};
      const sprintDnfStatus: Record<string, boolean> = {};
      activeDrivers.forEach(d => {
        positions[d.id] = '';
        sprintPos[d.id] = '';
        dnfStatus[d.id] = false;
        sprintDnfStatus[d.id] = false;
      });
      setDriverPositions(positions);
      setSprintPositions(sprintPos);
      setDriverDnf(dnfStatus);
      setSprintDnf(sprintDnfStatus);
    }
  };

  // Get current positions and DNF based on entry mode
  const currentPositions = entryMode === 'sprint' ? sprintPositions : driverPositions;
  const setCurrentPositions = entryMode === 'sprint' ? setSprintPositions : setDriverPositions;
  const currentDnf = entryMode === 'sprint' ? sprintDnf : driverDnf;
  const setCurrentDnf = entryMode === 'sprint' ? setSprintDnf : setDriverDnf;

  // Track which positions are already used (for duplicate detection)
  const usedPositions = useMemo(() => {
    const positionMap: Record<string, string> = {}; // position -> driverId
    Object.entries(currentPositions).forEach(([driverId, positionStr]) => {
      if (positionStr !== '') {
        positionMap[positionStr] = driverId;
      }
    });
    return positionMap;
  }, [currentPositions]);

  // Check if a position is a duplicate for a specific driver
  const isPositionDuplicate = (driverId: string, position: string): boolean => {
    if (!position) return false;
    const existingDriver = usedPositions[position];
    return existingDriver !== undefined && existingDriver !== driverId;
  };

  // Get count of filled positions and DNFs
  const filledCount = Object.values(currentPositions).filter(p => p !== '').length;
  const duplicateCount = Object.entries(currentPositions).filter(
    ([driverId, pos]) => isPositionDuplicate(driverId, pos)
  ).length;
  const dnfCount = Object.values(currentDnf).filter(Boolean).length;
  const sprintFilledCount = Object.values(sprintPositions).filter(p => p !== '').length;

  const handlePositionChange = (driverId: string, value: string) => {
    const numValue = parseInt(value, 10);
    if (value === '' || (numValue >= 1 && numValue <= 22)) {
      if (entryMode === 'sprint') {
        setSprintPositions(prev => ({ ...prev, [driverId]: value }));
      } else {
        setDriverPositions(prev => ({ ...prev, [driverId]: value }));
      }
    }
  };

  const handleDnfChange = (driverId: string, dnf: boolean) => {
    if (entryMode === 'sprint') {
      setSprintDnf(prev => ({ ...prev, [driverId]: dnf }));
      // Clear position if DNF
      if (dnf) {
        setSprintPositions(prev => ({ ...prev, [driverId]: '' }));
      }
    } else {
      setDriverDnf(prev => ({ ...prev, [driverId]: dnf }));
      // Clear position if DNF
      if (dnf) {
        setDriverPositions(prev => ({ ...prev, [driverId]: '' }));
      }
    }
  };

  // Calculate constructor points from their drivers (race)
  // Uses F1 points only (not bonus): (driver1 F1 pts + driver2 F1 pts) / 2
  // DNF drivers contribute 0 points
  const calculateConstructorPoints = (): Record<string, number> => {
    const constructorPts: Record<string, number> = {};
    demoConstructors.forEach(constructor => {
      let total = 0;
      constructor.drivers.forEach(driverId => {
        // DNF drivers contribute 0
        if (driverDnf[driverId]) {
          total += 0;
        } else {
          const position = parseInt(driverPositions[driverId] || '0', 10);
          total += getF1PointsForPosition(position);
        }
      });
      constructorPts[constructor.id] = Math.floor(total / 2);
    });
    return constructorPts;
  };

  // Calculate constructor points from their drivers (sprint)
  // DNF drivers contribute 0 points
  const calculateSprintConstructorPoints = (): Record<string, number> => {
    const constructorPts: Record<string, number> = {};
    demoConstructors.forEach(constructor => {
      let total = 0;
      constructor.drivers.forEach(driverId => {
        // DNF drivers contribute 0
        if (sprintDnf[driverId]) {
          total += 0;
        } else {
          const position = parseInt(sprintPositions[driverId] || '0', 10);
          total += getSprintF1PointsForPosition(position);
        }
      });
      constructorPts[constructor.id] = Math.floor(total / 2);
    });
    return constructorPts;
  };

  const handleSaveResults = () => {
    if (!selectedRaceId) return;

    const positions = entryMode === 'sprint' ? sprintPositions : driverPositions;
    const filledPositions = Object.values(positions).filter(p => p !== '');
    const uniquePositions = new Set(filledPositions);

    if (filledPositions.length !== uniquePositions.size) {
      Alert.alert('Error', 'Each position can only be assigned to one driver. Please fix duplicates (marked in red).');
      return;
    }

    if (entryMode === 'sprint') {
      saveSprintResults();
    } else {
      if (filledPositions.length < activeDrivers.length) {
        Alert.alert(
          'Incomplete Results',
          `Only ${filledPositions.length} of ${activeDrivers.length} positions filled. Save anyway?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Save', onPress: () => saveRaceResults() },
          ]
        );
        return;
      }
      saveRaceResults();
    }
  };

  const saveRaceResults = () => {
    if (!selectedRaceId) return;

    // Count DNFs
    const dnfCount = Object.values(driverDnf).filter(Boolean).length;

    // Save driver points and DNF status
    Object.entries(driverPositions).forEach(([driverId, positionStr]) => {
      const isDnf = driverDnf[driverId] || false;
      if (isDnf) {
        // DNF = 0 points
        updateDriverPoints(selectedRaceId, driverId, 0);
        updateDriverDnf(selectedRaceId, driverId, true);
      } else {
        const position = parseInt(positionStr, 10);
        const points = getPointsForPosition(position);
        updateDriverPoints(selectedRaceId, driverId, points);
        updateDriverDnf(selectedRaceId, driverId, false);
      }
    });

    // Save constructor points (auto-calculated, DNF drivers contribute 0)
    const constructorPts = calculateConstructorPoints();
    Object.entries(constructorPts).forEach(([constructorId, points]) => {
      updateConstructorPoints(selectedRaceId, constructorId, points);
    });

    Alert.alert('Success', `Race results saved! (${filledCount} positions, ${dnfCount} DNFs)`);
  };

  const saveSprintResults = () => {
    if (!selectedRaceId) return;

    // Count DNFs
    const dnfCount = Object.values(sprintDnf).filter(Boolean).length;

    // Save sprint driver points and DNF status
    Object.entries(sprintPositions).forEach(([driverId, positionStr]) => {
      const isDnf = sprintDnf[driverId] || false;
      if (isDnf) {
        // DNF = 0 points
        updateSprintDriverPoints(selectedRaceId, driverId, 0);
        updateSprintDriverDnf(selectedRaceId, driverId, true);
      } else {
        const position = parseInt(positionStr, 10);
        const points = getSprintPointsForPosition(position);
        updateSprintDriverPoints(selectedRaceId, driverId, points);
        updateSprintDriverDnf(selectedRaceId, driverId, false);
      }
    });

    // Save sprint constructor points
    const sprintConstructorPts = calculateSprintConstructorPoints();
    Object.entries(sprintConstructorPts).forEach(([constructorId, points]) => {
      updateSprintConstructorPoints(selectedRaceId, constructorId, points);
    });

    Alert.alert('Success', `Sprint results saved! (${sprintFilledCount} positions, ${dnfCount} DNFs)`);
  };

  const handleMarkComplete = () => {
    if (!selectedRaceId) return;

    // Check if at least some positions are filled
    const filled = Object.values(driverPositions).filter(p => p !== '').length;
    if (filled === 0) {
      Alert.alert('Error', 'Please enter at least some finishing positions');
      return;
    }

    // Check for duplicates
    if (duplicateCount > 0) {
      Alert.alert('Error', 'Cannot complete race with duplicate positions. Please fix duplicates (marked in red).');
      return;
    }

    const warningMessage = filled < activeDrivers.length
      ? `Only ${filled} of ${activeDrivers.length} positions filled. Finalize anyway?`
      : `All ${activeDrivers.length} positions filled. Finalize race results?`;

    Alert.alert(
      'Mark Race Complete',
      warningMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: () => {
            saveRaceResults();
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
      'This will clear all results for this race. Continue?',
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

  // Get points display for a driver
  const getDriverPoints = (driverId: string): number => {
    const position = parseInt(driverPositions[driverId] || '0', 10);
    return getPointsForPosition(position);
  };

  // Auto-populate race results with random but realistic positions
  const handleAutoPopulate = () => {
    if (!selectedRaceId) {
      Alert.alert('Error', 'Please select a race first');
      return;
    }

    Alert.alert(
      'Auto-Populate Results',
      'This will randomly assign finishing positions to all drivers. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Populate',
          onPress: () => {
            // Shuffle drivers to get random order
            const shuffledDrivers = [...activeDrivers].sort(() => Math.random() - 0.5);

            // Assign positions 1-22 (or however many drivers there are)
            const newPositions: Record<string, string> = {};
            const newDnf: Record<string, boolean> = {};

            shuffledDrivers.forEach((driver, index) => {
              // 10% chance of DNF for realism
              const isDnf = Math.random() < 0.1;
              newDnf[driver.id] = isDnf;
              newPositions[driver.id] = isDnf ? '' : String(index + 1);
            });

            // Re-assign positions to non-DNF drivers to fill gaps
            const nonDnfDrivers = shuffledDrivers.filter(d => !newDnf[d.id]);
            nonDnfDrivers.forEach((driver, index) => {
              newPositions[driver.id] = String(index + 1);
            });

            if (entryMode === 'sprint') {
              setSprintPositions(newPositions);
              setSprintDnf(newDnf);
            } else {
              setDriverPositions(newPositions);
              setDriverDnf(newDnf);
            }

            Alert.alert('Success', `Auto-populated ${entryMode === 'sprint' ? 'sprint' : 'race'} positions!`);
          },
        },
      ]
    );
  };

  // Auto-populate and complete the race in one action
  const handleAutoPopulateAndComplete = () => {
    if (!selectedRaceId) {
      Alert.alert('Error', 'Please select a race first');
      return;
    }

    Alert.alert(
      'Auto-Complete Race',
      'This will randomly assign positions and mark the race as complete. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Auto-Complete',
          onPress: () => {
            // Shuffle drivers to get random order
            const shuffledDrivers = [...activeDrivers].sort(() => Math.random() - 0.5);

            // Assign positions with some DNFs
            const newPositions: Record<string, string> = {};
            const newDnf: Record<string, boolean> = {};

            shuffledDrivers.forEach((driver) => {
              newDnf[driver.id] = Math.random() < 0.1; // 10% DNF chance
            });

            // Assign sequential positions to non-DNF drivers
            const nonDnfDrivers = shuffledDrivers.filter(d => !newDnf[d.id]);
            nonDnfDrivers.forEach((driver, index) => {
              newPositions[driver.id] = String(index + 1);
            });

            // Set empty positions for DNF drivers
            shuffledDrivers.forEach(driver => {
              if (newDnf[driver.id]) {
                newPositions[driver.id] = '';
              }
            });

            // Update local state
            setDriverPositions(newPositions);
            setDriverDnf(newDnf);

            // Save driver points
            Object.entries(newPositions).forEach(([driverId, positionStr]) => {
              const isDnf = newDnf[driverId] || false;
              if (isDnf) {
                updateDriverPoints(selectedRaceId, driverId, 0);
                updateDriverDnf(selectedRaceId, driverId, true);
              } else {
                const position = parseInt(positionStr, 10);
                const points = getPointsForPosition(position);
                updateDriverPoints(selectedRaceId, driverId, points);
                updateDriverDnf(selectedRaceId, driverId, false);
              }
            });

            // Calculate and save constructor points
            const constructorPts: Record<string, number> = {};
            demoConstructors.forEach(constructor => {
              let total = 0;
              constructor.drivers.forEach(driverId => {
                if (!newDnf[driverId]) {
                  const position = parseInt(newPositions[driverId] || '0', 10);
                  total += getF1PointsForPosition(position);
                }
              });
              constructorPts[constructor.id] = Math.floor(total / 2);
            });
            Object.entries(constructorPts).forEach(([constructorId, points]) => {
              updateConstructorPoints(selectedRaceId, constructorId, points);
            });

            // Mark race complete
            markRaceComplete(selectedRaceId);

            const dnfCount = Object.values(newDnf).filter(Boolean).length;
            Alert.alert('Success', `Race auto-completed! (${activeDrivers.length - dnfCount} finishers, ${dnfCount} DNFs)`);
          },
        },
      ]
    );
  };

  // Reset all race results (clear everything)
  const handleResetAllRaces = () => {
    Alert.alert(
      'Reset All Race Results',
      'This will clear ALL race results and reset the season. This cannot be undone!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset All',
          style: 'destructive',
          onPress: () => {
            // Reset all races
            demoRaces.forEach(race => {
              resetRaceResults(race.id);
            });

            // Clear local state
            setSelectedRaceId(null);
            setDriverPositions({});
            setSprintPositions({});
            setDriverDnf({});
            setSprintDnf({});

            // Recalculate team points (will be 0 now)
            recalculateAllTeamsPoints();

            Alert.alert('Success', 'All race results have been reset!');
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="settings" size={24} color={COLORS.primary} />
        <Text style={styles.headerTitle}>Race Admin Panel</Text>
      </View>
      <Text style={styles.subtitle}>Enter finishing positions (1-22) for each driver</Text>

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
        <View style={styles.summaryActions}>
          <TouchableOpacity style={styles.recalcButton} onPress={handleRecalculatePoints}>
            <Ionicons name="refresh" size={16} color={COLORS.primary} />
            <Text style={styles.recalcButtonText}>Recalculate Points</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetAllButton} onPress={handleResetAllRaces}>
            <Ionicons name="trash-outline" size={16} color={COLORS.error} />
            <Text style={styles.resetAllButtonText}>Reset All Races</Text>
          </TouchableOpacity>
        </View>
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
                    race.hasSprint && styles.raceChipSprint,
                  ]}
                  onPress={() => handleSelectRace(race.id)}
                >
                  <View style={styles.raceChipHeader}>
                    <Text style={[
                      styles.raceChipRound,
                      selectedRaceId === race.id && styles.raceChipTextSelected,
                    ]}>
                      R{race.round}
                    </Text>
                    {race.hasSprint && (
                      <Ionicons
                        name="flash"
                        size={10}
                        color={selectedRaceId === race.id ? COLORS.white : COLORS.warning}
                      />
                    )}
                  </View>
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
              <View style={styles.raceCardBadges}>
                {selectedRace.hasSprint && (
                  <View style={styles.sprintBadge}>
                    <Ionicons name="flash" size={12} color={COLORS.white} />
                    <Text style={styles.sprintBadgeText}>Sprint</Text>
                  </View>
                )}
                {raceResult?.isComplete && (
                  <View style={styles.completeBadge}>
                    <Ionicons name="checkmark" size={14} color={COLORS.white} />
                    <Text style={styles.completeBadgeText}>Complete</Text>
                  </View>
                )}
              </View>
            </View>
          </Card>

          {/* Mode Toggle for Sprint Races */}
          {selectedRace.hasSprint && (
            <View style={styles.modeToggleContainer}>
              <TouchableOpacity
                style={[
                  styles.modeToggleButton,
                  entryMode === 'race' && styles.modeToggleButtonActive,
                ]}
                onPress={() => setEntryMode('race')}
              >
                <Ionicons
                  name="flag"
                  size={16}
                  color={entryMode === 'race' ? COLORS.white : COLORS.text.secondary}
                />
                <Text style={[
                  styles.modeToggleText,
                  entryMode === 'race' && styles.modeToggleTextActive,
                ]}>
                  Race (25-18-15...)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeToggleButton,
                  entryMode === 'sprint' && styles.modeToggleButtonActive,
                  entryMode === 'sprint' && styles.modeToggleButtonSprint,
                ]}
                onPress={() => setEntryMode('sprint')}
              >
                <Ionicons
                  name="flash"
                  size={16}
                  color={entryMode === 'sprint' ? COLORS.white : COLORS.text.secondary}
                />
                <Text style={[
                  styles.modeToggleText,
                  entryMode === 'sprint' && styles.modeToggleTextActive,
                ]}>
                  Sprint (8-7-6...)
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Driver Positions */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {entryMode === 'sprint' ? 'Sprint' : 'Race'} Finishing Positions
              </Text>
              <Text style={styles.sectionHint}>
                {entryMode === 'sprint' ? 'Top 8 score' : `${activeDrivers.length} drivers`}
              </Text>
            </View>
            <View style={styles.statusBar}>
              <Text style={styles.statusText}>
                Filled: {filledCount}/{entryMode === 'sprint' ? '8 (scoring)' : activeDrivers.length}
                {dnfCount > 0 && ` · ${dnfCount} DNF`}
              </Text>
              {duplicateCount > 0 && (
                <Text style={styles.duplicateWarning}>
                  {duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''}
                </Text>
              )}
            </View>
            {activeDrivers.map(driver => {
              const position = currentPositions[driver.id];
              const isDnf = currentDnf[driver.id] || false;
              const posNum = parseInt(position || '0', 10);
              const points = isDnf ? 0 : (entryMode === 'sprint'
                ? getSprintPointsForPosition(posNum)
                : getPointsForPosition(posNum));
              const isDuplicate = isPositionDuplicate(driver.id, position);
              return (
                <View key={driver.id} style={[
                  styles.driverRow,
                  isDuplicate && styles.driverRowDuplicate,
                  entryMode === 'sprint' && styles.driverRowSprint,
                  isDnf && styles.driverRowDnf,
                ]}>
                  <View style={styles.driverInfo}>
                    <View style={styles.driverNameRow}>
                      <Text style={styles.driverNumber}>#{driver.number}</Text>
                      <Text style={[styles.driverName, isDnf && styles.driverNameDnf]}>
                        {driver.name}
                      </Text>
                    </View>
                    <Text style={styles.driverTeam}>{driver.constructorName}</Text>
                  </View>
                  <View style={styles.positionContainer}>
                    {/* DNF Checkbox */}
                    <TouchableOpacity
                      style={[styles.dnfCheckbox, isDnf && styles.dnfCheckboxChecked]}
                      onPress={() => handleDnfChange(driver.id, !isDnf)}
                    >
                      {isDnf && <Ionicons name="close" size={12} color={COLORS.white} />}
                    </TouchableOpacity>
                    <Text style={[styles.dnfLabel, isDnf && styles.dnfLabelActive]}>DNF</Text>
                    {isDuplicate && (
                      <Ionicons name="warning" size={16} color={COLORS.error} />
                    )}
                    {points > 0 && !isDuplicate && !isDnf && (
                      <Text style={[
                        styles.pointsPreview,
                        entryMode === 'sprint' && styles.pointsPreviewSprint,
                      ]}>
                        {points} pts
                      </Text>
                    )}
                    {isDnf && (
                      <Text style={styles.dnfPointsPreview}>0 pts</Text>
                    )}
                    <TextInput
                      style={[
                        styles.positionInput,
                        position && styles.positionInputFilled,
                        isDuplicate && styles.positionInputDuplicate,
                        entryMode === 'sprint' && position && styles.positionInputSprint,
                        isDnf && styles.positionInputDisabled,
                      ]}
                      value={isDnf ? '' : (position || '')}
                      onChangeText={(value) => handlePositionChange(driver.id, value)}
                      keyboardType="numeric"
                      maxLength={2}
                      placeholder={isDnf ? 'X' : '-'}
                      placeholderTextColor={isDnf ? COLORS.error : COLORS.text.muted}
                      editable={!isDnf}
                    />
                  </View>
                </View>
              );
            })}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {/* Testing Shortcuts */}
            <View style={styles.testingSection}>
              <Text style={styles.testingSectionTitle}>Quick Actions</Text>
              <View style={styles.testingButtons}>
                <TouchableOpacity style={styles.autoPopulateButton} onPress={handleAutoPopulate}>
                  <Ionicons name="shuffle" size={16} color={COLORS.white} />
                  <Text style={styles.autoPopulateButtonText}>Auto-Populate</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.autoCompleteButton, raceResult?.isComplete && styles.buttonDisabled]}
                  onPress={handleAutoPopulateAndComplete}
                  disabled={raceResult?.isComplete}
                >
                  <Ionicons name="flash" size={16} color={COLORS.white} />
                  <Text style={styles.autoCompleteButtonText}>Auto-Complete</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Button
              title="Save Results"
              onPress={handleSaveResults}
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
          <Ionicons name="flag-outline" size={48} color={COLORS.text.muted} />
          <Text style={styles.emptyText}>Select a race above to enter results</Text>
        </Card>
      )}
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },

  headerTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  subtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
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
    color: COLORS.text.primary,
  },

  summaryLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border.default,
  },

  summaryActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
  },

  recalcButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primary + '10',
    borderRadius: BORDER_RADIUS.md,
  },

  recalcButtonText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
    color: COLORS.primary,
  },

  resetAllButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.error + '10',
    borderRadius: BORDER_RADIUS.md,
  },

  resetAllButtonText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
    color: COLORS.error,
  },

  section: {
    marginBottom: SPACING.lg,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },

  sectionTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.secondary,
    marginBottom: SPACING.sm,
  },

  sectionHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
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
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border.default,
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

  raceChipSprint: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },

  raceChipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  raceChipRound: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.text.muted,
  },

  raceChipName: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    color: COLORS.text.primary,
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
    color: COLORS.text.primary,
  },

  raceCircuit: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  raceCardBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
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

  sprintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.warning,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },

  sprintBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.white,
  },

  modeToggleContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },

  modeToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.border.default,
  },

  modeToggleButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  modeToggleButtonSprint: {
    backgroundColor: COLORS.warning,
    borderColor: COLORS.warning,
  },

  modeToggleText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },

  modeToggleTextActive: {
    color: COLORS.white,
  },

  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },

  statusText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },

  duplicateWarning: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.error,
    fontWeight: '600',
  },

  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  driverRowDuplicate: {
    borderColor: COLORS.error,
    backgroundColor: COLORS.error + '10',
  },

  driverRowSprint: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },

  driverRowDnf: {
    backgroundColor: COLORS.error + '15',
    borderColor: COLORS.error + '50',
  },

  driverInfo: {
    flex: 1,
  },

  driverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  driverNumber: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },

  driverName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '500',
    color: COLORS.text.primary,
  },

  driverNameDnf: {
    textDecorationLine: 'line-through',
    color: COLORS.text.muted,
  },

  driverTeam: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 2,
    marginLeft: SPACING.sm + 28, // Align with name (after number)
  },

  positionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  pointsPreview: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.success,
    fontWeight: '500',
  },

  pointsPreviewSprint: {
    color: COLORS.warning,
  },

  positionInput: {
    width: 50,
    height: 44,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border.default,
    textAlign: 'center',
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
  },

  positionInputFilled: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },

  positionInputDuplicate: {
    borderColor: COLORS.error,
    backgroundColor: COLORS.error + '10',
  },

  positionInputSprint: {
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warning + '10',
  },

  positionInputDisabled: {
    borderColor: COLORS.error + '50',
    backgroundColor: COLORS.error + '10',
    color: COLORS.text.muted,
  },

  dnfCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.error,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },

  dnfCheckboxChecked: {
    backgroundColor: COLORS.error,
    borderColor: COLORS.error,
  },

  dnfLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    fontWeight: '600',
  },

  dnfLabelActive: {
    color: COLORS.error,
  },

  dnfPointsPreview: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.error,
    fontWeight: '500',
  },

  actions: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },

  testingSection: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.warning + '10',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },

  testingSectionTitle: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.warning,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  testingButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },

  autoPopulateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.info,
    borderRadius: BORDER_RADIUS.md,
  },

  autoPopulateButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.white,
  },

  autoCompleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.md,
  },

  autoCompleteButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.white,
  },

  buttonDisabled: {
    opacity: 0.5,
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
    color: COLORS.text.muted,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
});
