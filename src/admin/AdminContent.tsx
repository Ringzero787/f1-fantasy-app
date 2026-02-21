import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../store/auth.store';
import { useAdminStore } from '../store/admin.store';
import { useTeamStore } from '../store/team.store';
import { demoRaces, demoDrivers, demoConstructors } from '../data/demoData';
import { Card, Button, EmptyState } from '../components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../config/constants';
import { useTheme } from '../hooks/useTheme';
import { errorLogService } from '../services/errorLog.service';
import { articleService } from '../services/article.service';
import { useChatStore } from '../store/chat.store';
import { raceService } from '../services/race.service';
import { openF1Service } from '../services/openf1.service';
import { functions, httpsCallable } from '../config/firebase';
import type { RaceResults, RaceResult as CloudRaceResult, SprintResult as CloudSprintResult } from '../types';

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

export default function AdminContent() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const raceResults = useAdminStore(s => s.raceResults);
  const initializeRaceResult = useAdminStore(s => s.initializeRaceResult);
  const updateDriverPoints = useAdminStore(s => s.updateDriverPoints);
  const updateConstructorPoints = useAdminStore(s => s.updateConstructorPoints);
  const updateSprintDriverPoints = useAdminStore(s => s.updateSprintDriverPoints);
  const updateSprintConstructorPoints = useAdminStore(s => s.updateSprintConstructorPoints);
  const updateDriverDnf = useAdminStore(s => s.updateDriverDnf);
  const updateSprintDriverDnf = useAdminStore(s => s.updateSprintDriverDnf);
  const markRaceComplete = useAdminStore(s => s.markRaceComplete);
  const resetRaceResults = useAdminStore(s => s.resetRaceResults);
  const getRaceResult = useAdminStore(s => s.getRaceResult);
  const adminLockOverride = useAdminStore(s => s.adminLockOverride);
  const setAdminLockOverride = useAdminStore(s => s.setAdminLockOverride);
  const cloudSyncedRaces = useAdminStore(s => s.cloudSyncedRaces);
  const markRaceCloudSynced = useAdminStore(s => s.markRaceCloudSynced);
  const isRaceCloudSynced = useAdminStore(s => s.isRaceCloudSynced);

  const recalculateAllTeamsPoints = useTeamStore(s => s.recalculateAllTeamsPoints);
  const userTeams = useTeamStore(s => s.userTeams);

  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);
  const [driverPositions, setDriverPositions] = useState<Record<string, string>>({});
  const [sprintPositions, setSprintPositions] = useState<Record<string, string>>({});
  const [driverDnf, setDriverDnf] = useState<Record<string, boolean>>({});
  const [sprintDnf, setSprintDnf] = useState<Record<string, boolean>>({});
  const [entryMode, setEntryMode] = useState<'race' | 'sprint'>('race');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [unreviewedCount, setUnreviewedCount] = useState(0);
  const [draftArticleCount, setDraftArticleCount] = useState(0);
  const chatTotalUnread = useChatStore((s) => s.totalUnread);

  useFocusEffect(
    useCallback(() => {
      errorLogService.getUnreviewedCount().then(setUnreviewedCount);
      articleService.getDraftCount().then(setDraftArticleCount);
    }, [])
  );

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

  // Only show for admins (guard placed after all hooks)
  if (!isAdmin) {
    return (
      <EmptyState
        icon="lock-closed"
        title="Admin Access Restricted"
        message="You don't have permission to access this panel"
      />
    );
  }

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
        // DNF = -5 points penalty
        updateDriverPoints(selectedRaceId, driverId, -5);
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
        // DNF = -5 points penalty
        updateSprintDriverPoints(selectedRaceId, driverId, -5);
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
            recalculateAllTeamsPoints();
            Alert.alert('Success', 'Race marked as complete! Team points updated.');
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
            recalculateAllTeamsPoints();
            handleSelectRace(selectedRaceId);
            Alert.alert('Success', 'Race results reset! Team points updated.');
          },
        },
      ]
    );
  };

  const raceResult = selectedRaceId ? getRaceResult(selectedRaceId) : null;

  // Count completed races and sprints
  const completedRacesCount = useAdminStore.getState().getCompletedRaceCount();
  const totalSprints = demoRaces.filter(r => r.hasSprint).length;
  const completedSprints = demoRaces.filter(r => r.hasSprint && raceResults[r.id]?.isComplete).length;

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

  // Simulate realistic race positions weighted by driver skill (price)
  const simulateRacePositions = () => {
    const drivers = [...activeDrivers];
    const newPositions: Record<string, string> = {};
    const newDnf: Record<string, boolean> = {};

    // DNF chance scales inversely with price: cheap drivers DNF more often
    const maxPrice = Math.max(...drivers.map(d => d.price));
    drivers.forEach(driver => {
      // Top drivers: ~3% DNF, backmarkers: ~12% DNF
      const skillFactor = driver.price / maxPrice;
      const dnfChance = 0.12 - skillFactor * 0.09;
      newDnf[driver.id] = Math.random() < dnfChance;
    });

    // Weighted sort: use price as base skill, add random variance
    // Higher-priced drivers finish higher on average, but upsets happen
    const nonDnfDrivers = drivers.filter(d => !newDnf[d.id]);
    const scored = nonDnfDrivers.map(driver => {
      // Variance: ±30% of their price — enough for occasional upsets
      const variance = (Math.random() - 0.5) * 0.6 * driver.price;
      return { driver, score: driver.price + variance };
    });

    // Sort by score descending (highest score = best position)
    scored.sort((a, b) => b.score - a.score);
    scored.forEach(({ driver }, index) => {
      newPositions[driver.id] = String(index + 1);
    });

    // DNF drivers get empty position
    drivers.forEach(driver => {
      if (newDnf[driver.id]) {
        newPositions[driver.id] = '';
      }
    });

    return { newPositions, newDnf };
  };

  // Auto-populate race results with skill-weighted positions
  const handleAutoPopulate = () => {
    if (!selectedRaceId) {
      Alert.alert('Error', 'Please select a race first');
      return;
    }

    Alert.alert(
      'Auto-Populate Results',
      'This will assign finishing positions weighted by driver skill. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Populate',
          onPress: () => {
            const { newPositions, newDnf } = simulateRacePositions();

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

  // Auto-populate and complete the full weekend (race + sprint if applicable)
  const handleAutoPopulateAndComplete = () => {
    if (!selectedRaceId) {
      Alert.alert('Error', 'Please select a race first');
      return;
    }

    const isSprint = selectedRace?.hasSprint;

    // --- Main race ---
    const { newPositions, newDnf } = simulateRacePositions();
    setDriverPositions(newPositions);
    setDriverDnf(newDnf);

    // Build grid from price ranking (highest price = P1 qualifying)
    const gridOrder = [...activeDrivers].sort((a, b) => b.price - a.price);
    const gridPositions: Record<string, number> = {};
    gridOrder.forEach((d, i) => { gridPositions[d.id] = i + 1; });

    Object.entries(newPositions).forEach(([driverId, positionStr]) => {
      const isDnf = newDnf[driverId] || false;
      if (isDnf) {
        updateDriverPoints(selectedRaceId, driverId, -5);
        updateDriverDnf(selectedRaceId, driverId, true);
      } else {
        const position = parseInt(positionStr, 10);
        let points = getPointsForPosition(position);
        // Position lost penalty: -1 per position lost from grid
        const grid = gridPositions[driverId] || position;
        const positionsLost = position - grid; // positive = lost positions
        if (positionsLost > 0) {
          points -= positionsLost;
        }
        updateDriverPoints(selectedRaceId, driverId, points);
        updateDriverDnf(selectedRaceId, driverId, false);
      }
    });

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

    // --- Sprint (if applicable) ---
    if (isSprint) {
      const { newPositions: sprintPos, newDnf: sprintDnfResult } = simulateRacePositions();
      setSprintPositions(sprintPos);
      setSprintDnf(sprintDnfResult);

      Object.entries(sprintPos).forEach(([driverId, positionStr]) => {
        const isDnf = sprintDnfResult[driverId] || false;
        if (isDnf) {
          updateSprintDriverPoints(selectedRaceId, driverId, -5);
          updateSprintDriverDnf(selectedRaceId, driverId, true);
        } else {
          const position = parseInt(positionStr, 10);
          const points = getSprintPointsForPosition(position);
          updateSprintDriverPoints(selectedRaceId, driverId, points);
          updateSprintDriverDnf(selectedRaceId, driverId, false);
        }
      });

      const sprintConstructorPts: Record<string, number> = {};
      demoConstructors.forEach(constructor => {
        let total = 0;
        constructor.drivers.forEach(driverId => {
          if (!sprintDnfResult[driverId]) {
            const position = parseInt(sprintPos[driverId] || '0', 10);
            total += getSprintF1PointsForPosition(position);
          }
        });
        sprintConstructorPts[constructor.id] = Math.floor(total / 2);
      });
      Object.entries(sprintConstructorPts).forEach(([constructorId, points]) => {
        updateSprintConstructorPoints(selectedRaceId, constructorId, points);
      });
    }

    // Mark race complete and commit points to all teams
    markRaceComplete(selectedRaceId);
    recalculateAllTeamsPoints();
  };

  // Reset prices to initial demoData values (keeps race results)
  const handleResetPrices = () => {
    Alert.alert(
      'Reset Driver Prices',
      'This will reset all driver and constructor prices to their initial values. Race results will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Prices',
          style: 'destructive',
          onPress: () => {
            useAdminStore.getState().resetPrices();
            Alert.alert('Done', 'All prices reset to initial values.');
          },
        },
      ]
    );
  };

  // Reset all race results only (keeps teams and prices)
  const handleResetAllRaceResults = () => {
    Alert.alert(
      'Reset All Races',
      `This will clear ALL ${completedRacesCount} completed race results and recalculate team points to 0. Teams and prices will be kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Races',
          style: 'destructive',
          onPress: () => {
            useAdminStore.getState().resetAllRaceResults();
            recalculateAllTeamsPoints();

            // Clear local state
            setSelectedRaceId(null);
            setDriverPositions({});
            setSprintPositions({});
            setDriverDnf({});
            setSprintDnf({});

            Alert.alert('Success', 'All race results have been cleared. Team points recalculated.');
          },
        },
      ]
    );
  };

  // Reset all race results (clear everything)
  const handleResetAllRaces = () => {
    Alert.alert(
      'Reset Everything',
      'This will clear ALL race results, prices, teams, and lockouts. Fresh start! This cannot be undone!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: () => {
            // Reset all admin data (races, prices)
            useAdminStore.getState().resetAllData();

            // Reset team state (clears teams, lockouts, etc.)
            useTeamStore.getState().resetTeamState();

            // Clear local state
            setSelectedRaceId(null);
            setDriverPositions({});
            setSprintPositions({});
            setDriverDnf({});
            setSprintDnf({});

            Alert.alert('Success', 'Everything has been reset! Create a new team to start fresh.');
          },
        },
      ]
    );
  };

  // Convert admin store race data to Firestore cloud format
  const convertToCloudFormat = (raceId: string): RaceResults => {
    const result = getRaceResult(raceId);
    if (!result) throw new Error('No race result found for ' + raceId);

    // Build grid from price ranking (highest price = P1 qualifying)
    const gridOrder = [...activeDrivers].sort((a, b) => b.price - a.price);
    const gridPositions: Record<string, number> = {};
    gridOrder.forEach((d, i) => { gridPositions[d.id] = i + 1; });

    // Convert driver results to cloud format
    const raceResults: CloudRaceResult[] = result.driverResults
      .filter(dr => {
        // Include drivers that have a position or are DNF
        const pos = driverPositions[dr.driverId];
        const isDnf = driverDnf[dr.driverId];
        return pos !== '' || isDnf;
      })
      .map(dr => {
        const isDnf = driverDnf[dr.driverId] || false;
        const posStr = driverPositions[dr.driverId] || '0';
        const position = isDnf ? 0 : parseInt(posStr, 10);
        const demoDriver = demoDrivers.find(d => d.id === dr.driverId);
        const constructorId = demoDriver?.constructorId || '';
        const grid = gridPositions[dr.driverId] || position;

        return {
          position,
          driverId: dr.driverId,
          constructorId,
          gridPosition: grid,
          points: dr.points,
          positionsGained: grid - position,
          laps: isDnf ? 0 : 58, // approximate
          status: isDnf ? 'dnf' as const : 'finished' as const,
          fastestLap: dr.fastestLap,
        };
      });

    // Convert sprint results if present
    let cloudSprintResults: CloudSprintResult[] | undefined;
    if (result.sprintResults && result.sprintResults.some(sr => sr.points !== 0 || sr.dnf)) {
      cloudSprintResults = result.sprintResults
        .filter(sr => {
          const pos = sprintPositions[sr.driverId];
          const isDnf = sprintDnf[sr.driverId];
          return pos !== '' || isDnf;
        })
        .map(sr => {
          const isDnf = sprintDnf[sr.driverId] || false;
          const posStr = sprintPositions[sr.driverId] || '0';
          const position = isDnf ? 0 : parseInt(posStr, 10);
          const demoDriver = demoDrivers.find(d => d.id === sr.driverId);
          const constructorId = demoDriver?.constructorId || '';

          return {
            position,
            driverId: sr.driverId,
            constructorId,
            points: sr.points,
            status: isDnf ? 'dnf' as const : 'finished' as const,
          };
        });
    }

    // Find fastest lap driver
    const fastestLapDriver = result.driverResults.find(dr => dr.fastestLap);

    // Build result object — omit undefined fields (Firestore rejects undefined values)
    const cloudResult: RaceResults = {
      raceId,
      qualifyingResults: [],
      raceResults,
      processedAt: new Date(),
    };
    if (cloudSprintResults) {
      cloudResult.sprintResults = cloudSprintResults;
    }
    if (fastestLapDriver) {
      cloudResult.fastestLap = fastestLapDriver.driverId;
    }
    return cloudResult;
  };

  // Publish race results to Firestore (first time)
  const handlePublishToCloud = async () => {
    if (!selectedRaceId || !raceResult?.isComplete) return;

    setIsSyncing(true);
    try {
      const cloudResults = convertToCloudFormat(selectedRaceId);
      await raceService.setRaceResults(selectedRaceId, cloudResults);
      markRaceCloudSynced(selectedRaceId);
      Alert.alert('Published', 'Race results published to cloud. The scoring Cloud Function will process team points automatically.');
    } catch (error: any) {
      console.error('[Admin] Cloud publish failed:', error);
      Alert.alert('Publish Failed', error.message || 'Failed to publish results to cloud.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Re-publish corrected results and re-trigger scoring
  const handleRepublishToCloud = async () => {
    if (!selectedRaceId || !raceResult?.isComplete) return;

    Alert.alert(
      'Re-publish Correction',
      'This will update the cloud results and re-trigger scoring for all teams. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Re-publish',
          onPress: async () => {
            setIsSyncing(true);
            try {
              const cloudResults = convertToCloudFormat(selectedRaceId);
              // Update results without changing status
              await raceService.updateRaceResults(selectedRaceId, cloudResults);
              // Re-trigger scoring via Cloud Function
              const calculatePoints = httpsCallable(functions, 'calculatePointsManually');
              await calculatePoints({ raceId: selectedRaceId });
              markRaceCloudSynced(selectedRaceId);
              Alert.alert('Re-published', 'Corrected results uploaded and scoring re-triggered.');
            } catch (error: any) {
              console.error('[Admin] Cloud re-publish failed:', error);
              Alert.alert('Re-publish Failed', error.message || 'Failed to re-publish results.');
            } finally {
              setIsSyncing(false);
            }
          },
        },
      ]
    );
  };

  // Import results from OpenF1 API
  const handleImportFromApi = async () => {
    if (!selectedRaceId || !selectedRace) return;

    setIsImporting(true);
    try {
      // Find the OpenF1 meeting key by country name
      const meetingKey = await openF1Service.findMeetingKeyForRace(2026, selectedRace.country);
      if (!meetingKey) {
        Alert.alert('Not Found', `Could not find OpenF1 data for ${selectedRace.country}. The race may not have happened yet.`);
        return;
      }

      const isSprint = entryMode === 'sprint';
      const apiData = await openF1Service.fetchRaceResultsForAdmin(meetingKey, isSprint);

      // Populate form with API data
      if (isSprint) {
        setSprintPositions(prev => ({ ...prev, ...apiData.positions }));
        setSprintDnf(prev => ({ ...prev, ...apiData.dnf }));
      } else {
        setDriverPositions(prev => ({ ...prev, ...apiData.positions }));
        setDriverDnf(prev => ({ ...prev, ...apiData.dnf }));
      }

      const posCount = Object.values(apiData.positions).filter(p => p !== '').length;
      const dnfCount = Object.values(apiData.dnf).filter(Boolean).length;
      Alert.alert('Imported', `Loaded ${posCount} positions and ${dnfCount} DNFs from OpenF1 API. Review and save.`);
    } catch (error: any) {
      console.error('[Admin] API import failed:', error);
      Alert.alert('Import Failed', error.message || 'Failed to fetch results from OpenF1 API.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="settings" size={24} color={theme.primary} />
        <Text style={styles.headerTitle}>Race Admin Panel</Text>
      </View>
      <Text style={styles.subtitle}>Enter finishing positions (1-22) for each driver</Text>

      {/* Summary Card */}
      <Card variant="elevated" style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{completedRacesCount}<Text style={styles.summaryTotal}>/{demoRaces.length}</Text></Text>
            <Text style={styles.summaryLabel}>Races</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: COLORS.warning }]}>{completedSprints}<Text style={[styles.summaryTotal, { color: COLORS.warning }]}>/{totalSprints}</Text></Text>
            <Text style={styles.summaryLabel}>Sprints</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{userTeams.length}</Text>
            <Text style={styles.summaryLabel}>Teams</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{demoRaces.length - completedRacesCount}</Text>
            <Text style={styles.summaryLabel}>Remaining</Text>
          </View>
        </View>
        <View style={styles.summaryActions}>
          <TouchableOpacity style={[styles.recalcButton, { backgroundColor: theme.primary + '10' }]} onPress={handleRecalculatePoints}>
            <Ionicons name="refresh" size={16} color={theme.primary} />
            <Text style={[styles.recalcButtonText, { color: theme.primary }]}>Recalculate Points</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetPricesButton} onPress={handleResetPrices}>
            <Ionicons name="cash-outline" size={16} color={COLORS.warning} />
            <Text style={styles.resetPricesButtonText}>Reset Prices</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetRacesButton} onPress={handleResetAllRaceResults}>
            <Ionicons name="refresh-circle-outline" size={16} color={COLORS.warning} />
            <Text style={styles.resetRacesButtonText}>Reset Races</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetAllButton} onPress={handleResetAllRaces}>
            <Ionicons name="trash-outline" size={16} color={COLORS.error} />
            <Text style={styles.resetAllButtonText}>Reset All</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Manage News Feed Button */}
      <TouchableOpacity
        style={[styles.newsButton, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' }]}
        onPress={() => router.push('/(tabs)/admin/news')}
      >
        <Ionicons name="newspaper-outline" size={18} color={theme.primary} />
        <Text style={[styles.newsButtonText, { color: theme.primary }]}>Manage News Feed</Text>
        {draftArticleCount > 0 && (
          <View style={styles.draftBadge}>
            <Text style={styles.draftBadgeText}>{draftArticleCount}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
      </TouchableOpacity>

      {/* League Chat Button */}
      <TouchableOpacity
        style={[styles.chatButton, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' }]}
        onPress={() => router.push('/(tabs)/admin/chat-list' as any)}
      >
        <Ionicons name="chatbubbles-outline" size={18} color={theme.primary} />
        <Text style={[styles.chatButtonText, { color: theme.primary }]}>League Chat</Text>
        {chatTotalUnread > 0 && (
          <View style={[styles.chatBadge, { backgroundColor: theme.primary }]}>
            <Text style={styles.chatBadgeText}>{chatTotalUnread}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
      </TouchableOpacity>

      {/* Error Log */}
      <TouchableOpacity
        style={styles.errorLogsButton}
        onPress={() => router.push('/(tabs)/admin/error-logs')}
      >
        <View style={styles.errorLogsHeader}>
          <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} />
          <Text style={styles.errorLogsButtonText}>Error Log</Text>
          {unreviewedCount > 0 && (
            <View style={styles.unreviewedBadge}>
              <Text style={styles.unreviewedBadgeText}>{unreviewedCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </View>
      </TouchableOpacity>

      {/* V5: Lock Override Toggle */}
      <View style={[styles.lockToggleContainer, { backgroundColor: theme.card }]}>
        <Text style={styles.lockToggleTitle}>Team Lock Override</Text>
        <View style={styles.lockToggleRow}>
          <TouchableOpacity
            style={[
              styles.lockToggleButton,
              { backgroundColor: theme.background },
              adminLockOverride === 'locked' && styles.lockToggleButtonLocked,
            ]}
            onPress={() => setAdminLockOverride(adminLockOverride === 'locked' ? null : 'locked')}
          >
            <Ionicons name="lock-closed" size={14} color={adminLockOverride === 'locked' ? COLORS.white : COLORS.error} />
            <Text style={[
              styles.lockToggleButtonText,
              adminLockOverride === 'locked' && styles.lockToggleButtonTextActive,
            ]}>Lock</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.lockToggleButton,
              { backgroundColor: theme.background },
              adminLockOverride === null && [styles.lockToggleButtonAuto, { backgroundColor: theme.primary, borderColor: theme.primary }],
            ]}
            onPress={() => setAdminLockOverride(null)}
          >
            <Ionicons name="time-outline" size={14} color={adminLockOverride === null ? COLORS.white : COLORS.text.secondary} />
            <Text style={[
              styles.lockToggleButtonText,
              adminLockOverride === null && styles.lockToggleButtonTextActive,
            ]}>Auto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.lockToggleButton,
              { backgroundColor: theme.background },
              adminLockOverride === 'unlocked' && styles.lockToggleButtonUnlocked,
            ]}
            onPress={() => setAdminLockOverride(adminLockOverride === 'unlocked' ? null : 'unlocked')}
          >
            <Ionicons name="lock-open" size={14} color={adminLockOverride === 'unlocked' ? COLORS.white : COLORS.success} />
            <Text style={[
              styles.lockToggleButtonText,
              adminLockOverride === 'unlocked' && styles.lockToggleButtonTextActive,
            ]}>Unlock</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.lockToggleStatus}>
          {adminLockOverride === 'locked' ? 'Teams Locked (override)' :
           adminLockOverride === 'unlocked' ? 'Teams Unlocked (override)' :
           'Following schedule'}
        </Text>
      </View>

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
                    { backgroundColor: theme.card },
                    selectedRaceId === race.id && [styles.raceChipSelected, { backgroundColor: theme.primary, borderColor: theme.primary }],
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
                  <View style={styles.raceChipBadges}>
                    {isComplete && (
                      <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                    )}
                    {!isComplete && hasData && (
                      <Ionicons name="ellipse" size={8} color={COLORS.warning} />
                    )}
                    {isComplete && cloudSyncedRaces[race.id] && (
                      <Ionicons name="cloud-done" size={12} color={COLORS.info} />
                    )}
                    {isComplete && !cloudSyncedRaces[race.id] && (
                      <Ionicons name="cloud-offline-outline" size={12} color={COLORS.text.muted} />
                    )}
                  </View>
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
                  { backgroundColor: theme.card },
                  entryMode === 'race' && [styles.modeToggleButtonActive, { backgroundColor: theme.primary, borderColor: theme.primary }],
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
                  { backgroundColor: theme.card },
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

          {/* Quick Actions */}
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
            <TouchableOpacity
              style={[styles.importApiButton, isImporting && styles.buttonDisabled]}
              onPress={handleImportFromApi}
              disabled={isImporting}
            >
              {isImporting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Ionicons name="download-outline" size={16} color={COLORS.white} />
              )}
              <Text style={styles.importApiButtonText}>
                {isImporting ? 'Importing...' : `Import ${entryMode === 'sprint' ? 'Sprint' : 'Race'} from OpenF1`}
              </Text>
            </TouchableOpacity>
          </View>

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
            <View style={[styles.statusBar, { backgroundColor: theme.card }]}>
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
              const points = isDnf ? -5 : (entryMode === 'sprint'
                ? getSprintPointsForPosition(posNum)
                : getPointsForPosition(posNum));
              const isDuplicate = isPositionDuplicate(driver.id, position);
              return (
                <View key={driver.id} style={[
                  styles.driverRow,
                  { backgroundColor: theme.card },
                  isDuplicate && styles.driverRowDuplicate,
                  entryMode === 'sprint' && styles.driverRowSprint,
                  isDnf && styles.driverRowDnf,
                ]}>
                  <View style={styles.driverInfo}>
                    <View style={styles.driverNameRow}>
                      <Text style={[styles.driverNumber, { color: theme.primary }]}>#{driver.number}</Text>
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
                        { backgroundColor: theme.background },
                        position && [styles.positionInputFilled, { borderColor: theme.primary, backgroundColor: theme.primary + '10' }],
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

            {/* Cloud Publish / Re-publish */}
            {raceResult?.isComplete && (
              <View style={[styles.cloudSyncSection, { backgroundColor: theme.card }]}>
                <View style={styles.cloudSyncHeader}>
                  <Ionicons
                    name={cloudSyncedRaces[selectedRaceId!] ? 'cloud-done' : 'cloud-offline-outline'}
                    size={16}
                    color={cloudSyncedRaces[selectedRaceId!] ? COLORS.info : COLORS.text.muted}
                  />
                  <Text style={styles.cloudSyncLabel}>
                    {cloudSyncedRaces[selectedRaceId!]
                      ? `Synced (v${cloudSyncedRaces[selectedRaceId!].version})`
                      : 'Local only'}
                  </Text>
                </View>
                {!cloudSyncedRaces[selectedRaceId!] ? (
                  <TouchableOpacity
                    style={[styles.publishButton, isSyncing && styles.buttonDisabled]}
                    onPress={handlePublishToCloud}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <Ionicons name="cloud-upload" size={18} color={COLORS.white} />
                    )}
                    <Text style={styles.publishButtonText}>
                      {isSyncing ? 'Publishing...' : 'Publish to Cloud'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.republishButton, isSyncing && styles.buttonDisabled]}
                    onPress={handleRepublishToCloud}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <Ionicons name="refresh-circle" size={18} color={COLORS.white} />
                    )}
                    <Text style={styles.republishButtonText}>
                      {isSyncing ? 'Re-publishing...' : 'Re-publish (Correction)'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

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

  errorLogsButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.error + '10',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.error + '30',
    marginBottom: SPACING.md,
  },
  errorLogsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  errorLogsButtonText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.error,
  },
  unreviewedBadge: {
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: SPACING.xs,
  },
  unreviewedBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.white,
  },

  newsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.primary + '10',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    marginBottom: SPACING.md,
  },
  newsButtonText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
  draftBadge: {
    backgroundColor: COLORS.warning,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: SPACING.xs,
  },
  draftBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.white,
  },

  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.primary + '10',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    marginBottom: SPACING.md,
  },
  chatButtonText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
  chatBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: SPACING.xs,
  },
  chatBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.white,
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

  summaryTotal: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    color: COLORS.text.muted,
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
    flexWrap: 'wrap',
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

  resetPricesButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.warning + '10',
    borderRadius: BORDER_RADIUS.md,
  },

  resetPricesButtonText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
    color: COLORS.warning,
  },

  resetRacesButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.warning + '10',
    borderRadius: BORDER_RADIUS.md,
  },

  resetRacesButtonText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
    color: COLORS.warning,
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

  // V5: Lock toggle
  lockToggleContainer: {
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  lockToggleTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.secondary,
    marginBottom: SPACING.sm,
  },
  lockToggleRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  lockToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  lockToggleButtonLocked: {
    backgroundColor: COLORS.error,
    borderColor: COLORS.error,
  },
  lockToggleButtonAuto: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  lockToggleButtonUnlocked: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  lockToggleButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },
  lockToggleButtonTextActive: {
    color: COLORS.white,
  },
  lockToggleStatus: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
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

  raceChipBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  importApiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: '#6366f1',
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.sm,
  },

  importApiButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.white,
  },

  cloudSyncSection: {
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    gap: SPACING.sm,
  },

  cloudSyncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  cloudSyncLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    fontWeight: '500',
  },

  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
  },

  publishButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.white,
  },

  republishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.warning,
    borderRadius: BORDER_RADIUS.md,
  },

  republishButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.white,
  },
});
