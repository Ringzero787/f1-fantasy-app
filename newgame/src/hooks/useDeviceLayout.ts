// Device-class detection + user font/size scaling for responsive layout.
// Phones use the full width; tablets render existing phone-shaped layouts
// in a centered column so content reads at the same density it does on
// phone instead of becoming a sea of tiny widgets in a huge canvas.
//
// Tablet cutoff is the standard 600dp on the shortest side (matches Android's
// definition of `sw600dp` and Google's tablet-sized device class).
//
// `scale(n)` multiplies a base size by the user's display-scale preference
// (Profile → display size). Use it for any font size or padding you want
// the user's accessibility setting to influence.

import { useWindowDimensions } from 'react-native';
import { usePrefsStore } from '@store/prefs.store';

export interface DeviceLayout {
  isTablet: boolean;
  width: number;
  height: number;
  /** Suggested max-width for a phone-shaped content column on tablet.
   *  Returns the full width on phones (no constraint). */
  contentMaxWidth: number;
  /** User's display-scale preference (1.0 = native). */
  fontScale: number;
  /** Multiply a base pixel value by the user's display-scale preference. */
  scale: (n: number) => number;
}

const TABLET_SHORT_SIDE_DP = 600;
const TABLET_CONTENT_MAX_WIDTH = 720;

export function useDeviceLayout(): DeviceLayout {
  const { width, height } = useWindowDimensions();
  const fontScale = usePrefsStore((s) => s.displayScale);
  const shortSide = Math.min(width, height);
  const isTablet = shortSide >= TABLET_SHORT_SIDE_DP;
  const scale = (n: number) => Math.round(n * fontScale);
  return {
    isTablet,
    width,
    height,
    contentMaxWidth: isTablet ? TABLET_CONTENT_MAX_WIDTH : width,
    fontScale,
    scale,
  };
}
