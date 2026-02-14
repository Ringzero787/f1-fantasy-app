import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  Dimensions,
  TouchableOpacity,
  ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, GRADIENTS, SHADOWS } from '../config/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingTutorialProps {
  visible: boolean;
  onComplete: () => void;
}

interface Slide {
  id: string;
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    title: 'Welcome to Undercut',
    body: 'Build your dream F1 team and compete against friends all season long.',
    icon: 'flag',
  },
  {
    id: '2',
    title: 'Build Your Team',
    body: 'Pick 5 drivers and 1 constructor within a $1,000 budget. Prices change after every race based on real performance.',
    icon: 'people',
  },
  {
    id: '3',
    title: 'Set Your Ace',
    body: 'Choose one driver as your Ace for 2\u00D7 points each race. Only drivers $240 or under qualify \u2014 find the hidden gems.',
    icon: 'diamond',
  },
  {
    id: '4',
    title: 'Contracts & Loyalty',
    body: 'Drivers sign 3-race contracts. Hold them longer to earn loyalty bonuses \u2014 up to +3 extra points per race.',
    icon: 'document-text',
  },
  {
    id: '5',
    title: 'Join a League',
    body: 'Create or join a league with friends. Share an invite code and battle it out on the leaderboard all season.',
    icon: 'trophy',
  },
  {
    id: '6',
    title: "You're Ready",
    body: 'Head to the Market to scout drivers, check the Calendar for upcoming races, and build your team. Let\u2019s go!',
    icon: 'rocket',
  },
];

export function OnboardingTutorial({ visible, onComplete }: OnboardingTutorialProps) {
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    }
  };

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={styles.slide}>
      <View style={styles.slideContent}>
        <View style={styles.iconCircle}>
          <Ionicons name={item.icon} size={64} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>
      </View>
    </View>
  );

  const isLastSlide = currentIndex === SLIDES.length - 1;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <View style={styles.container}>
        {/* Skip button */}
        {!isLastSlide && (
          <TouchableOpacity style={styles.skipButton} onPress={onComplete}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}

        {/* Slides */}
        <FlatList
          ref={flatListRef}
          data={SLIDES}
          renderItem={renderSlide}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
        />

        {/* Bottom section */}
        <View style={styles.bottomSection}>
          {/* Dot indicators */}
          <View style={styles.dotsContainer}>
            {SLIDES.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === currentIndex ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>

          {/* Action button */}
          {isLastSlide ? (
            <TouchableOpacity onPress={onComplete} activeOpacity={0.85} style={styles.buttonWrapper}>
              <LinearGradient
                colors={GRADIENTS.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.actionButton, SHADOWS.glow]}
              >
                <Text style={styles.actionButtonText}>Get Started</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleNext}
              activeOpacity={0.85}
              style={[styles.actionButton, styles.nextButton]}
            >
              <Text style={styles.nextButtonText}>Next</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  skipButton: {
    position: 'absolute',
    top: 56,
    right: SPACING.lg,
    zIndex: 10,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  skipText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.muted,
    fontWeight: '500',
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  slideContent: {
    alignItems: 'center',
    maxWidth: 320,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  body: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  bottomSection: {
    paddingBottom: 50,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.xl,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: COLORS.primary,
    width: 24,
  },
  dotInactive: {
    backgroundColor: COLORS.gray[600],
  },
  buttonWrapper: {
    width: '100%',
  },
  actionButton: {
    width: '100%',
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  actionButtonText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.inverse,
    letterSpacing: 0.3,
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.glow,
  },
  nextButtonText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.inverse,
    letterSpacing: 0.3,
  },
});
