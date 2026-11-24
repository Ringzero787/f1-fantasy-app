import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTrackImage } from '../data/trackImages';
import { COLORS } from '../config/constants';

interface TrackIconProps {
  country: string;
  city?: string;
  size?: number;
  style?: object;
}

export function TrackIcon({ country, city, size = 48, style }: TrackIconProps) {
  const trackImage = getTrackImage(country, city);

  if (!trackImage) {
    // F-157: a circuit with no artwork (new to the calendar: Portimão and Istanbul Park in 2027)
    // shows a neutral flag, never a blank tile and never another circuit's outline.
    return (
      <View
        accessibilityLabel={city || country}
        style={[
          styles.container,
          styles.fallback,
          { width: size, height: size, borderRadius: size * 0.15 },
          style
        ]}
      >
        <Ionicons name="flag-outline" size={Math.round(size * 0.45)} color={COLORS.gray[500]} />
      </View>
    );
  }

  return (
    <View style={[
      styles.container,
      { width: size, height: size, borderRadius: size * 0.15 },
      style
    ]}>
      <Image
        source={trackImage}
        style={{
          width: size,
          height: size,
        }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: COLORS.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    backgroundColor: COLORS.gray[200],
  },
});
