import { usePrefsStore } from '../../store/prefs.store';

// Get current display scale — called at render time by components
export function getDisplayScale(): number {
  return usePrefsStore.getState().displayScale;
}

export const S_COLORS_LIGHT = {
  background: '#FFFFFF',
  surface: '#F6FAFA',
  card: '#EDF5F5',
  cardPressed: '#E0EDED',

  primary: '#14B8A6',     // Teal-500 (matches Undercut branding)
  primaryDark: '#0D9488',
  primaryLight: '#5EEAD4',
  primaryFaint: '#E6F7F5',

  text: {
    primary: '#1A2A2E',
    secondary: '#4B5E63',
    muted: '#8A9BA0',
    inverse: '#FFFFFF',
  },

  positive: '#2E7D32',
  negative: '#C62828',
  warning: '#E67E22',

  border: '#D0E0E0',
  borderLight: '#E4EEEE',

  gold: '#C5960C',
  silver: '#757575',
  bronze: '#8D6E63',

  // Ace badge
  ace: '#C5960C',
  aceBg: '#FFF8E1',

  // Lock state
  locked: '#8A9BA0',
  lockedBg: '#EDF5F5',

  // Success banner background
  positiveFaint: '#E8F5E9',
} as const;

export const S_COLORS_DARK = {
  background: '#0F1A1C',
  surface: '#162226',
  card: '#1C2C30',
  cardPressed: '#253A3F',

  primary: '#14B8A6',     // Teal-500 — same in both themes
  primaryDark: '#0D9488',
  primaryLight: '#5EEAD4',
  primaryFaint: '#0D2E2A',

  text: {
    primary: '#E8F0F0',
    secondary: '#A0B4B8',
    muted: '#6B8085',
    inverse: '#0F1A1C',
  },

  positive: '#4CAF50',
  negative: '#EF5350',
  warning: '#F0A040',

  border: '#2A3E42',
  borderLight: '#223236',

  gold: '#D4A520',
  silver: '#9E9E9E',
  bronze: '#A1887F',

  // Ace badge
  ace: '#D4A520',
  aceBg: '#2A2410',

  // Lock state
  locked: '#6B8085',
  lockedBg: '#1C2C30',

  // Success banner background
  positiveFaint: '#1A2E1A',
} as const;

// Backwards compatibility — light palette is the default
export const S_COLORS = S_COLORS_LIGHT;

export type SimpleColors = typeof S_COLORS_LIGHT;

export const S_FONTS = {
  regular: 'System',
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 22,
    hero: 28,
  },
  weights: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

export const S_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const S_RADIUS = {
  sm: 6,
  md: 8,
  lg: 12,
  pill: 9999,
} as const;
