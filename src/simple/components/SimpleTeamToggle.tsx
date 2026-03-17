import React from 'react';
import { Image, TouchableOpacity, StyleSheet } from 'react-native';

// Single image with both states side by side — we crop to show only the active half
const toggleImage = require('../../../assets/toggle-switch.png');

interface Props {
  activeIndex: number;
  teamCount: number;
  canCreateSecond: boolean;
  onSwitch: (index: number) => void;
  onCreateSecond: () => void;
}

// Image dimensions: the source has two switches side by side
// Left = Team 1 (on/teal), Right = Team 2 (off/gray)
const DISPLAY_W = 36;
const DISPLAY_H = 64;
const SOURCE_ASPECT = 0.44; // each switch is roughly 44% as wide as tall

export const SimpleTeamToggle = React.memo(function SimpleTeamToggle({
  activeIndex,
  teamCount,
  canCreateSecond,
  onSwitch,
  onCreateSecond,
}: Props) {
  if (teamCount < 2 && !canCreateSecond) return null;

  const hasTwo = teamCount >= 2;
  const showTeam2 = activeIndex === 1;

  const handleTap = () => {
    if (hasTwo) {
      onSwitch(activeIndex === 0 ? 1 : 0);
    } else if (canCreateSecond) {
      onCreateSecond();
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handleTap}
      activeOpacity={0.8}
    >
      <Image
        source={toggleImage}
        style={[
          styles.image,
          // Crop to show only left half (team 1) or right half (team 2)
          showTeam2 ? styles.showRight : styles.showLeft,
        ]}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    width: DISPLAY_W,
    height: DISPLAY_H,
    overflow: 'hidden',
    borderRadius: 10,
  },
  image: {
    width: DISPLAY_W * 2,
    height: DISPLAY_H,
    position: 'absolute',
    top: 0,
  },
  showLeft: {
    left: 0,
  },
  showRight: {
    left: -DISPLAY_W,
  },
});
