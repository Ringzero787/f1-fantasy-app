export const PRODUCT_IDS = {
  LEAGUE_EXPANSION: 'league.expansion',
  AVATAR_PACK: 'avatar.pack',
  LEAGUE_SLOT: 'league.slot',
  /**
   * Pit Wall Pass, one season. Same id in every store and the same id the Stripe checkout puts in
   * its metadata, so one entitlement is granted whatever the purchase route (F-068, F-077).
   * Unlike the others this is NOT granted on the device: the server validates the receipt and
   * writes the pass, a trigger stamps the auth claim, and the Firestore rules read that claim.
   */
  PITWALL_PASS: 'pitwall.pass.season',
  /**
   * Charter (F-175): Pit Wall for every approved member of ONE league, for one season, bought by
   * that league's owner. Server-granted like the pass, but onto the league (`leagues/{id}.charter`)
   * and each member's `charterAccess`, never onto anyone's pass. Play, App Store and Stripe only.
   */
  PITWALL_CHARTER: 'pitwall.charter.season',
  /**
   * League slot packs (owner decision 2026-11-25): +3 member slots, stackable, no ceiling, bought by
   * the league owner and applied by the server to the league the purchase names. Two products
   * because a store product has one price: $3.99 for a chartered league (each extra player gets
   * Pit Wall), $4.99 otherwise. Not on Amazon at the Charter price (Charter is not sold there).
   */
  SLOT_PACK: 'league.slots3',
  SLOT_PACK_CHARTER: 'league.slots3.charter',
} as const;

/** Member slots one pack adds. Same number as SLOTS_PER_PACK in functions/src/purchases/slotPack.ts. */
export const SLOTS_PER_PACK = 3;

export const AVATAR_PACK_CREDITS = 20;

/**
 * The +20 slot pack (`league.expansion`) is retired (owner decision 2026-11-24, F-175): leagues stay
 * at 22 and Charter is the league-level product. Nothing in the app sells it any more. A credit a
 * player already paid for is still honoured: the league screens offer to apply it, and the server
 * still validates and applies purchases made from older builds until the store listings are removed.
 */
export const LEAGUE_EXPANSION_ON_SALE = false;

/** Everything the store is asked about at start-up. */
export const ALL_PRODUCT_IDS = Object.values(PRODUCT_IDS);

export const PRODUCTS = {
  [PRODUCT_IDS.LEAGUE_EXPANSION]: {
    title: 'League Slot Pack',
    description: 'Add 20 more member slots to your league',
    price: '$4.99',
    icon: 'people' as const,
    benefits: [
      '+20 member slots',
      'Stackable \u2014 buy multiple times',
      'Applied instantly to your league',
    ],
  },
  [PRODUCT_IDS.AVATAR_PACK]: {
    title: 'AI Avatar Pack',
    description: '20 additional AI-generated avatar credits',
    price: '$1.99',
    icon: 'sparkles' as const,
    benefits: [
      '20 extra AI avatar generations',
      'Use for team, league, or profile avatars',
      'Credits never expire',
    ],
  },
  [PRODUCT_IDS.PITWALL_PASS]: {
    title: 'Pit Wall Pass',
    description: 'The full Pit Wall portal for the season, and League Pro for the leagues you own',
    price: '$14.99',
    icon: 'analytics' as const,
    benefits: [
      'Projections, ranges and retirement risk for the whole grid',
      'Recommended swaps with the points behind each one',
      'League Pro for every league you own',
    ],
  },
  [PRODUCT_IDS.PITWALL_CHARTER]: {
    title: 'Charter',
    description: 'Pit Wall for every player in one league, for the season.',
    price: '$39.99',
    icon: 'ribbon' as const,
    benefits: [
      'Pit Wall for every approved player in this league',
      'Your league listed in search, above unchartered leagues',
      'Valid for the whole season',
    ],
  },
  [PRODUCT_IDS.SLOT_PACK]: {
    title: 'League Slots',
    description: 'Add 3 more member slots to your league',
    price: '$4.99',
    icon: 'people' as const,
    benefits: ['+3 member slots', 'Buy as many as you like', 'Added to your league straight away'],
  },
  [PRODUCT_IDS.SLOT_PACK_CHARTER]: {
    title: 'League Slots',
    description: 'Add 3 more member slots to your chartered league',
    price: '$3.99',
    icon: 'people' as const,
    benefits: ['+3 member slots', 'Every player you add gets Pit Wall', 'Buy as many as you like'],
  },
  [PRODUCT_IDS.LEAGUE_SLOT]: {
    title: 'Extra League Slot',
    description: 'Create an additional fantasy league',
    price: '$2.99',
    icon: 'trophy' as const,
    benefits: [
      'Create one additional league',
      'Your first league is always free',
      'Invite friends to compete',
    ],
  },
};
