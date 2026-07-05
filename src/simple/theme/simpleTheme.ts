import { Platform } from 'react-native';
import { usePrefsStore } from '../../store/prefs.store';

// Get current display scale — called at render time by components
export function getDisplayScale(): number {
  return usePrefsStore.getState().displayScale;
}

// ============================================================================
// "Race Day" theme — F1-broadcast look per design_handoff_race_day_redesign,
// with the primary swapped from F1 red to the Undercut logo teal (user call).
// Carbon black surfaces, teal primary, italic Space Grotesk display type.
// Dark is the default ("Race Day"); light is "paddock white".
// ============================================================================

export const S_COLORS_DARK = {
  background: '#15151E',
  surface: '#1D1D28',
  card: '#22222E',
  cardPressed: '#2B2B3A',

  primary: '#14B8A6',     // Undercut logo teal
  primaryDark: '#0D9488',
  primaryLight: '#2DD4BF',
  primaryFaint: '#10302B',

  text: {
    primary: '#F5F5F7',
    secondary: '#A9A9BC',
    muted: '#6E6E82',
    inverse: '#FFFFFF',
  },

  positive: '#33CC66',
  negative: '#FF5252',
  warning: '#FFB800',

  border: '#32323F',
  borderLight: '#282833',

  gold: '#FFD24A',
  silver: '#B9B9C9',
  bronze: '#D68B4F',

  // Ace badge
  ace: '#FFD24A',
  aceBg: '#332B12',

  // Lock state
  locked: '#6E6E82',
  lockedBg: '#2B2B3A',

  // Success banner background
  positiveFaint: '#12291A',

  // Sheet/modal backdrop
  scrim: 'rgba(8,8,14,0.7)',

  // Faint diagonal speed-line texture on the stat bar
  speedLine: 'rgba(255,255,255,0.025)',
} as const;

export const S_COLORS_LIGHT = {
  background: '#F4F4F6',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardPressed: '#ECECEF',

  primary: '#0FA893',     // logo teal, darkened a touch for light-bg contrast
  primaryDark: '#0D8478',
  primaryLight: '#2DD4BF',
  primaryFaint: '#D7F1EC',

  text: {
    primary: '#15151E',
    secondary: '#4E4E5E',
    muted: '#8C8C9C',
    inverse: '#FFFFFF',
  },

  positive: '#1D9E4E',
  negative: '#D0342C',
  warning: '#C58A00',

  border: '#E2E2E8',
  borderLight: '#EDEDF1',

  gold: '#C79A2A',
  silver: '#9898A6',
  bronze: '#B0703C',

  // Ace badge
  ace: '#C79A2A',
  aceBg: '#F7EFD8',

  // Lock state
  locked: '#8C8C9C',
  lockedBg: '#ECECEF',

  // Success banner background
  positiveFaint: '#E4F3E9',

  // Sheet/modal backdrop
  scrim: 'rgba(21,21,30,0.5)',

  // Faint diagonal speed-line texture on the stat bar
  speedLine: 'rgba(21,21,30,0.03)',
} as const;

// Backwards compatibility — dark ("Race Day") is the canonical palette.
// Both palettes share the same key shape; SimpleColors covers both.
export const S_COLORS = S_COLORS_DARK;

export type SimpleColors = typeof S_COLORS_DARK;

// Per-weight font family names (expo-google-fonts registers one family per
// weight — do NOT combine these with fontWeight or iOS will double-embolden).
export const S_FONT_FAMILY = {
  body: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  display: {
    medium: 'SpaceGrotesk_500Medium',
    semibold: 'SpaceGrotesk_600SemiBold',
    bold: 'SpaceGrotesk_700Bold',
  },
} as const;

// Space Grotesk ships no italic face; the design's "italic speed type" is a
// synthesized oblique. Android ignores skew transforms on Text (verified on
// device) but synthesizes oblique via fontStyle; iOS/web do the reverse.
export const S_DISPLAY_SKEW = [{ skewX: '-8deg' }] as const;
export const S_DISPLAY_OBLIQUE = Platform.OS === 'android'
  ? ({ fontStyle: 'italic' } as const)
  : ({ transform: S_DISPLAY_SKEW as unknown as { skewX: string }[] } as const);

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
  md: 9,
  lg: 12,
  sheet: 18,
  pill: 10,      // Race Day "pill" is a squared chip, not a capsule
  full: 9999,    // true circles/capsules (avatars, round buttons)
} as const;

// Constructor accent colors tuned for Race Day surfaces (the handoff palette).
// Deliberately separate from src/config/constants TEAM_COLORS, which the
// legacy (tabs) UI still consumes — e.g. Haas moves off #E10600 here so team
// stripes never read as the primary red.
export const S_TEAM_ACCENTS: Record<string, string> = {
  mclaren: '#FF8000',
  red_bull: '#1E40AF',
  ferrari: '#DC2626',
  mercedes: '#27F4D2',
  williams: '#1868DB',
  haas: '#B91C1C',
  aston_martin: '#229971',
  alpine: '#0093CC',
  rb: '#6692FF',
  racing_bulls: '#6692FF',
  audi: '#52E252',
  cadillac: '#C7B063',
};

export function teamAccent(constructorId?: string | null): string {
  return (constructorId && S_TEAM_ACCENTS[constructorId]) || '#999999';
}

// Shade a hex by a fixed amount (negative = darker) — used for the driver
// tile gradients (linear-gradient(160deg, accent, accent shaded -34)).
export function shadeHex(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const ch = (i: number) =>
    Math.max(0, Math.min(255, parseInt(h.slice(i, i + 2), 16) + amt))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}
