// The shippable cosmetic pack catalog. Source of truth for IAP storefront UI
// and for entitlement application. Production version will eventually live in
// a Firestore `tl_catalog` collection so we can ship new packs without app
// updates, but for v1 it's a static module — simpler review, faster ship.

import type { CosmeticPack } from '../types';

const STORAGE_BASE = 'https://storage.googleapis.com/f1-app-18077.firebasestorage.app/cosmetics/helmets';

export const DEFAULT_HELMET_ITEM_ID = 'track_limits_classic';
export const DEFAULT_HELMET_URL = `${STORAGE_BASE}/track_limits_classic.png`;

// Garage-cash price per pack — MIRROR of the server's authoritative table in
// functions/src/purchases/buyCosmeticPack.ts (PACK_PRICES_GAME_CASH). Display
// only; the server re-checks on purchase. Priced at parity with the future
// real-money path: a $2.99-tier pack costs what a ~$2.99 cash bundle buys.
export const PACK_PRICE_GAME_CASH: Record<string, number> = {
  monaco_gold: 75,
  vegas_neon: 75,
  suzuka_blossom: 75,
  imola_crimson: 75,
  spa_forest: 75,
  brazil_tribute: 75,
  midnight_strip: 75,
  senna_era: 150,
  hybrid_era: 150,
  strategist_premium: 350,
};

export const cosmeticPacks: CosmeticPack[] = [
  {
    id: 'foundation',
    productId: 'tl.cosmetic.foundation',
    name: 'Foundation',
    tagline: 'Personalize your garage. On the house.',
    category: 'foundation',
    priceUsdCents: 0,
    isFree: true,
    items: [
      { id: 'foundation_app_icon', surface: 'app_icon', name: 'Track Limits classic' },
      { id: DEFAULT_HELMET_ITEM_ID, surface: 'helmet_livery', name: 'Track Limits Classic', previewURL: DEFAULT_HELMET_URL },
      { id: 'foundation_frame', surface: 'driver_frame', name: 'Standard frame' },
    ],
  },
  {
    id: 'monaco_gold',
    productId: 'tl.cosmetic.monaco_gold',
    name: 'Monaco Gold',
    tagline: 'Champagne on the harbor.',
    category: 'heritage',
    priceUsdCents: 299,
    isFree: false,
    items: [
      { id: 'monaco_app_icon', surface: 'app_icon', name: 'Monaco Gold' },
      { id: 'monaco_gold', surface: 'helmet_livery', name: 'Gold leaf helmet', previewURL: `${STORAGE_BASE}/monaco_gold.png` },
      { id: 'monaco_garage', surface: 'garage_skin', name: 'Harbor sunrise' },
      { id: 'monaco_cash', surface: 'cash_icon', name: 'Gold chip' },
    ],
  },
  {
    id: 'vegas_neon',
    productId: 'tl.cosmetic.vegas_neon',
    name: 'Vegas Neon',
    tagline: 'The strip after midnight.',
    category: 'heritage',
    priceUsdCents: 299,
    isFree: false,
    items: [
      { id: 'vegas_app_icon', surface: 'app_icon', name: 'Neon Track Limits' },
      { id: 'vegas_neon', surface: 'helmet_livery', name: 'Neon pink/cyan helmet', previewURL: `${STORAGE_BASE}/vegas_neon.png` },
      { id: 'vegas_garage', surface: 'garage_skin', name: 'Vegas paddock' },
      { id: 'vegas_stripe', surface: 'constructor_stripe', name: 'Holo stripe' },
    ],
  },
  {
    id: 'suzuka_blossom',
    productId: 'tl.cosmetic.suzuka_blossom',
    name: 'Suzuka Blossom',
    tagline: 'Spring in the figure-eight.',
    category: 'heritage',
    priceUsdCents: 299,
    isFree: false,
    items: [
      { id: 'suzuka_app_icon', surface: 'app_icon', name: 'Cherry blossom' },
      { id: 'suzuka_blossom', surface: 'helmet_livery', name: 'Sakura petal helmet', previewURL: `${STORAGE_BASE}/suzuka_blossom.png` },
      { id: 'suzuka_garage', surface: 'garage_skin', name: 'Cherry tree paddock' },
    ],
  },
  {
    id: 'imola_crimson',
    productId: 'tl.cosmetic.imola_crimson',
    name: 'Imola Crimson',
    tagline: 'European heritage in racing red.',
    category: 'heritage',
    priceUsdCents: 299,
    isFree: false,
    items: [
      { id: 'imola_crimson', surface: 'helmet_livery', name: 'Imola Crimson helmet', previewURL: `${STORAGE_BASE}/imola_crimson.png` },
    ],
  },
  {
    id: 'spa_forest',
    productId: 'tl.cosmetic.spa_forest',
    name: 'Spa Forest',
    tagline: 'Belgian classic, woodland green.',
    category: 'heritage',
    priceUsdCents: 299,
    isFree: false,
    items: [
      { id: 'spa_forest', surface: 'helmet_livery', name: 'Spa Forest helmet', previewURL: `${STORAGE_BASE}/spa_forest.png` },
    ],
  },
  {
    id: 'brazil_tribute',
    productId: 'tl.cosmetic.brazil_tribute',
    name: 'Brazil Tribute',
    tagline: 'Carnival yellow, samba blue and green.',
    category: 'heritage',
    priceUsdCents: 299,
    isFree: false,
    items: [
      { id: 'brazil_tribute', surface: 'helmet_livery', name: 'Brazil Tribute helmet', previewURL: `${STORAGE_BASE}/brazil_tribute.png` },
    ],
  },
  {
    id: 'midnight_strip',
    productId: 'tl.cosmetic.midnight_strip',
    name: 'Midnight Strip',
    tagline: 'Black and gold, for the late lap.',
    category: 'heritage',
    priceUsdCents: 299,
    isFree: false,
    items: [
      { id: 'midnight_strip', surface: 'helmet_livery', name: 'Midnight Strip helmet', previewURL: `${STORAGE_BASE}/midnight_strip.png` },
    ],
  },
  {
    id: 'senna_era',
    productId: 'tl.cosmetic.senna_era',
    name: 'Senna Era',
    tagline: '"If you no longer go for a gap, you are no longer a racing driver."',
    category: 'era',
    priceUsdCents: 499,
    isFree: false,
    items: [
      { id: 'senna_app_icon', surface: 'app_icon', name: 'Senna Era' },
      { id: 'senna_era', surface: 'helmet_livery', name: 'Yellow/blue helmet', previewURL: `${STORAGE_BASE}/senna_era.png` },
      { id: 'senna_garage', surface: 'garage_skin', name: '90s paddock' },
      { id: 'senna_frame', surface: 'driver_frame', name: 'Vintage gold frame' },
      { id: 'senna_lock', surface: 'lock_animation', name: 'Manual gearbox click' },
      { id: 'senna_overlay', surface: 'race_overlay', name: 'Camcorder grain' },
    ],
  },
  {
    id: 'hybrid_era',
    productId: 'tl.cosmetic.hybrid_era',
    name: 'Hybrid Era',
    tagline: 'Energy recovery, championship victory.',
    category: 'era',
    priceUsdCents: 499,
    isFree: false,
    items: [
      { id: 'hybrid_app_icon', surface: 'app_icon', name: 'Hybrid Era' },
      { id: 'carbon_weave', surface: 'helmet_livery', name: 'Carbon weave helmet', previewURL: `${STORAGE_BASE}/carbon_weave.png` },
      { id: 'hybrid_silver', surface: 'helmet_livery', name: 'Hybrid Silver helmet', previewURL: `${STORAGE_BASE}/hybrid_silver.png` },
      { id: 'hybrid_garage', surface: 'garage_skin', name: 'Modern paddock' },
      { id: 'hybrid_frame', surface: 'driver_frame', name: 'Carbon frame' },
      { id: 'hybrid_lock', surface: 'lock_animation', name: 'KERS deploy' },
    ],
  },
  {
    id: 'strategist_premium',
    productId: 'tl.cosmetic.strategist_premium',
    name: 'Strategist Premium',
    tagline: 'Holographic everything. For the team principal.',
    category: 'premium',
    priceUsdCents: 999,
    isFree: false,
    items: [
      { id: 'strategist_app_icon', surface: 'app_icon', name: 'Holo Track Limits' },
      { id: 'holographic', surface: 'helmet_livery', name: 'Holographic helmet', previewURL: `${STORAGE_BASE}/holographic.png` },
      { id: 'champion_gold', surface: 'helmet_livery', name: 'Champion Gold helmet', previewURL: `${STORAGE_BASE}/champion_gold.png` },
      { id: 'strategist_garage', surface: 'garage_skin', name: 'Pit wall command' },
      { id: 'strategist_frame', surface: 'driver_frame', name: 'Holographic frame' },
      { id: 'strategist_stripe', surface: 'constructor_stripe', name: 'Iridescent stripe' },
      { id: 'strategist_lock', surface: 'lock_animation', name: 'Strategist lock' },
      { id: 'strategist_cash', surface: 'cash_icon', name: 'Diamond cash' },
      { id: 'strategist_profile', surface: 'profile_frame', name: 'Holo profile frame' },
      { id: 'strategist_overlay', surface: 'race_overlay', name: 'Telemetry overlay' },
    ],
  },
];

// Helper: resolve a helmet item id to its preview URL.
export function getHelmetUrl(itemId: string | undefined): string | undefined {
  if (!itemId) return undefined;
  for (const pack of cosmeticPacks) {
    const item = pack.items.find((i) => i.id === itemId && i.surface === 'helmet_livery');
    if (item?.previewURL) return item.previewURL;
  }
  return undefined;
}

export const consumableProducts = [
  {
    productId: 'tl.cash.bundle_small' as const,
    title: 'Small cash bundle',
    description: '50 in-game cash',
    cashAmount: 50,
    priceUsdCents: 199,
  },
  {
    productId: 'tl.cash.bundle_medium' as const,
    title: 'Medium cash bundle',
    description: '150 in-game cash',
    cashAmount: 150,
    priceUsdCents: 499,
    bestValueBadge: false,
  },
  {
    productId: 'tl.cash.bundle_large' as const,
    title: 'Large cash bundle',
    description: '350 in-game cash',
    cashAmount: 350,
    priceUsdCents: 999,
    bestValueBadge: true,
  },
];

export const garageExpansionProducts = [
  {
    productId: 'tl.garage.driver_slot' as const,
    title: '+1 driver slot',
    description: 'Bench up to 5 drivers',
    priceUsdCents: 299,
    capPerUser: 1,
  },
  {
    productId: 'tl.garage.constructor_slot' as const,
    title: '+1 constructor slot',
    description: 'Bench up to 3 constructors',
    priceUsdCents: 299,
    capPerUser: 1,
  },
];

export const subscriptionProducts = [
  {
    productId: 'tl.commissioner_pro.monthly' as const,
    title: 'Commissioner Pro · monthly',
    description: 'Up to 16 members per league, multi-league commissioning, exportable ledger, league branding',
    priceUsdCents: 499,
    period: 'P1M' as const,
  },
  {
    productId: 'tl.commissioner_pro.yearly' as const,
    title: 'Commissioner Pro · yearly',
    description: 'Save 33% with annual billing',
    priceUsdCents: 3999,
    period: 'P1Y' as const,
    bestValueBadge: true,
  },
];

// One product list for catalog screens.
export const allProducts = [
  ...cosmeticPacks.filter((p) => !p.isFree).map((p) => ({
    productId: p.productId,
    title: p.name,
    description: p.tagline,
    priceUsdCents: p.priceUsdCents,
    category: 'cosmetic_pack' as const,
  })),
  ...consumableProducts.map((c) => ({
    productId: c.productId,
    title: c.title,
    description: c.description,
    priceUsdCents: c.priceUsdCents,
    category: 'consumable' as const,
  })),
  ...garageExpansionProducts.map((g) => ({
    productId: g.productId,
    title: g.title,
    description: g.description,
    priceUsdCents: g.priceUsdCents,
    category: 'garage_expansion' as const,
  })),
  ...subscriptionProducts.map((s) => ({
    productId: s.productId,
    title: s.title,
    description: s.description,
    priceUsdCents: s.priceUsdCents,
    category: 'subscription' as const,
  })),
];

export const monetizationConfig = {
  WEEKLY_CASH_BUNDLE_CAP: 1, // anti-P2W guardrail per game rules doc
  COMMISSIONER_PRO_FREE_TRIAL_DAYS: 7,
  GARAGE_DRIVER_SLOT_CAP: 1, // max +1 over base 4
  GARAGE_CONSTRUCTOR_SLOT_CAP: 1, // max +1 over base 2
  COMMISSIONER_PRO_MAX_MEMBERS: 16, // free is 8
};
