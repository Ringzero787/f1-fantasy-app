// ============================================
// Game Constants
// ============================================

export const BUDGET = 1000;
export const TEAM_SIZE = 5; // Number of drivers
export const CONSTRUCTORS_PER_TEAM = 1;
export const SALE_COMMISSION_RATE = 0.05; // 5% commission on sales
export const STAR_DRIVER_BONUS = 0.50; // 50% bonus for star driver/constructor

// ============================================
// Scoring Points
// ============================================

export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
export const FASTEST_LAP_BONUS = 1;
export const POSITION_GAINED_BONUS = 1;
export const DNF_PENALTY = 0;
export const DSQ_PENALTY = -5;

// ============================================
// Price Tier Thresholds
// ============================================

export const TIER_A_THRESHOLD = 200; // Price >= 200 is A-tier
export const TIER_B_THRESHOLD = 200; // Price < 200 is B-tier

// ============================================
// PPM (Points Per Million) Thresholds
// ============================================

export const PPM_GREAT = 0.8;
export const PPM_GOOD = 0.6;
export const PPM_POOR = 0.4;

// ============================================
// Price Changes per Performance
// ============================================

export const PRICE_CHANGES = {
  A_TIER: {
    great: 15,
    good: 5,
    poor: -5,
    terrible: -15,
  },
  B_TIER: {
    great: 10,
    good: 3,
    poor: -3,
    terrible: -10,
  },
} as const;

// ============================================
// Lock Bonus Configuration
// ============================================

export const LOCK_BONUS = {
  TIER_1: { maxRaces: 3, bonusPerRace: 1 },
  TIER_2: { maxRaces: 6, bonusPerRace: 2 },
  TIER_3: { maxRaces: Infinity, bonusPerRace: 3 },
  FULL_SEASON_RACES: 24,
  FULL_SEASON_BONUS: 100,
} as const;

// ============================================
// Season Lock
// ============================================

export const SEASON_LOCK_RACES = 24;
export const EARLY_UNLOCK_FEE = 50; // Budget points penalty

// ============================================
// League Settings
// ============================================

export const DEFAULT_MAX_MEMBERS = 20;
export const MIN_LEAGUE_NAME_LENGTH = 3;
export const MAX_LEAGUE_NAME_LENGTH = 50;
export const INVITE_CODE_LENGTH = 8;
export const INVITE_EXPIRY_DAYS = 7;

// ============================================
// UI Constants
// ============================================

export const ITEMS_PER_PAGE = 20;
export const DEBOUNCE_MS = 300;

// ============================================
// Theme Colors
// ============================================

export const COLORS = {
  // Brand - Modern Purple Theme
  primary: '#6D28D9', // Vibrant purple
  primaryDark: '#4C1D95', // Deep purple
  primaryLight: '#8B5CF6', // Light purple
  secondary: '#7C3AED', // Violet
  accent: '#A78BFA', // Soft violet accent

  // New accent colors for variety
  teal: '#14B8A6',
  indigo: '#6366F1',
  rose: '#F43F5E',

  // Backgrounds - Subtle warm tint
  background: '#FAFAFA', // Slight off-white for depth
  surface: '#FFFFFF', // Pure white surface
  card: '#FFFFFF', // White cards
  cardBorder: '#E5E7EB', // Light gray border
  cardHover: '#F9FAFB', // Subtle hover state

  // Status - More vibrant
  success: '#10B981',
  successLight: '#D1FAE5',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  info: '#3B82F6',
  infoLight: '#DBEAFE',

  // Text - Higher contrast
  text: {
    primary: '#111827', // Near black for better contrast
    secondary: '#4B5563', // Darker secondary
    light: '#9CA3AF', // Light gray
    muted: '#6B7280', // Muted text
    inverse: '#FFFFFF', // White text on dark backgrounds
  },

  // Neutrals
  white: '#FFFFFF',
  black: '#000000',
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
    950: '#030712',
  },

  // Price indicators - More saturated
  priceUp: '#059669',
  priceDown: '#DC2626',
  priceNeutral: '#6B7280',

  // Position colors - Richer tones
  gold: '#D97706',
  silver: '#6B7280',
  bronze: '#B45309',

  // Purple shades for gradients
  purple: {
    50: '#FAF5FF',
    100: '#F3E8FF',
    200: '#E9D5FF',
    300: '#D8B4FE',
    400: '#C084FC',
    500: '#A855F7',
    600: '#9333EA',
    700: '#7C3AED',
    800: '#6D28D9',
    900: '#581C87',
  },

  // Glass effect colors
  glass: {
    white: 'rgba(255, 255, 255, 0.8)',
    dark: 'rgba(0, 0, 0, 0.5)',
    purple: 'rgba(139, 92, 246, 0.1)',
  },
} as const;

// ============================================
// Typography
// ============================================

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 24,
    xxxl: 32,
  },
} as const;

// ============================================
// Spacing
// ============================================

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// ============================================
// Border Radius
// ============================================

export const BORDER_RADIUS = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 9999,
} as const;

// ============================================
// Shadows (Modern, Soft Shadows)
// ============================================

export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 12,
  },
  // Colored shadows for accent elements
  glow: {
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  success: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

// ============================================
// Gradients
// ============================================

export const GRADIENTS = {
  primary: ['#4C1D95', '#7C3AED'] as const,
  primaryDark: ['#1E0A43', '#4C1D95'] as const,
  accent: ['#8B5CF6', '#A78BFA'] as const,
  success: ['#059669', '#10B981'] as const,
  sunset: ['#F59E0B', '#EF4444'] as const,
  ocean: ['#0EA5E9', '#6366F1'] as const,
  card: ['#FFFFFF', '#F9FAFB'] as const,
  dark: ['#1F2937', '#111827'] as const,
} as const;

// ============================================
// Animation Timing
// ============================================

export const ANIMATION = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: {
    damping: 15,
    stiffness: 150,
  },
} as const;

// ============================================
// 2026 Season Initial Driver Prices
// ============================================

export const INITIAL_DRIVER_PRICES = {
  // Top tier (300+)
  VER: 310, // Verstappen
  HAM: 290, // Hamilton
  NOR: 280, // Norris
  LEC: 275, // Leclerc
  RUS: 250, // Russell

  // Mid tier (150-250)
  SAI: 220, // Sainz
  PIA: 200, // Piastri
  ALO: 180, // Alonso
  PER: 170, // Perez
  STR: 160, // Stroll

  // Lower tier (<150)
  GAS: 140, // Gasly
  OCO: 130, // Ocon
  ALB: 125, // Albon
  TSU: 120, // Tsunoda
  BOT: 115, // Bottas
  ZHO: 100, // Zhou
  MAG: 95,  // Magnussen
  HUL: 90,  // Hulkenberg
  SAR: 85,  // Sargeant
  RIC: 80,  // Ricciardo
} as const;

// ============================================
// 2026 Season Initial Constructor Prices
// ============================================

export const INITIAL_CONSTRUCTOR_PRICES = {
  red_bull: 180,
  ferrari: 170,
  mclaren: 165,
  mercedes: 160,
  aston_martin: 130,
  alpine: 100,
  williams: 85,
  rb: 80,
  haas: 70,
  sauber: 65,
} as const;
