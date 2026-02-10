// ============================================
// User Types
// ============================================

export interface User {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  isAdmin?: boolean;
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
  seasonPoints: number; // 2025 F1 championship points (used for initial price calculation)
  currentSeasonPoints: number; // 2026 F1 championship points (displayed to users)
  fantasyPoints: number; // Total fantasy points scored
  tier: 'A' | 'B' | 'C'; // A = >100, B = >50, C = <=50
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
  seasonPoints: number; // 2025 points (used for initial pricing)
  currentSeasonPoints?: number; // 2026 points (displayed to users)
  fantasyPoints: number;
  drivers: string[]; // Driver IDs
  isActive: boolean;
}

export interface PriceHistory {
  id: string;
  entityId: string; // Driver or Constructor ID
  entityType: 'driver' | 'constructor';
  price: number;
  previousPrice?: number;
  change?: number; // Total price change (performance + dnf penalty)
  performanceChange?: number; // Price change from PPM-based performance
  dnfPenalty?: number; // Price penalty from DNF (positive number)
  points?: number; // Fantasy points scored in the race
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
  coAdminIds?: string[]; // User IDs of co-admins
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
  // V4: Late joiner support
  racesPlayed?: number; // For PPR calculation
  pprAverage?: number; // Points Per Race average
  recentFormPoints?: number; // Last 5 races total
  raceWins?: number; // Race weekend wins count
  isInCatchUp?: boolean; // Currently in catch-up multiplier period
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
  // V3: Captain System - choose one driver each race weekend for 2x points
  captainDriverId?: string;
  // V3: Transfer tracking for stale roster penalty and hot hand bonus
  lastTransferRaceId?: string; // Race ID when last transfer was made
  racesSinceTransfer: number; // Count of races since last transfer
  // V4: Late joiner support
  racesPlayed: number; // Number of races participated in (for PPR calculation)
  pointsHistory: number[]; // Points earned per race (for Recent Form leaderboard)
  joinedAtRace: number; // Season race number when team was created (for catch-up multiplier)
  raceWins: number; // Number of race weekend wins in league
  // V5: Driver lockout after contract expiry (1-race cooldown per team)
  driverLockouts?: Record<string, number>; // driverId -> completedRaceCount when lockout expires
  // V7: Banked points from departed drivers (contract expiry, trade, removal)
  lockedPoints?: number;
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
  // V3: Track when driver was purchased for hot hand bonus
  purchasedAtRaceId?: string;
  // V5: Contract system - drivers auto-sell after contractLength races
  contractLength?: number; // Default 5
  isReservePick?: boolean; // true if system auto-filled at lockout
  addedAtRace?: number; // Completed race count when driver was added
}

export interface FantasyConstructor {
  constructorId: string;
  name: string;
  purchasePrice: number;
  currentPrice: number;
  pointsScored: number;
  racesHeld: number;
  lockedAt?: Date;
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
  totalLaps?: number; // Total laps in the race (used for DNF penalty calculation)
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
  tier?: 'A' | 'B' | 'C';
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
