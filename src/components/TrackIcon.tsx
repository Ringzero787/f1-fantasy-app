import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
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
    // Fallback: show empty container
    return (
      <View style={[
        styles.container,
        styles.fallback,
        { width: size, height: size, borderRadius: size * 0.15 },
        style
      ]} />
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
