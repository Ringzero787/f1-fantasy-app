import React, { useState } from 'react';
import {
  TouchableOpacity,
  Modal,
  View,
  StyleSheet,
  Dimensions,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../../config/constants';

interface ImageMessageProps {
  imageUrl: string;
}

const SCREEN = Dimensions.get('window');

export function ImageMessage({ imageUrl }: ImageMessageProps) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <TouchableOpacity onPress={() => setFullscreen(true)} activeOpacity={0.8}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.thumbnail}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      </TouchableOpacity>

      <Modal
        visible={fullscreen}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreen(false)}
      >
        <View style={styles.fullscreenContainer}>
          <Pressable
            style={styles.fullscreenBackdrop}
            onPress={() => setFullscreen(false)}
          />
          <Image
            source={{ uri: imageUrl }}
            style={styles.fullscreenImage}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setFullscreen(false)}
          >
            <Ionicons name="close-circle" size={36} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumbnail: {
    width: 240,
    height: 240,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xs,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  fullscreenImage: {
    width: SCREEN.width,
    height: SCREEN.height * 0.8,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
  },
});
