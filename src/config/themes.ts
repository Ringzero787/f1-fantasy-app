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
}

export const CONSTRUCTOR_THEMES: Record<ConstructorThemeId, ConstructorThemeDef> = {
  default:      { label: 'Default',       primary: '#00D4FF', secondary: '#0EA5E9' },
  red_bull:     { label: 'Red Bull',      primary: '#1E3A8A', secondary: '#0600EF' },
  ferrari:      { label: 'Ferrari',       primary: '#DC2626', secondary: '#A91D1D' },
  mclaren:      { label: 'McLaren',       primary: '#FF8000', secondary: '#E67300' },
  mercedes:     { label: 'Mercedes',      primary: '#00D2BE', secondary: '#00A19C' },
  aston_martin: { label: 'Aston Martin',  primary: '#006F62', secondary: '#00483B' },
  alpine:       { label: 'Alpine',        primary: '#0090FF', secondary: '#FF87BC' },
  williams:     { label: 'Williams',      primary: '#005AFF', secondary: '#00A3E0' },
  rb:           { label: 'RB',            primary: '#2B4562', secondary: '#1634B5' },
  haas:         { label: 'Haas',          primary: '#B6BABD', secondary: '#E10600' },
  audi:         { label: 'Audi',          primary: '#8C8C8C', secondary: '#BB0A30' },
  cadillac:     { label: 'Cadillac',      primary: '#C0C0C0', secondary: '#1C1C1C' },
};

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  accent: string;
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

export function buildTheme(primary: string, secondary: string): ThemeColors {
  const lum = luminance(primary);
  const contrastText = lum > 0.25 ? '#0D1117' : '#FFFFFF';
  // For tab active background, light primaries work as-is; for dark ones use primary
  const tabActiveText = lum > 0.25 ? '#0D1117' : '#0D1117';

  return {
    primary,
    primaryDark: darken(primary, 0.20),
    primaryLight: lighten(primary, 0.30),
    secondary,
    accent: primary,
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
