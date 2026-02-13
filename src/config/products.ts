export const PRODUCT_IDS = {
  LEAGUE_EXPANSION: 'com.f1fantasy.app.league_expansion',
  AVATAR_PACK: 'com.f1fantasy.app.avatar_pack',
  LEAGUE_SLOT: 'com.f1fantasy.app.league_slot',
} as const;

export const AVATAR_PACK_CREDITS = 40;

export const PRODUCTS = {
  [PRODUCT_IDS.LEAGUE_EXPANSION]: {
    title: 'League Expansion',
    description: 'Unlock more than 22 members for this league',
    price: '$9.99',
    icon: 'people' as const,
    benefits: [
      'Allow up to 100 members in this league',
      'One-time purchase per league',
    ],
  },
  [PRODUCT_IDS.AVATAR_PACK]: {
    title: 'AI Avatar Pack',
    description: '40 additional AI-generated avatar credits',
    price: '$4.99',
    icon: 'sparkles' as const,
    benefits: [
      '40 extra AI avatar generations',
      'Use for team, league, or profile avatars',
      'Credits never expire',
    ],
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
