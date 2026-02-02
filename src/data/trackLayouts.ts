// Track layout sprite positions for the combined icons.png image
// The image is a 6x4 grid of track icons

export interface TrackSpritePosition {
  circuitName: string;
  country: string;
  city?: string;
  row: number; // 0-3
  col: number; // 0-5
}

// Sprite positions based on the icons.png layout
// Row 1: Bahrain, Jeddah, Albert Park, Suzuka, Shanghai, Miami
// Row 2: Imola, Monaco, Montreal, Barcelona, Red Bull Ring, Silverstone
// Row 3: Hungaroring, Spa, Zandvoort, Monza, Baku, Singapore
// Row 4: Austin, Mexico City, Interlagos, Las Vegas, Lusail, Yas Marina
export const trackSpritePositions: TrackSpritePosition[] = [
  // Row 1
  { circuitName: 'Sakhir', country: 'Bahrain', city: 'Sakhir', row: 0, col: 0 },
  { circuitName: 'Jeddah', country: 'Saudi Arabia', city: 'Jeddah', row: 0, col: 1 },
  { circuitName: 'Albert Park', country: 'Australia', city: 'Melbourne', row: 0, col: 2 },
  { circuitName: 'Suzuka', country: 'Japan', city: 'Suzuka', row: 0, col: 3 },
  { circuitName: 'Shanghai', country: 'China', city: 'Shanghai', row: 0, col: 4 },
  { circuitName: 'Miami', country: 'United States', city: 'Miami', row: 0, col: 5 },

  // Row 2
  { circuitName: 'Imola', country: 'Italy', city: 'Imola', row: 1, col: 0 },
  { circuitName: 'Monte Carlo', country: 'Monaco', city: 'Monte Carlo', row: 1, col: 1 },
  { circuitName: 'Montreal', country: 'Canada', city: 'Montreal', row: 1, col: 2 },
  { circuitName: 'Catalunya', country: 'Spain', city: 'Barcelona', row: 1, col: 3 },
  { circuitName: 'Red Bull Ring', country: 'Austria', city: 'Spielberg', row: 1, col: 4 },
  { circuitName: 'Silverstone', country: 'Great Britain', city: 'Silverstone', row: 1, col: 5 },

  // Row 3
  { circuitName: 'Hungaroring', country: 'Hungary', city: 'Budapest', row: 2, col: 0 },
  { circuitName: 'Spa-Francorchamps', country: 'Belgium', city: 'Spa', row: 2, col: 1 },
  { circuitName: 'Zandvoort', country: 'Netherlands', city: 'Zandvoort', row: 2, col: 2 },
  { circuitName: 'Monza', country: 'Italy', city: 'Monza', row: 2, col: 3 },
  { circuitName: 'Baku', country: 'Azerbaijan', city: 'Baku', row: 2, col: 4 },
  { circuitName: 'Marina Bay', country: 'Singapore', city: 'Singapore', row: 2, col: 5 },

  // Row 4
  { circuitName: 'COTA', country: 'United States', city: 'Austin', row: 3, col: 0 },
  { circuitName: 'Hermanos Rodriguez', country: 'Mexico', city: 'Mexico City', row: 3, col: 1 },
  { circuitName: 'Interlagos', country: 'Brazil', city: 'Sao Paulo', row: 3, col: 2 },
  { circuitName: 'Las Vegas', country: 'United States', city: 'Las Vegas', row: 3, col: 3 },
  { circuitName: 'Lusail', country: 'Qatar', city: 'Lusail', row: 3, col: 4 },
  { circuitName: 'Yas Marina', country: 'United Arab Emirates', city: 'Abu Dhabi', row: 3, col: 5 },
];

// Additional entries for circuits not in the sprite (Madrid is new for 2026)
// We'll use Barcelona's icon as fallback for Madrid since it's also Spain
export const fallbackPositions: Record<string, TrackSpritePosition> = {
  'madrid': { circuitName: 'Madrid', country: 'Spain', city: 'Madrid', row: 1, col: 3 }, // Use Barcelona
};

// Sprite sheet dimensions
export const SPRITE_COLS = 6;
export const SPRITE_ROWS = 4;

// Helper function to find track sprite position by country and optionally city
export function getTrackSpritePosition(country: string, city?: string): TrackSpritePosition | undefined {
  const normalizedCountry = country.toLowerCase().trim();
  const normalizedCity = city?.toLowerCase().trim();

  // Handle special country name mappings
  const countryMap: Record<string, string> = {
    'uae': 'united arab emirates',
    'uk': 'great britain',
    'united kingdom': 'great britain',
    'england': 'great britain',
    'usa': 'united states',
    'america': 'united states',
  };

  const searchCountry = countryMap[normalizedCountry] || normalizedCountry;

  // First try to match by city if provided (for countries with multiple tracks)
  if (normalizedCity) {
    // Check fallback positions first (for Madrid, etc.)
    const fallback = fallbackPositions[normalizedCity];
    if (fallback) return fallback;

    const byCity = trackSpritePositions.find(
      t => t.country.toLowerCase() === searchCountry &&
           (t.city?.toLowerCase() === normalizedCity ||
            t.circuitName.toLowerCase().includes(normalizedCity))
    );
    if (byCity) return byCity;
  }

  // Fall back to country-only match (returns first match for that country)
  return trackSpritePositions.find(t => t.country.toLowerCase() === searchCountry);
}
