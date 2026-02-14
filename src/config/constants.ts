// ============================================
// Game Constants
// ============================================

export const STARTING_DOLLARS = 1000; // $1,000 starting budget
export const BUDGET = STARTING_DOLLARS; // Alias for backwards compatibility
export const TEAM_SIZE = 5; // Number of drivers
export const CONSTRUCTORS_PER_TEAM = 1;
export const SALE_COMMISSION_RATE = 0; // No commission - sell at current market value

// V3: Ace System (replaces star driver)
// Ace gets 2x points, must be selected before qualifying each race weekend
// See pricing.config.ts for ACE_MULTIPLIER and other V3 rules

// ============================================
// Scoring Points
// ============================================

export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
export const FASTEST_LAP_BONUS = 1;
export const POSITION_GAINED_BONUS = 1;
export const POSITION_LOST_PENALTY = 1; // Per position lost (grid vs finish)
export const DNF_PENALTY = -5; // Fantasy points penalty for DNF
export const DSQ_PENALTY = -5; // Fantasy points penalty for DSQ

// ============================================
// DNF Price Penalty Configuration
// ============================================
// DNF on lap 1 = -10 price points
// DNF on final lap = -1 price point
// Linear scale between based on how early the DNF occurs
export const DNF_PRICE_PENALTY_MAX = 24; // Maximum penalty for lap 1 DNF
export const DNF_PRICE_PENALTY_MIN = 2;  // Minimum penalty for final lap DNF

// ============================================
// Price Tier Thresholds
// ============================================

export const TIER_A_THRESHOLD = 240; // Price > 240 is A-tier
export const TIER_B_THRESHOLD = 120;  // Price > 120 is B-tier, <= 120 is C-tier

// ============================================
// PPM (Points Per Price) Thresholds
// Scaled for dollar-based prices (not millions)
// e.g. $500 driver scoring 25pts = PPM 0.05 = "good"
// ============================================

export const PPM_GREAT = 0.06;
export const PPM_GOOD = 0.04;
export const PPM_POOR = 0.02;

// ============================================
// Price Changes per Performance
// ============================================

export const PRICE_CHANGES = {
  A_TIER: {
    great: 36,
    good: 12,
    poor: -12,
    terrible: -36,
  },
  B_TIER: {
    great: 24,
    good: 7,
    poor: -7,
    terrible: -24,
  },
  C_TIER: {
    great: 12,
    good: 5,
    poor: -5,
    terrible: -12,
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
export const EARLY_UNLOCK_FEE = 120; // $120 penalty

// ============================================
// League Settings
// ============================================

export const DEFAULT_MAX_MEMBERS = 22;
export const FREE_LEAGUE_MEMBER_LIMIT = 22;
export const SLOTS_PER_EXPANSION = 20;
export const MIN_LEAGUE_NAME_LENGTH = 3;
export const MAX_LEAGUE_NAME_LENGTH = 50;
export const INVITE_CODE_LENGTH = 8;
export const INVITE_EXPIRY_DAYS = 7;

// ============================================
// Team Colors (F1 Constructor Colors)
// ============================================

export const TEAM_COLORS: Record<string, { primary: string; secondary: string }> = {
  red_bull: { primary: '#1E3A8A', secondary: '#0600EF' },
  ferrari: { primary: '#DC2626', secondary: '#A91D1D' },
  mclaren: { primary: '#FF8000', secondary: '#E67300' },
  mercedes: { primary: '#00D2BE', secondary: '#00A19C' },
  aston_martin: { primary: '#006F62', secondary: '#00483B' },
  alpine: { primary: '#0090FF', secondary: '#FF87BC' },
  williams: { primary: '#005AFF', secondary: '#00A3E0' },
  rb: { primary: '#2B4562', secondary: '#1634B5' },
  haas: { primary: '#B6BABD', secondary: '#E10600' },
  sauber: { primary: '#00E701', secondary: '#006341' },
  cadillac: { primary: '#C0C0C0', secondary: '#1C1C1C' },
};

// ============================================
// UI Constants
// ============================================

export const ITEMS_PER_PAGE = 20;
export const DEBOUNCE_MS = 300;

// ============================================
// Theme Colors (Light Mode - Legacy)
// ============================================

export const COLORS_LIGHT = {
  // Brand - Modern Purple Theme
  primary: '#6D28D9',
  primaryDark: '#4C1D95',
  primaryLight: '#8B5CF6',
  secondary: '#7C3AED',
  accent: '#A78BFA',
  teal: '#14B8A6',
  indigo: '#6366F1',
  rose: '#A855F7',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardBorder: '#E5E7EB',
  cardHover: '#F9FAFB',
  success: '#10B981',
  successLight: '#D1FAE5',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  error: '#9333EA',
  errorLight: '#F3E8FF',
  info: '#3B82F6',
  infoLight: '#DBEAFE',
  text: {
    primary: '#111827',
    secondary: '#4B5563',
    light: '#9CA3AF',
    muted: '#6B7280',
    inverse: '#FFFFFF',
  },
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
  priceUp: '#059669',
  priceDown: '#7C3AED',
  priceNeutral: '#6B7280',
  gold: '#D97706',
  silver: '#6B7280',
  bronze: '#B45309',
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
  glass: {
    white: 'rgba(255, 255, 255, 0.8)',
    dark: 'rgba(0, 0, 0, 0.5)',
    purple: 'rgba(139, 92, 246, 0.1)',
  },
} as const;

// ============================================
// Theme Colors (Dark Mode - Modern F1 Style)
// ============================================

export const COLORS = {
  // Brand - Cyan/Teal Accent Theme
  primary: '#00D4FF', // Vibrant cyan
  primaryDark: '#00A3CC', // Deep cyan
  primaryLight: '#5CE1FF', // Light cyan
  secondary: '#0EA5E9', // Sky blue
  accent: '#00D4FF', // Matching cyan accent

  // Accent colors for variety
  teal: '#14B8A6',
  indigo: '#6366F1',
  rose: '#F43F5E',

  // Backgrounds - Deep navy/charcoal
  background: '#0D1117', // Deep navy (main bg)
  backgroundGradientStart: '#0D1117', // For gradient backgrounds
  backgroundGradientEnd: '#1A1F2E', // Slightly lighter navy
  surface: '#161B22', // Slightly elevated surface
  card: '#1E2530', // Card background
  cardBorder: 'rgba(255, 255, 255, 0.1)', // Subtle white border
  cardHover: '#252D3A', // Hover state
  cardElevated: '#242C3A', // More elevated cards

  // Status colors - Vibrant on dark
  success: '#10B981',
  successLight: 'rgba(16, 185, 129, 0.15)',
  warning: '#F59E0B',
  warningLight: 'rgba(245, 158, 11, 0.15)',
  error: '#EF4444',
  errorLight: 'rgba(239, 68, 68, 0.15)',
  info: '#00D4FF',
  infoLight: 'rgba(0, 212, 255, 0.15)',

  // Text - White with opacity hierarchy
  text: {
    primary: '#FFFFFF', // 100% white
    secondary: 'rgba(255, 255, 255, 0.7)', // 70% white
    light: 'rgba(255, 255, 255, 0.5)', // 50% white
    muted: 'rgba(255, 255, 255, 0.4)', // 40% white
    inverse: '#0D1117', // Dark text on light backgrounds
  },

  // Neutrals
  white: '#FFFFFF',
  black: '#000000',
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#9CA3AF',
    400: '#6B7280',
    500: '#4B5563',
    600: '#374151',
    700: '#2D3748',
    800: '#1E2530',
    900: '#161B22',
    950: '#0D1117',
  },

  // Price indicators
  priceUp: '#10B981', // Green
  priceDown: '#EF4444', // Red
  priceNeutral: 'rgba(255, 255, 255, 0.5)',

  // Position colors - Gold, Silver, Bronze
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',

  // Cyan/teal shades for gradients
  cyan: {
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

  // Keep purple for secondary elements
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

  // Glass effect colors for dark mode
  glass: {
    white: 'rgba(255, 255, 255, 0.1)',
    light: 'rgba(255, 255, 255, 0.05)',
    dark: 'rgba(0, 0, 0, 0.4)',
    cyan: 'rgba(0, 212, 255, 0.1)',
    cyanStrong: 'rgba(0, 212, 255, 0.2)',
  },

  // Tab/pill colors
  tab: {
    active: '#00D4FF',
    activeText: '#0D1117',
    inactive: 'transparent',
    inactiveText: 'rgba(255, 255, 255, 0.7)',
  },

  // Border colors
  border: {
    default: 'rgba(255, 255, 255, 0.1)',
    light: 'rgba(255, 255, 255, 0.05)',
    accent: 'rgba(0, 212, 255, 0.3)',
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
// Border Radius (More rounded for modern look)
// ============================================

export const BORDER_RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  pill: 9999, // For pill-shaped tabs/buttons
  full: 9999,
  card: 16, // Standard card radius
  button: 12, // Button radius
  input: 10, // Input field radius
} as const;

// ============================================
// Shadows (Dark Mode - Subtle + Glow Effects)
// ============================================

export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  // Standard dark shadows (subtle on dark bg)
  xs: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 12,
  },
  // Cyan glow effects (for buttons, active states)
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
  // Status glows
  success: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  warning: {
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  error: {
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  // Card shadow for dark mode
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

// ============================================
// Gradients (Dark Mode)
// ============================================

export const GRADIENTS = {
  // Primary cyan gradients
  primary: ['#00D4FF', '#0EA5E9'] as const,
  primaryDark: ['#00A3CC', '#0284C7'] as const,
  primarySubtle: ['rgba(0, 212, 255, 0.2)', 'rgba(14, 165, 233, 0.1)'] as const,

  // Accent/glow gradients
  accent: ['#00D4FF', '#22D3EE'] as const,
  accentGlow: ['rgba(0, 212, 255, 0.4)', 'rgba(0, 212, 255, 0)'] as const,

  // Status gradients
  success: ['#059669', '#10B981'] as const,
  warning: ['#D97706', '#F59E0B'] as const,
  error: ['#DC2626', '#EF4444'] as const,

  // Background gradients
  background: ['#0D1117', '#1A1F2E'] as const,
  backgroundRadial: ['#1A1F2E', '#0D1117'] as const,
  surface: ['#161B22', '#1E2530'] as const,

  // Card gradients
  card: ['#1E2530', '#242C3A'] as const,
  cardHover: ['#252D3A', '#2D3748'] as const,
  cardHighlight: ['rgba(0, 212, 255, 0.1)', 'rgba(0, 212, 255, 0.05)'] as const,

  // Hero/header overlays
  heroOverlay: ['rgba(13, 17, 23, 0)', 'rgba(13, 17, 23, 0.9)'] as const,
  heroTop: ['rgba(13, 17, 23, 0.8)', 'rgba(13, 17, 23, 0)'] as const,

  // Button gradients
  buttonPrimary: ['#00D4FF', '#0EA5E9'] as const,
  buttonSecondary: ['#1E2530', '#2D3748'] as const,

  // Legacy gradients (for compatibility)
  sunset: ['#F59E0B', '#EF4444'] as const,
  ocean: ['#0EA5E9', '#6366F1'] as const,
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
// Component Styles (Reusable Presets)
// ============================================

export const COMPONENT_STYLES = {
  // Card presets
  card: {
    background: COLORS.card,
    borderRadius: BORDER_RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  cardElevated: {
    background: COLORS.cardElevated,
    borderRadius: BORDER_RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  // Button presets
  buttonPrimary: {
    background: COLORS.primary,
    borderRadius: BORDER_RADIUS.button,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  buttonSecondary: {
    background: COLORS.card,
    borderRadius: BORDER_RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },

  // Tab/pill presets
  tabActive: {
    background: COLORS.tab.active,
    borderRadius: BORDER_RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  tabInactive: {
    background: COLORS.tab.inactive,
    borderRadius: BORDER_RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },

  // Input presets
  input: {
    background: COLORS.card,
    borderRadius: BORDER_RADIUS.input,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  inputFocused: {
    borderColor: COLORS.primary,
  },

  // Driver slot (like in reference image)
  driverSlot: {
    background: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  driverSlotEmpty: {
    background: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.light,
    borderStyle: 'dashed' as const,
  },
} as const;

// ============================================
// 2026 Season Initial Driver Prices
// ============================================

export const INITIAL_DRIVER_PRICES = {
  // A-tier (>240) — price = 2025 season points at $24/pt
  NOR: 510, // Norris
  VER: 500, // Verstappen
  PIA: 380, // Piastri
  LEC: 340, // Leclerc
  RUS: 290, // Russell
  HAM: 260, // Hamilton

  // B-tier (121-240)
  SAI: 240, // Sainz
  ALO: 150, // Alonso
  ANT: 120, // Antonelli

  // C-tier (<=120)
  ALB: 100, // Albon
  STR: 80,  // Stroll
  HUL: 70,  // Hulkenberg
  GAS: 65,  // Gasly
  OCO: 60,  // Ocon
  HAD: 40,  // Hadjar
  BEA: 35,  // Bearman
  LAW: 30,  // Lawson
  BOR: 25,  // Bortoleto
  COL: 15,  // Colapinto
  BOT: 10,  // Bottas
  PER: 10,  // Perez
  LIN: 5,   // Lindblad
} as const;

// ============================================
// 2026 Season Initial Constructor Prices
// ============================================

export const INITIAL_CONSTRUCTOR_PRICES = {
  mclaren: 480,
  mercedes: 310,
  red_bull: 301,
  ferrari: 276,
  williams: 154,
  racing_bulls: 133,
  aston_martin: 132,
  haas: 127,
  sauber: 123,
  alpine: 101,
  cadillac: 90,
} as const;
