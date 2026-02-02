// ============================================
// User Types
// ============================================

export interface User {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: Date;
  updatedAt: Date;
  settings: UserSettings;
}

export interface UserSettings {
  notifications: boolean;
  darkMode: boolean;
  favoriteTeam?: string;
}

// ============================================
// Driver & Constructor Types
// ============================================

export interface Driver {
  id: string;
  name: string;
  shortName: string; // 3-letter code (e.g., VER, HAM)
  number: number;
  constructorId: string;
  constructorName: string;
  nationality: string;
  photoURL?: string;
  price: number; // Current price in fantasy points
  previousPrice: number;
  seasonPoints: number; // Total F1 championship points
  fantasyPoints: number; // Total fantasy points scored
  tier: 'A' | 'B'; // A = >200 price, B = <200 price
  isActive: boolean;
}

export interface Constructor {
  id: string;
  name: string;
  shortName: string;
  nationality: string;
  logoURL?: string;
  primaryColor: string;
  secondaryColor: string;
  price: number;
  previousPrice: number;
  seasonPoints: number;
  fantasyPoints: number;
  drivers: string[]; // Driver IDs
  isActive: boolean;
}

export interface PriceHistory {
  id: string;
  entityId: string; // Driver or Constructor ID
  entityType: 'driver' | 'constructor';
  price: number;
  raceId: string;
  timestamp: Date;
}

// ============================================
// League Types
// ============================================

export interface League {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  ownerName: string;
  inviteCode: string;
  isPublic: boolean;
  maxMembers: number;
  memberCount: number;
  seasonId: string;
  createdAt: Date;
  updatedAt: Date;
  settings: LeagueSettings;
  avatarUrl?: string;
  avatarGeneratedAt?: string;
}

export interface LeagueSettings {
  allowLateJoin: boolean;
  lockDeadline: 'qualifying' | 'race'; // When teams lock
  scoringRules: ScoringRules;
}

export interface LeagueMember {
  id: string;
  leagueId: string;
  userId: string;
  displayName: string;
  teamName?: string; // The name of the user's team in this league
  teamAvatarUrl?: string; // Avatar URL for the team
  role: 'owner' | 'admin' | 'member';
  totalPoints: number;
  rank: number;
  joinedAt: Date;
}

export interface LeagueInvite {
  id: string;
  leagueId: string;
  email?: string;
  code: string;
  createdBy: string;
  expiresAt: Date;
  usedAt?: Date;
  usedBy?: string;
}

// ============================================
// Fantasy Team Types
// ============================================

export interface FantasyTeam {
  id: string;
  userId: string;
  leagueId: string | null; // null for solo teams
  name: string;
  drivers: FantasyDriver[];
  constructor: FantasyConstructor | null;
  budget: number; // Remaining budget
  totalSpent: number;
  totalPoints: number;
  isLocked: boolean;
  lockStatus: LockStatus;
  createdAt: Date;
  updatedAt: Date;
  avatarUrl?: string;
  avatarGeneratedAt?: string;
}

export interface FantasyDriver {
  driverId: string;
  name: string;
  shortName: string;
  constructorId: string;
  purchasePrice: number;
  currentPrice: number;
  pointsScored: number;
  racesHeld: number; // For multi-race lock bonus
  lockedAt?: Date;
  isStarDriver: boolean; // Star driver gets 20% bonus points
}

export interface FantasyConstructor {
  constructorId: string;
  name: string;
  purchasePrice: number;
  currentPrice: number;
  pointsScored: number;
  racesHeld: number;
  lockedAt?: Date;
  isStarDriver: boolean; // Constructor can also be star (+20% bonus)
}

export interface LockStatus {
  isSeasonLocked: boolean;
  seasonLockRacesRemaining: number;
  nextUnlockTime?: Date;
  canModify: boolean;
  lockReason?: string;
}

// ============================================
// Race Types
// ============================================

export interface Race {
  id: string;
  seasonId: string;
  round: number;
  name: string;
  officialName: string;
  circuitId: string;
  circuitName: string;
  country: string;
  city: string;
  timezone: string;
  schedule: RaceSchedule;
  hasSprint: boolean;
  status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
  results?: RaceResults;
}

export interface RaceSchedule {
  fp1: Date;
  fp2?: Date;
  fp3?: Date;
  sprintQualifying?: Date;
  sprint?: Date;
  qualifying: Date;
  race: Date;
}

export interface RaceResults {
  raceId: string;
  qualifyingResults: QualifyingResult[];
  sprintResults?: SprintResult[];
  raceResults: RaceResult[];
  fastestLap?: string; // Driver ID
  processedAt: Date;
}

export interface QualifyingResult {
  position: number;
  driverId: string;
  constructorId: string;
  q1Time?: string;
  q2Time?: string;
  q3Time?: string;
}

export interface SprintResult {
  position: number;
  driverId: string;
  constructorId: string;
  points: number;
  time?: string;
  status: 'finished' | 'dnf' | 'dsq';
}

export interface RaceResult {
  position: number;
  driverId: string;
  constructorId: string;
  gridPosition: number;
  points: number;
  positionsGained: number;
  time?: string;
  laps: number;
  status: 'finished' | 'dnf' | 'dsq';
  fastestLap: boolean;
}

// ============================================
// Scoring Types
// ============================================

export interface ScoringRules {
  racePoints: number[]; // [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
  sprintPoints: number[]; // [8, 7, 6, 5, 4, 3, 2, 1]
  fastestLapBonus: number;
  positionGainedBonus: number;
  qualifyingPoints: number[]; // Optional bonus for qualifying
  dnfPenalty: number;
  dsqPenalty: number;
}

export interface DriverScore {
  driverId: string;
  raceId: string;
  racePoints: number;
  sprintPoints: number;
  qualifyingPoints: number;
  positionBonus: number;
  fastestLapBonus: number;
  penalties: number;
  lockBonus: number;
  totalPoints: number;
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  items: ScoreItem[];
  total: number;
}

export interface ScoreItem {
  label: string;
  points: number;
  description?: string;
}

export interface ConstructorScore {
  constructorId: string;
  raceId: string;
  driver1Points: number;
  driver2Points: number;
  totalPoints: number;
  lockBonus: number;
}

// ============================================
// Transaction Types
// ============================================

export interface Transaction {
  id: string;
  userId: string;
  leagueId: string;
  teamId: string;
  type: 'buy' | 'sell' | 'swap';
  entityType: 'driver' | 'constructor';
  entityId: string;
  entityName: string;
  price: number;
  previousEntityId?: string; // For swaps
  previousEntityName?: string;
  timestamp: Date;
  raceId?: string;
}

// ============================================
// Season Types
// ============================================

export interface Season {
  id: string;
  year: number;
  name: string;
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  totalRaces: number;
  currentRound: number;
  scoringRules: ScoringRules;
  pricingRules: PricingRules;
  budget: number; // Starting budget (1000)
  teamSize: number; // Number of drivers (5)
}

export interface PricingRules {
  greatPPMThreshold: number; // 0.8
  goodPPMThreshold: number; // 0.6
  poorPPMThreshold: number; // 0.4
  aTierPriceChange: PriceChangeConfig;
  bTierPriceChange: PriceChangeConfig;
}

export interface PriceChangeConfig {
  great: number;
  good: number;
  poor: number;
  terrible: number;
}

// ============================================
// Lock Bonus Types
// ============================================

export interface LockBonusConfig {
  tier1: { races: number; bonus: number }; // 1-3 races: +1 per race
  tier2: { races: number; bonus: number }; // 4-6 races: +2 per race
  tier3: { races: number; bonus: number }; // 7+ races: +3 per race
  fullSeasonBonus: number; // +100 for 24 races
}

// ============================================
// Notification Types
// ============================================

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

export type NotificationType =
  | 'race_reminder'
  | 'lock_warning'
  | 'results_available'
  | 'price_change'
  | 'league_invite'
  | 'league_update';

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================
// Filter & Sort Types
// ============================================

export interface DriverFilter {
  search?: string;
  constructorId?: string;
  tier?: 'A' | 'B';
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'price' | 'points' | 'name' | 'priceChange';
  sortOrder?: 'asc' | 'desc';
}

export interface LeagueFilter {
  search?: string;
  isPublic?: boolean;
  hasSpace?: boolean;
  sortBy?: 'name' | 'memberCount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// ============================================
// Form Types
// ============================================

export interface LoginForm {
  email: string;
  password: string;
}

export interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
}

export interface CreateLeagueForm {
  name: string;
  description?: string;
  isPublic: boolean;
  maxMembers: number;
}

export interface TeamSelectionState {
  selectedDrivers: string[];
  selectedConstructor: string | null;
  totalCost: number;
  remainingBudget: number;
  isValid: boolean;
  validationErrors: string[];
}
