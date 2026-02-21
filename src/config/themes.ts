// ============================================
// Constructor Color Theming
// ============================================

export type ConstructorThemeId =
  | 'default'
  | 'red_bull'
  | 'ferrari'
  | 'mclaren'
  | 'mercedes'
  | 'aston_martin'
  | 'alpine'
  | 'williams'
  | 'rb'
  | 'haas'
  | 'audi'
  | 'cadillac';

interface ConstructorThemeDef {
  label: string;
  primary: string;
  secondary: string;
  background?: string;
  surface?: string;
  card?: string;
  cardElevated?: string;
}

export const CONSTRUCTOR_THEMES: Record<ConstructorThemeId, ConstructorThemeDef> = {
  default:      { label: 'Default',       primary: '#00D4FF', secondary: '#0EA5E9' },
  red_bull:     { label: 'Red Bull',      primary: '#1E3A8A', secondary: '#E10600',
                  background: '#0D1225', surface: '#141A30', card: '#1A2240', cardElevated: '#20294A' },
  ferrari:      { label: 'Ferrari',       primary: '#DC2626', secondary: '#A91D1D',
                  background: '#150D0D', surface: '#1E1214', card: '#2A181A', cardElevated: '#321C1F' },
  mclaren:      { label: 'McLaren',       primary: '#FF8000', secondary: '#E67300',
                  background: '#14110D', surface: '#1E1812', card: '#2A2118', cardElevated: '#32281D' },
  mercedes:     { label: 'Mercedes',      primary: '#00D2BE', secondary: '#00A19C',
                  background: '#0D1515', surface: '#121E1D', card: '#182A28', cardElevated: '#1D322F' },
  aston_martin: { label: 'Aston Martin',  primary: '#006F62', secondary: '#00483B',
                  background: '#0D1312', surface: '#121B19', card: '#182520', cardElevated: '#1D2D27' },
  alpine:       { label: 'Alpine',        primary: '#0090FF', secondary: '#FF87BC',
                  background: '#0D1219', surface: '#121A24', card: '#182230', cardElevated: '#1D2938' },
  williams:     { label: 'Williams',      primary: '#005AFF', secondary: '#00A3E0',
                  background: '#0D1120', surface: '#12182A', card: '#182038', cardElevated: '#1D2742' },
  rb:           { label: 'RB',            primary: '#FFFFFF', secondary: '#1634B5',
                  background: '#0D1020', surface: '#12162A', card: '#181E38', cardElevated: '#1D2442' },
  haas:         { label: 'Haas',          primary: '#FFFFFF', secondary: '#E10600',
                  background: '#130D0D', surface: '#1C1214', card: '#26181A', cardElevated: '#2E1C1F' },
  audi:         { label: 'Audi',          primary: '#8C8C8C', secondary: '#BB0A30',
                  background: '#120D0F', surface: '#1A1215', card: '#24181D', cardElevated: '#2C1D23' },
  cadillac:     { label: 'Cadillac',      primary: '#C0C0C0', secondary: '#1C1C1C',
                  background: '#101010', surface: '#181818', card: '#202020', cardElevated: '#282828' },
};

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  card: string;
  cardElevated: string;
  brand: {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  };
  glass: {
    brand: string;
    brandStrong: string;
  };
  tab: {
    active: string;
    activeText: string;
  };
  border: {
    accent: string;
  };
  gradients: {
    primary: readonly [string, string];
    primaryDark: readonly [string, string];
    primarySubtle: readonly [string, string];
    accent: readonly [string, string];
    accentGlow: readonly [string, string];
    buttonPrimary: readonly [string, string];
    cardHighlight: readonly [string, string];
  };
  shadows: {
    glow: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    };
    glowStrong: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    };
    glowSubtle: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    };
  };
  primaryContrastText: string;
}

// ---- Color helpers (no external deps) ----

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map(c => clamp(c).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - amount;
  return rgbToHex(r * f, g * f, b * f);
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

function withOpacity(hex: string, opacity: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Relative luminance (WCAG) */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Blend a tint color into a dark base at the given ratio (0–1) */
function blendWithBase(tint: string, ratio: number, base = '#0D1117'): string {
  const [br, bg, bb] = hexToRgb(base);
  const [tr, tg, tb] = hexToRgb(tint);
  return rgbToHex(
    br + (tr - br) * ratio,
    bg + (tg - bg) * ratio,
    bb + (tb - bb) * ratio,
  );
}

function buildBrandPalette(primary: string) {
  return {
    50: lighten(primary, 0.90),
    100: lighten(primary, 0.80),
    200: lighten(primary, 0.60),
    300: lighten(primary, 0.40),
    400: lighten(primary, 0.15),
    500: primary,
    600: darken(primary, 0.15),
    700: darken(primary, 0.30),
    800: darken(primary, 0.45),
    900: darken(primary, 0.60),
  };
}

interface SurfaceOverrides {
  background?: string;
  surface?: string;
  card?: string;
  cardElevated?: string;
}

export function buildTheme(primary: string, secondary: string, overrides?: SurfaceOverrides): ThemeColors {
  const lum = luminance(primary);
  const contrastText = lum > 0.25 ? '#0D1117' : '#FFFFFF';
  const tabActiveText = lum > 0.25 ? '#0D1117' : '#0D1117';

  // Pick a tint color — use primary if dark enough, otherwise secondary
  const tint = lum < 0.25 ? primary : secondary;

  return {
    primary,
    primaryDark: darken(primary, 0.20),
    primaryLight: lighten(primary, 0.30),
    secondary,
    accent: primary,
    background:    overrides?.background    ?? blendWithBase(tint, 0.08),
    surface:       overrides?.surface       ?? blendWithBase(tint, 0.12),
    card:          overrides?.card          ?? blendWithBase(tint, 0.18),
    cardElevated:  overrides?.cardElevated  ?? blendWithBase(tint, 0.22),
    brand: buildBrandPalette(primary),
    glass: {
      brand: withOpacity(primary, 0.10),
      brandStrong: withOpacity(primary, 0.20),
    },
    tab: {
      active: primary,
      activeText: tabActiveText,
    },
    border: {
      accent: withOpacity(primary, 0.30),
    },
    gradients: {
      primary: [primary, secondary] as const,
      primaryDark: [darken(primary, 0.20), darken(secondary, 0.20)] as const,
      primarySubtle: [withOpacity(primary, 0.2), withOpacity(secondary, 0.1)] as const,
      accent: [primary, lighten(primary, 0.15)] as const,
      accentGlow: [withOpacity(primary, 0.4), withOpacity(primary, 0)] as const,
      buttonPrimary: [primary, secondary] as const,
      cardHighlight: [withOpacity(primary, 0.1), withOpacity(primary, 0.05)] as const,
    },
    shadows: {
      glow: {
        shadowColor: primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 6,
      },
      glowStrong: {
        shadowColor: primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
        elevation: 8,
      },
      glowSubtle: {
        shadowColor: primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
      },
    },
    primaryContrastText: contrastText,
  };
}

// Pre-built default theme — zero computation at runtime for the common case
export const DEFAULT_THEME: ThemeColors = {
  primary: '#00D4FF',
  primaryDark: '#00A3CC',
  primaryLight: '#5CE1FF',
  secondary: '#0EA5E9',
  accent: '#00D4FF',
  background: '#0D1117',
  surface: '#161B22',
  card: '#1E2530',
  cardElevated: '#242C3A',
  brand: {
    50: '#ECFEFF',
    100: '#CFFAFE',
    200: '#A5F3FC',
    300: '#67E8F9',
    400: '#22D3EE',
    500: '#00D4FF',
    600: '#00A3CC',
    700: '#0E7490',
    800: '#155E75',
    900: '#164E63',
  },
  glass: {
    brand: 'rgba(0, 212, 255, 0.1)',
    brandStrong: 'rgba(0, 212, 255, 0.2)',
  },
  tab: {
    active: '#00D4FF',
    activeText: '#0D1117',
  },
  border: {
    accent: 'rgba(0, 212, 255, 0.3)',
  },
  gradients: {
    primary: ['#00D4FF', '#0EA5E9'],
    primaryDark: ['#00A3CC', '#0284C7'],
    primarySubtle: ['rgba(0, 212, 255, 0.2)', 'rgba(14, 165, 233, 0.1)'],
    accent: ['#00D4FF', '#22D3EE'],
    accentGlow: ['rgba(0, 212, 255, 0.4)', 'rgba(0, 212, 255, 0)'],
    buttonPrimary: ['#00D4FF', '#0EA5E9'],
    cardHighlight: ['rgba(0, 212, 255, 0.1)', 'rgba(0, 212, 255, 0.05)'],
  },
  shadows: {
    glow: {
      shadowColor: '#00D4FF',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 6,
    },
    glowStrong: {
      shadowColor: '#00D4FF',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 20,
      elevation: 8,
    },
    glowSubtle: {
      shadowColor: '#00D4FF',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
  },
  primaryContrastText: '#0D1117',
};
