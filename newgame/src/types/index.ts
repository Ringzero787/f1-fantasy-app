// ============================================
// User
// ============================================

export interface TLUser {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  activeHelmetUrl?: string;
  hasOnboarded?: boolean;
  createdAt: Date;
  updatedAt: Date;
  settings: TLUserSettings;
}

export interface TLUserSettings {
  notifications: boolean;
  theme: 'light' | 'dark' | 'auto';
}

export interface LoginForm {
  email: string;
  password: string;
}

export interface RegisterForm {
  email: string;
  password: string;
  displayName: string;
}

// ============================================
// Driver / Constructor (read from shared collections — same shape as Undercut)
// ============================================

export interface Driver {
  id: string;
  name: string;
  shortName: string;
  number: number;
  constructorId: string;
  constructorName: string;
  nationality: string;
  photoURL?: string;
  price: number;
  previousPrice: number;
  seasonPoints: number;
  currentSeasonPoints: number;
  fantasyPoints: number;
  tier: 'A' | 'B' | 'C';
  isActive: boolean;
}

export interface Constructor {
  id: string;
  name: string;
  shortName: string;
  nationality: string;
  primaryColor: string;
  secondaryColor: string;
  logoURL?: string;
  price: number;
  previousPrice: number;
  seasonPoints: number;
  currentSeasonPoints?: number;
  fantasyPoints: number;
  drivers: string[];
  isActive: boolean;
}

// ============================================
// Garage — TL's headline state
// ============================================

export interface Garage {
  id: string; // userId
  // Full collection of owned drivers/constructors — no cap. Bench includes
  // anyone owned but not currently rostered.
  ownedDriverIds: string[];
  ownedConstructorIds: string[];
  // Active roster — the subset deployed for the upcoming race weekend.
  // Lineup picks Q & R starters from these.
  rosteredDriverIds: string[]; // length === rosterDriverSlots
  rosteredConstructorIds: string[]; // length === rosterConstructorSlots
  rosterDriverSlots: number; // default 4
  rosterConstructorSlots: number; // default 2
  // Legacy fields kept for compatibility — soft-deprecated by the roster model.
  maxDrivers?: number;
  maxConstructors?: number;
  cash: number;
  totalCashEarned: number;
  totalPoints: number;
  raceWinStreak: number;
  raceLossStreak: number;
  lastStreakRaceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DriverHolding {
  driverId: string;
  acquiredPrice: number; // cash paid at acquisition (used to compute release refund)
  acquiredAtRaceId?: string;
  acquiredAt: Date;
}

export interface ConstructorHolding {
  constructorId: string;
  acquiredPrice: number;
  acquiredAtRaceId?: string;
  acquiredAt: Date;
}

// Per-driver acquisition metadata. Stored as subcollection tl_garages/{userId}/holdings/{driverId|constructorId}
// or kept inline on Garage if we want one-doc reads (we'll keep inline for now).

// ============================================
// Lineup — dual qualifying vs race state
// ============================================

export interface Lineup {
  id: string; // {userId}_{raceId}
  userId: string;
  raceId: string;
  qualifying: LineupSlot;
  race: LineupSlot;
  createdAt: Date;
  updatedAt: Date;
}

export interface LineupSlot {
  startedDriverIds: string[]; // length matches startsDrivers (default 2)
  startedConstructorId: string | null; // matches startsConstructors (default 1)
  lockedAt?: Date; // null until session start passes
}

// ============================================
// Shop / economy
// ============================================

export interface ShopOffer {
  id: string;
  userId: string;
  refreshedAt: Date;
  driverIds: string[]; // 5 weighted-rarity options
  constructorIds: string[]; // 3 weighted-rarity options
  rerollCount: number; // free rerolls per weekend tracked here
}

export type TransactionType =
  | 'initial_roll'
  | 'reroll'
  | 'buy_driver'
  | 'buy_constructor'
  | 'release_driver'
  | 'release_constructor'
  | 'race_payout'
  | 'streak_bonus'
  | 'interest';

export interface TLTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  delta: number; // positive = cash in, negative = cash out
  cashAfter: number;
  entityId?: string; // driverId or constructorId
  entityName?: string;
  raceId?: string;
  description: string;
  timestamp: Date;
}

// ============================================
// Scoring
// ============================================

export interface RaceScore {
  id: string; // {userId}_{raceId}
  userId: string;
  raceId: string;
  qualifyingPoints: number;
  racePoints: number;
  totalPoints: number;
  cashPayout: number;
  streakBonus: number;
  perDriverBreakdown: DriverRaceBreakdown[];
  constructorBreakdown: ConstructorRaceBreakdown | null;
  computedAt: Date;
}

export interface DriverRaceBreakdown {
  driverId: string;
  scope: 'qualifying' | 'race';
  qualifyingPosition?: number;
  finishPosition?: number;
  positionsGained?: number;
  fastestLap?: boolean;
  status?: 'finished' | 'dnf' | 'dsq';
  points: number;
}

export interface ConstructorRaceBreakdown {
  constructorId: string;
  fastestPitstop?: boolean;
  driverPointsTotal: number;
  bonusPoints: number;
  totalPoints: number;
}

// ============================================
// Race (read from shared collection)
// ============================================

export interface Race {
  id: string;
  seasonId: string;
  round: number;
  name: string;
  officialName: string;
  circuitName: string;
  country: string;
  city: string;
  schedule: RaceSchedule;
  hasSprint: boolean;
  status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
  results?: {
    qualifyingResults?: Array<{ position: number; driverId: string; constructorId: string }>;
    raceResults?: Array<{
      position: number;
      driverId: string;
      constructorId: string;
      gridPosition?: number;
      status?: 'finished' | 'dnf' | 'dsq';
      fastestLap?: boolean;
    }>;
  };
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

// ============================================
// League + ledger
// ============================================

export interface League {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  ownerName: string;
  inviteCode: string; // 6-char join code
  memberCount: number;
  maxMembers: number; // default 8 (free), unlimited with Commissioner Pro
  seasonId: string;
  // Discovery flag. Public leagues show up in the Browse list and are joinable
  // by anyone without an invite code. Default false (invite-only).
  isPublic?: boolean;
  ledger: LeagueLedgerConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeagueLedgerConfig {
  enabled: boolean; // false = bragging rights only, no money tracking
  buyInAmount: number; // currency-agnostic; just a number
  currencyLabel: string; // "$", "€", etc. — display only
  payoutTemplate: 'per_race' | 'season_end' | 'hybrid' | 'custom';
  perRacePayoutAmount?: number; // for per_race / hybrid
  seasonEndPayoutAmount?: number; // for season_end / hybrid
}

export interface LeagueMember {
  id: string;
  leagueId: string;
  userId: string;
  displayName: string;
  totalPoints: number;
  raceWins: number;
  rank: number;
  joinedAt: Date;
}

export type LedgerEntryType =
  | 'buy_in_pledge'
  | 'race_payout'
  | 'season_payout'
  | 'manual_adjust';

export type LedgerEntryStatus = 'pending' | 'paid' | 'disputed';

export interface LedgerEntry {
  id: string;
  leagueId: string;
  userId: string; // who owes (negative) or is owed (positive)
  type: LedgerEntryType;
  amount: number; // positive = user is owed; negative = user owes
  raceId?: string;
  description: string;
  status: LedgerEntryStatus;
  createdAt: Date;
  // Pairs of payments between specific users go in Settlement docs below.
}

export interface Settlement {
  id: string;
  leagueId: string;
  fromUserId: string;
  fromDisplayName: string;
  toUserId: string;
  toDisplayName: string;
  amount: number;
  externalNote?: string; // e.g. "sent via Venmo @nate-shanks"
  markedPaidByFromAt?: Date;
  confirmedByToAt?: Date;
  status: 'pending_payment' | 'awaiting_confirmation' | 'settled' | 'disputed' | 'canceled';
  createdAt: Date;
}

// "Bag of cash" derived view for a member in a league — not stored, computed on read.
export interface BagOfCash {
  leagueId: string;
  userId: string;
  net: number; // positive = owed money; negative = owes money
  currencyLabel: string;
  unsettledOwed: number; // money you're owed but not yet received
  unsettledOwing: number; // money you owe but haven't sent
}

// ============================================
// Insurance + Bets
// ============================================

export interface InsurancePolicy {
  insuredDriverId: string;
  backupDriverId: string | null;
  premium: number;
  active: true;
  createdAt: Date;
}

export interface RaceInsurance {
  id: string; // {userId}_{raceId}
  userId: string;
  raceId: string;
  policies: Record<string, InsurancePolicy>; // keyed by insuredDriverId
  totalPremium: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PoleBet {
  driverId: string;
  driverName: string;
  driverShort: string;
  driverTier: 'A' | 'B' | 'C';
  stake: number;
  odds: number; // multiplier; payout = stake * odds
  payoutIfWin: number;
  placedAt: Date;
  settled?: { won: boolean; payout: number; settledAt: Date };
}

export interface LeagueBet {
  targetUserId: string;
  targetDisplayName: string;
  leagueId: string;
  leagueName: string;
  stake: number;
  odds: number; // = league size
  payoutIfWin: number;
  placedAt: Date;
  settled?: { won: boolean; payout: number; settledAt: Date };
}

export interface RaceBets {
  id: string; // {userId}_{raceId}
  userId: string;
  raceId: string;
  poleBet?: PoleBet;
  leagueBet?: LeagueBet;
  totalStaked: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Monetization / IAP
// ============================================

export type IAPProductId =
  | 'tl.garage.driver_slot'
  | 'tl.garage.constructor_slot'
  | 'tl.cash.bundle_small'
  | 'tl.cash.bundle_medium'
  | 'tl.cash.bundle_large'
  | 'tl.commissioner_pro.monthly'
  | 'tl.commissioner_pro.yearly'
  | `tl.cosmetic.${string}`;

export type IAPCategory =
  | 'consumable' // cash bundle
  | 'non_consumable' // garage slot, cosmetic pack
  | 'subscription'; // commissioner pro

export interface IAPProduct {
  productId: IAPProductId;
  category: IAPCategory;
  title: string;
  description: string;
  priceUsdCents: number; // for catalog display before live store data loads
  metadata?: Record<string, unknown>;
}

export interface IAPPurchase {
  id: string;
  userId: string;
  productId: IAPProductId;
  platform: 'ios' | 'android' | 'amazon';
  transactionId: string;
  receipt?: string;
  status: 'pending' | 'verified' | 'rejected' | 'refunded';
  purchasedAt: Date;
  verifiedAt?: Date;
}

export interface CosmeticPack {
  id: string;
  productId: IAPProductId;
  name: string;
  tagline: string;
  category: 'foundation' | 'heritage' | 'era' | 'limited' | 'premium';
  priceUsdCents: number;
  items: CosmeticItem[];
  availableUntil?: Date; // for limited drops
  isFree: boolean;
}

export interface CosmeticItem {
  id: string;
  surface: CosmeticSurface;
  name: string;
  previewURL?: string;
  // The asset is referenced by id; rendering happens in components.
}

export type CosmeticSurface =
  | 'app_icon'
  | 'helmet_livery'
  | 'garage_skin'
  | 'driver_frame'
  | 'constructor_stripe'
  | 'lock_animation'
  | 'cash_icon'
  | 'profile_frame'
  | 'race_overlay';

export interface UserEntitlements {
  userId: string;
  // Garage upgrades
  extraDriverSlots: number; // 0 default; +1 per purchase, capped
  extraConstructorSlots: number;
  // Cosmetic pack ownership (set of pack IDs the user has purchased)
  ownedCosmeticPacks: string[];
  // Active cosmetic selections by surface
  activeCosmetics: Partial<Record<CosmeticSurface, string>>; // surface → cosmetic item id
  // Subscription
  commissionerProActive: boolean;
  commissionerProExpiresAt?: Date;
  commissionerProTier?: 'monthly' | 'yearly';
  updatedAt: Date;
}

// ============================================
// Ben — bookmaker model. Replaces the "started subset" lineup mechanic.
// Ben posts per-entity over/under lines per session (quali, race, sprint).
// Players are WITH Ben by default, can flip to AGAINST. Stakes are optional;
// $0 picks still score the player-points leaderboard.
// ============================================

export type SessionKey = 'qualifying' | 'race' | 'sprint';

// Weight applied to player points / cash payouts per session. Race is the
// baseline; quali = half; sprint = quarter (so 4 sprints or 2 qualis = 1 race).
export const SESSION_WEIGHT: Record<SessionKey, number> = {
  race: 1,
  qualifying: 0.5,
  sprint: 0.25,
};

export type BenSide = 'with' | 'against';
export type BenEntityKind = 'driver' | 'constructor';

// Ben's posted line for a single entity in a single session. For drivers, the
// line is a finishing position (P3.5). For constructors, it's the sum of the
// team's two drivers' finishing positions (e.g. 12.5).
export interface BenLine {
  entityId: string;
  entityKind: BenEntityKind;
  line: number;
  withOdds: number; // decimal odds — payout = stake * odds (gross, includes stake back)
  againstOdds: number;
  // Filled in by the settlement Cloud Function after the session runs.
  result?: number; // actual finishing position (driver) or position sum (constructor)
  outcome?: BenSide | 'push'; // 'with' wins | 'against' wins | 'push' on exact integer-line match
  settledAt?: Date;
  // Optional explicit lock time; defaults to the session start in the Race doc.
  lockAt?: Date;
}

// One Firestore document per (race, session) holds all of Ben's lines for that
// session keyed by entityId. Doc id = `${raceId}_${session}`. Single fetch
// hydrates the whole strip; settlement loops the map.
export interface BenSessionDoc {
  id: string;
  raceId: string;
  session: SessionKey;
  entities: Record<string, BenLine>;
  posted: boolean;
  postedAt?: Date;
  settledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// A single player pick on a single entity in a single session.
export interface Pick {
  side: BenSide; // default 'with'
  stake: number; // 0 = free play; still scores points
}

// All of a player's picks for one race. Sessions map keys are SessionKey values;
// each session map is entityId → Pick.
export interface PicksDoc {
  id: string; // `${userId}_${raceId}`
  userId: string;
  raceId: string;
  picks: Partial<Record<SessionKey, Record<string, Pick>>>;
  totalStaked: number;
  // Settlement-derived snapshot — populated by tlSettleWeekend.
  settled?: boolean;
  settledAt?: Date;
  weekendPoints?: number; // sum of correct-pick credits, session-weighted
  weekendCash?: number; // net cash delta (payouts − stakes lost)
  callsCorrect?: number; // count of winning picks (any stake)
  callsTotal?: number; // total picks made
  createdAt: Date;
  updatedAt: Date;
}

// Per-race per-user settlement record. Powers the weekly leaderboard.
export interface WeekendScore {
  id: string; // `${userId}_${raceId}`
  userId: string;
  displayName: string;
  raceId: string;
  seasonId: string;
  round: number;
  points: number; // session-weighted player points
  cash: number; // net cash earned/lost this weekend
  callsCorrect: number;
  callsTotal: number;
  createdAt: Date;
}

// Running season totals — powers the season leaderboard.
export interface SeasonScore {
  id: string; // `${userId}_${seasonId}`
  userId: string;
  displayName: string;
  seasonId: string;
  totalPoints: number;
  totalCash: number;
  callsCorrect: number;
  callsTotal: number;
  weekendsScored: number;
  updatedAt: Date;
}

// ============================================
// Misc
// ============================================

export interface ApiError {
  code: string;
  message: string;
}
