import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS } from '../config/constants';
import { useTheme } from '../hooks/useTheme';

interface HeaderBackgroundProps {
  variant?: 'default' | 'gradient' | 'dark';
}

export function HeaderBackground({ variant = 'default' }: HeaderBackgroundProps) {
  const theme = useTheme();

  if (variant === 'gradient') {
    return (
      <LinearGradient
        colors={theme.gradients.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <View style={styles.patternOverlay} />
      </LinearGradient>
    );
  }

  if (variant === 'dark') {
    return (
      <LinearGradient
        colors={GRADIENTS.dark}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.container}
      >
        <View style={styles.patternOverlay} />
      </LinearGradient>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.purple[800], COLORS.purple[900]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Image
        source={require('../../assets/header-banner-lower.png')}
        style={styles.image}
        resizeMode="cover"
      />
      <View style={styles.gradientOverlay}>
        <LinearGradient
          colors={['transparent', 'rgba(76, 29, 149, 0.8)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.purple[900],
    overflow: 'hidden',
  },
  image: {
    position: 'absolute',
    right: -20,
    top: 0,
    bottom: 0,
    width: '75%',
    height: '100%',
    opacity: 0.35,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  patternOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.05,
    // This creates a subtle pattern effect
    backgroundColor: 'transparent',
  },
});
