import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, TEAM_COLORS } from '../config/constants';
import { useTheme } from '../hooks/useTheme';
import { useScale } from '../hooks/useScale';
import { Avatar } from './Avatar';
import type { FantasyTeam } from '../types';

interface SpoilerFreeOverlayProps {
  team: FantasyTeam;
  raceName: string;
  onDismiss: () => void;
}

export function SpoilerFreeOverlay({ team, raceName, onDismiss }: SpoilerFreeOverlayProps) {
  const theme = useTheme();
  const { scaledFonts } = useScale();

  const aceDriverId = team.aceDriverId;
  const aceConstructorId = team.aceConstructorId;

  return (
    <TouchableWithoutFeedback onPress={onDismiss}>
      <View style={[styles.overlay, { backgroundColor: theme.background }]}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={styles.header}>
          <Avatar
            name={team.name}
            size="large"
            variant="team"
            imageUrl={team.avatarUrl || null}
          />
          <Text style={[styles.teamName, { fontSize: scaledFonts.xxl }]}>{team.name}</Text>
          <View style={styles.raceBadge}>
            <Ionicons name="flag" size={14} color="#7c3aed" />
            <Text style={[styles.raceText, { fontSize: scaledFonts.sm }]}>{raceName}</Text>
          </View>
        </View>

        {/* Drivers */}
        <View style={styles.rosterSection}>
          <Text style={[styles.sectionLabel, { fontSize: scaledFonts.sm }]}>DRIVERS</Text>
          {team.drivers.map((driver) => {
            const color = TEAM_COLORS[driver.constructorId]?.primary || '#4B5563';
            const isAce = driver.driverId === aceDriverId;
            return (
              <View key={driver.driverId} style={[styles.rosterRow, { borderLeftColor: color, backgroundColor: theme.card }]}>
                <View style={[styles.colorDot, { backgroundColor: color }]} />
                <Text style={[styles.driverName, { fontSize: scaledFonts.lg }]}>{driver.name}</Text>
                {isAce && (
                  <View style={styles.aceBadge}>
                    <Ionicons name="diamond" size={12} color={COLORS.white} />
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Constructor */}
        {team.constructor && (
          <View style={styles.rosterSection}>
            <Text style={[styles.sectionLabel, { fontSize: scaledFonts.sm }]}>CONSTRUCTOR</Text>
            <View style={[styles.rosterRow, { borderLeftColor: TEAM_COLORS[team.constructor.constructorId]?.primary || '#4B5563', backgroundColor: theme.card }]}>
              <View style={[styles.colorDot, { backgroundColor: TEAM_COLORS[team.constructor.constructorId]?.primary || '#4B5563' }]} />
              <Text style={[styles.driverName, { fontSize: scaledFonts.lg }]}>{team.constructor.name}</Text>
              {team.constructor.constructorId === aceConstructorId && (
                <View style={styles.aceBadge}>
                  <Ionicons name="diamond" size={12} color={COLORS.white} />
                </View>
              )}
            </View>
          </View>
        )}

        {/* Dismiss hint */}
        <Text style={[styles.dismissHint, { fontSize: scaledFonts.sm }]}>Tap anywhere to continue</Text>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  teamName: {
    fontWeight: '800',
    color: COLORS.text.primary,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  raceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: '#7c3aed' + '18',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.sm,
  },
  raceText: {
    color: '#7c3aed',
    fontWeight: '600',
  },
  rosterSection: {
    width: '100%',
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    color: COLORS.text.muted,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
    borderLeftWidth: 4,
    gap: SPACING.sm,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  driverName: {
    fontWeight: '600',
    color: COLORS.text.primary,
    flex: 1,
  },
  aceBadge: {
    backgroundColor: COLORS.gold,
    borderRadius: BORDER_RADIUS.full,
    padding: 3,
  },
  dismissHint: {
    color: COLORS.text.muted,
    marginTop: SPACING.xl,
  },
});
