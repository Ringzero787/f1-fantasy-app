import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { launchFailsafeMs, launchTimeline, revealScaleCurve, wordmarkLayout } from './launchReveal';

const U = require('../../../assets/launch/wordmark-u.png');
const REST = require('../../../assets/launch/wordmark-rest.png');
const GROUND = '#0E0E0E'; // same as the native splash, in light and dark

/**
 * Cold-start overlay: the splash's U unrolls into UNDERCUT, then fades into
 * the app. Mounted once by the root layout, above everything.
 */
export function LaunchReveal() {
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => wordmarkLayout(width, height), [width, height]);
  const [done, setDone] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    let failsafe: ReturnType<typeof setTimeout> | undefined;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
      if (cancelled) return;
      const t = launchTimeline(!!reduce);
      if (reduce) progress.setValue(1);
      // Never leave the app covered if an animation callback is dropped.
      failsafe = setTimeout(() => setDone(true), launchFailsafeMs(t));
      Animated.sequence([
        Animated.delay(t.hold),
        Animated.timing(progress, { toValue: 1, duration: t.reveal, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.delay(t.settle),
        Animated.timing(opacity, { toValue: 0, duration: t.fade, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      ]).start(() => setDone(true));
    });
    return () => { cancelled = true; if (failsafe) clearTimeout(failsafe); };
  }, [progress, opacity]);

  if (done) return null;

  const restWidth = progress.interpolate({ inputRange: [0, 1], outputRange: [0, layout.restWidth] });
  const curve = revealScaleCurve(layout, width);
  const scale = progress.interpolate({ inputRange: curve.input, outputRange: curve.output });

  return (
    <Animated.View
      accessible
      accessibilityLabel="Undercut"
      style={[StyleSheet.absoluteFill, styles.ground, { opacity }]}
    >
      <Animated.View style={{ flexDirection: 'row', transform: [{ scale }] }}>
        <Image source={U} style={{ width: layout.uWidth, height: layout.height }} fadeDuration={0} />
        <Animated.View style={{ width: restWidth, height: layout.height, overflow: 'hidden' }}>
          <Image source={REST} style={{ width: layout.restWidth, height: layout.height }} fadeDuration={0} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ground: { backgroundColor: GROUND, alignItems: 'center', justifyContent: 'center', zIndex: 9999, elevation: 9999 },
});
