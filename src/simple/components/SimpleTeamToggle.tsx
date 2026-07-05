import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONT_FAMILY } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';

interface Props {
  activeIndex: number;
  teamCount: number;
  canCreateSecond: boolean;
  onSwitch: (index: number) => void;
  onCreateSecond: () => void;
}

export const SimpleTeamToggle = React.memo(function SimpleTeamToggle({
  activeIndex,
  teamCount,
  canCreateSecond,
  onSwitch,
  onCreateSecond,
}: Props) {
  const { colors, scaled } = useSimpleTheme();

  const styles = useMemo(() => ({
    container: {
      flexDirection: 'row' as const,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: S_RADIUS.pill,
      padding: 3,
      gap: 2,
    },
    segment: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 4,
      height: scaled(28),
      paddingHorizontal: scaled(12),
      borderRadius: S_RADIUS.pill - 3,
    },
    segmentActive: {
      backgroundColor: colors.primary,
    },
    segmentText: {
      fontSize: scaled(13),
      fontFamily: S_FONT_FAMILY.body.semibold,
      color: colors.text.secondary,
    },
    segmentTextActive: {
      color: colors.text.inverse,
    },
  }), [colors, scaled]);

  if (teamCount < 2 && !canCreateSecond) return null;

  const hasTwo = teamCount >= 2;

  const handleSecondTap = () => {
    if (hasTwo) {
      onSwitch(1);
    } else if (canCreateSecond) {
      onCreateSecond();
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.segment, activeIndex === 0 && styles.segmentActive]}
        onPress={() => onSwitch(0)}
        activeOpacity={0.7}
        accessibilityLabel="Switch to team 1"
      >
        <Text style={[styles.segmentText, activeIndex === 0 && styles.segmentTextActive]}>
          Team 1
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.segment, hasTwo && activeIndex === 1 && styles.segmentActive]}
        onPress={handleSecondTap}
        activeOpacity={0.7}
        accessibilityLabel={hasTwo ? 'Switch to team 2' : 'Create a second team'}
      >
        {!hasTwo && (
          <Ionicons name="add" size={scaled(13)} color={colors.text.secondary} />
        )}
        <Text style={[styles.segmentText, hasTwo && activeIndex === 1 && styles.segmentTextActive]}>
          Team 2
        </Text>
      </TouchableOpacity>
    </View>
  );
});
