// Track Limits — design tokens, ported from the design team's tokens.jsx
// to React Native. Light/dark resolution + 5 selectable accent palettes.

import { Platform } from 'react-native';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type Palette = 'cornflower' | 'ferrari' | 'amber' | 'papaya' | 'mint';

export const TL_PALETTES: Record<Palette, string> = {
  cornflower: '#7C9CFF',
  ferrari: '#F25C54',
  amber: '#E0A458',
  papaya: '#FF8E3C',
  mint: '#7BD389',
};

export const CONSTRUCTOR_COLORS = {
  RBR: '#1E41FF',
  MER: '#27F4D2',
  FER: '#DC0000',
  MCL: '#FF8000',
  AST: '#229971',
  ALP: '#0093CC',
  WIL: '#00A0DE',
  RB: '#6692FF',
  KCK: '#52E252',
  HAA: '#B6BABD',
} as const;

// Hex + alpha → rgba()
export function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Font family aliases. Currently using system fallbacks; bundle Inter +
// JetBrains Mono via expo-font in a future pass for pixel-exact match.
const FONT_SANS = Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' });
const FONT_MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const FONT_DISPLAY = Platform.select({ ios: 'System', android: 'sans-serif-medium', default: 'System' });

export interface TLTokens {
  accent: string;
  accentDim: string;
  accentSoft: string;
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  lineSoft: string;
  text: string;
  textDim: string;
  textMute: string;
  success: string;
  warn: string;
  danger: string;
  tierA: string;
  tierAGlow: string;
  tierAEdge: string;
  tierB: string;
  tierC: string;
  fSans: string;
  fMono: string;
  fDisp: string;
  radius: { sm: number; md: number; lg: number; xl: number };
  pad: { xs: number; sm: number; md: number; lg: number; xl: number };
  dark: boolean;
}

export function makeTokens({
  palette = 'cornflower',
  theme = 'dark',
}: {
  palette?: Palette;
  theme?: 'light' | 'dark';
} = {}): TLTokens {
  const accent = TL_PALETTES[palette] ?? TL_PALETTES.cornflower;
  const dark = theme === 'dark';
  return {
    accent,
    accentDim: hexA(accent, 0.18),
    accentSoft: hexA(accent, 0.1),

    bg: dark ? '#0E1116' : '#F4F1EA',
    surface: dark ? '#161A21' : '#FFFFFF',
    surface2: dark ? '#1C212B' : '#EDE9E0',
    line: dark ? 'rgba(232,228,218,0.08)' : 'rgba(14,17,22,0.10)',
    lineSoft: dark ? 'rgba(232,228,218,0.05)' : 'rgba(14,17,22,0.06)',

    text: dark ? '#E8E4DA' : '#0E1116',
    textDim: dark ? '#A8A498' : '#3D4148',
    textMute: dark ? '#6E6E6A' : '#7A7770',

    success: '#7BD389',
    warn: '#E0A458',
    danger: '#F25C54',

    tierA: '#D4B36A',
    tierAGlow: dark ? 'rgba(212,179,106,0.18)' : 'rgba(170,135,55,0.16)',
    tierAEdge: dark ? 'rgba(212,179,106,0.55)' : 'rgba(170,135,55,0.55)',
    tierB: dark ? '#A8A498' : '#5A5C62',
    tierC: dark ? '#5A5C62' : '#9A968B',

    fSans: FONT_SANS,
    fMono: FONT_MONO,
    fDisp: FONT_DISPLAY,

    radius: { sm: 6, md: 10, lg: 14, xl: 20 },
    pad: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 },

    dark,
  };
}
