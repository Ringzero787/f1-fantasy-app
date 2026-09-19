import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { launchFailsafeMs, launchTimeline, revealScaleCurve, wordmarkLayout } from './launchReveal';

const U = require('../../../assets/launch/wordmark-u.png');
const REST = require('../../../assets/launch/wordmark-rest.png');
const GROUND = '#0E0E0E'; // same as the native splash, in light and dark

// The native splash would otherwise fade out on its own schedule, on top of a
// reveal that has already started. Hold it until the overlay's first frame (a U
// in the same place) is on screen, then let it go and start moving.
SplashScreen.preventAutoHideAsync().catch(() => {});
try { SplashScreen.setOptions({ duration: 200, fade: true }); } catch { /* older native module */ }
// If this component never mounts, never leave the user on the splash.
const splashFailsafe = setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, 6000);

async function releaseSplash(): Promise<void> {
  clearTimeout(splashFailsafe);
  // one frame so the overlay is painted before the splash starts to go
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await SplashScreen.hideAsync().catch(() => {});
}

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
    Promise.all([AccessibilityInfo.isReduceMotionEnabled().catch(() => false), releaseSplash()]).then(([reduce]) => {
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
