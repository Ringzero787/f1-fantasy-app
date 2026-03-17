import { StyleSheet } from 'react-native';

export const S_COLORS = {
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
} as const;

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

// Reusable card style
export const sCard = StyleSheet.create({
  base: {
    backgroundColor: S_COLORS.card,
    borderRadius: S_RADIUS.md,
    borderWidth: 1,
    borderColor: S_COLORS.borderLight,
    padding: S_SPACING.md,
  },
  flat: {
    backgroundColor: S_COLORS.surface,
    borderRadius: S_RADIUS.md,
    padding: S_SPACING.md,
  },
});
