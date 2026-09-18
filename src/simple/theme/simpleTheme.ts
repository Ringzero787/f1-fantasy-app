import { usePrefsStore } from '../../store/prefs.store';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { TEAM_COLORS } from '../../config/constants';

// Get current display scale — called at render time by components
export function getDisplayScale(): number {
  return usePrefsStore.getState().displayScale;
}

// ============================================================================
// "Grid" theme — design_handoff_grid_redesign (2026-09-18), TRANSITION.md §3.
// Black / grey / one red. No gradients, italics, shadows or skews. Unbounded
// for every piece of UI text, JetBrains Mono for every label, number, code
// and caption. Dark is the default; light is a straight inversion.
// ============================================================================

export const S_COLORS_DARK = {
  background: '#050505',   // app canvas (behind screens)
  surface: '#0E0E0E',      // screen background
  card: '#1A1A1A',         // tiles, pills, inputs
  cardPressed: '#232323',

  primary: '#FF2E2E',      // the one accent
  primaryDark: '#D91F1F',
  primaryLight: '#FF5A5A',
  primaryFaint: '#2A0F0F',

  text: {
    primary: '#F2F2F2',
    secondary: '#B3B3B3',
    muted: '#7A7A7A',      // ≥ 4.5:1 on #0E0E0E
    inverse: '#050505',    // text on text.primary fills
  },

  positive: '#4ADE80',
  negative: '#FF2E2E',
  warning: '#FFB800',

  border: '#232323',       // screen edge, section rules
  borderLight: '#1E1E1E',  // row separators
  borderStrong: '#333333', // dashed open slots, outline buttons, unselected rings

  // Sheet/modal backdrop
  scrim: 'rgba(5,5,5,0.78)',
} as const;

export const S_COLORS_LIGHT = {
  background: '#FFFFFF',
  surface: '#F4F4F2',
  card: '#E8E8E5',
  cardPressed: '#DDDDD9',

  primary: '#FF2E2E',
  primaryDark: '#D91F1F',
  primaryLight: '#FF5A5A',
  primaryFaint: '#FFE4E4',

  text: {
    primary: '#0A0A0A',
    secondary: '#3F3F3F',
    muted: '#6B6B6B',
    inverse: '#FFFFFF',
  },

  positive: '#15803D',
  negative: '#FF2E2E',
  warning: '#B45309',

  border: '#D6D6D2',
  borderLight: '#DDDDD9',
  borderStrong: '#C8C8C4',

  scrim: 'rgba(10,10,10,0.5)',
} as const;

// Backwards compatibility — dark is the canonical palette.
// Both palettes share the same key shape; SimpleColors covers both.
export const S_COLORS = S_COLORS_DARK;

export type SimpleColors = typeof S_COLORS_DARK;

// Per-weight font family names (expo-google-fonts registers one family per
// weight — do NOT combine these with fontWeight or iOS will double-embolden).
export const S_FONT_FAMILY = {
  ui: {
    regular: 'Unbounded_400Regular',
    bold: 'Unbounded_700Bold',
    black: 'Unbounded_900Black',
  },
  mono: {
    medium: 'JetBrainsMono_500Medium',
    bold: 'JetBrainsMono_700Bold',
  },
} as const;

// Type scale from TRANSITION.md §3 (px, before display scaling).
export const S_TYPE = {
  sectionLabel: 11,   // mono 700, tracking 0.18em, uppercase, muted
  caption: 10,        // mono, the only text allowed under 11px
  screenTitle: 26,    // Unbounded 900, tracking -0.03em, uppercase
  tileName: 19,       // steps to 17 (>7 chars) and 15 (>8 chars)
  seasonPoints: 56,   // 900, line-height 0.9, tracking -0.05em
  lastRace: 22,
  standingsRank: 30,
  playerName: 16,
  points: 18,         // mono 700
  tab: 12,            // 900, tracking 0.08em
} as const;

export const S_FONTS = {
  regular: 'System',
  sizes: {
    xs: 10,
    sm: 11,
    md: 13,
    lg: 16,
    xl: 19,
    xxl: 26,
    hero: 56,
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
  lg: 18,   // row padding
  xl: 24,   // screen gutter
  xxl: 34,  // bottom safe margin under the tab pill
} as const;

// Radii from §3: tiles 18 · small stat cards 14 · inputs 14 · chips 12 ·
// all pills/buttons/avatars 999.
export const S_RADIUS = {
  sm: 12,     // chips
  md: 14,     // inputs, small stat cards
  lg: 18,     // tiles, cards
  sheet: 18,
  pill: 999,
  full: 999,
} as const;

// Display-size steps offered in Profile (multiply every px value).
// Same steps as the legacy tabs profile so a saved scale always has a segment.
export const S_DISPLAY_SCALES: { key: 'S' | 'M' | 'L' | 'XL' | 'XXL'; scale: number }[] = [
  { key: 'S', scale: 0.85 },
  { key: 'M', scale: 1.0 },
  { key: 'L', scale: 1.15 },
  { key: 'XL', scale: 1.3 },
  { key: 'XXL', scale: 1.5 },
];

// Constructor accents — the handoff hexes for the seven teams it draws, ours
// for the rest of the 2026 grid (one source: TEAM_COLORS, which also seeds the
// remote-config store). Used only for the 28×3 / 20×3 colour bars. A
// constructor doc's `colors.primary` wins when remote config has loaded it.
export const S_TEAM_ACCENTS: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_COLORS).map(([id, c]) => [id, c.primary]),
);

const NEUTRALS = new Set(['#FFFFFF', '#000000', '#FFF', '#000']);

export function teamAccent(constructorId?: string | null): string {
  if (!constructorId) return '#999999';
  const remote = useRemoteConfigStore.getState().teamColors?.[constructorId]?.primary;
  if (remote && !NEUTRALS.has(remote.toUpperCase())) return remote;
  return S_TEAM_ACCENTS[constructorId] ?? '#999999';
}
