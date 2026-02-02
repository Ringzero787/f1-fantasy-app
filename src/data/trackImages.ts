// Individual track images mapping
// React Native requires static imports for images

export const trackImages: Record<string, any> = {
  // By circuit/city name
  'albert park': require('../../pics/tracks/albert park.png'),
  'melbourne': require('../../pics/tracks/albert park.png'),
  'austin': require('../../pics/tracks/austin.png'),
  'bahrain': require('../../pics/tracks/bahrain.png'),
  'sakhir': require('../../pics/tracks/bahrain.png'),
  'baku': require('../../pics/tracks/baku.png'),
  'azerbaijan': require('../../pics/tracks/baku.png'),
  'barcelona': require('../../pics/tracks/barcelona.png'),
  'spain': require('../../pics/tracks/barcelona.png'),
  'madrid': require('../../pics/tracks/barcelona.png'), // Use Barcelona for Madrid (new track)
  'spa': require('../../pics/tracks/belgium.png'),
  'belgium': require('../../pics/tracks/belgium.png'),
  'budapest': require('../../pics/tracks/hungary.png'),
  'hungary': require('../../pics/tracks/hungary.png'),
  'hungaroring': require('../../pics/tracks/hungary.png'),
  'imola': require('../../pics/tracks/imola.png'),
  'interlagos': require('../../pics/tracks/interlagos.png'),
  'sao paulo': require('../../pics/tracks/interlagos.png'),
  'brazil': require('../../pics/tracks/interlagos.png'),
  'jeddah': require('../../pics/tracks/jeddah.png'),
  'saudi arabia': require('../../pics/tracks/jeddah.png'),
  'las vegas': require('../../pics/tracks/lasvegas.png'),
  'lasvegas': require('../../pics/tracks/lasvegas.png'),
  'lusail': require('../../pics/tracks/lusail.png'),
  'qatar': require('../../pics/tracks/lusail.png'),
  'mexico': require('../../pics/tracks/mexico.png'),
  'mexico city': require('../../pics/tracks/mexico.png'),
  'miami': require('../../pics/tracks/miami.png'),
  'monaco': require('../../pics/tracks/monaco.png'),
  'monte carlo': require('../../pics/tracks/monaco.png'),
  'montreal': require('../../pics/tracks/montreal.png'),
  'canada': require('../../pics/tracks/montreal.png'),
  'monza': require('../../pics/tracks/monza.png'),
  'italy': require('../../pics/tracks/monza.png'),
  'red bull ring': require('../../pics/tracks/redbullring.png'),
  'spielberg': require('../../pics/tracks/redbullring.png'),
  'austria': require('../../pics/tracks/redbullring.png'),
  'shanghai': require('../../pics/tracks/shanghai.png'),
  'china': require('../../pics/tracks/shanghai.png'),
  'silverstone': require('../../pics/tracks/silverstone.png'),
  'great britain': require('../../pics/tracks/silverstone.png'),
  'united kingdom': require('../../pics/tracks/silverstone.png'),
  'uk': require('../../pics/tracks/silverstone.png'),
  'singapore': require('../../pics/tracks/singapore.png'),
  'marina bay': require('../../pics/tracks/singapore.png'),
  'suzuka': require('../../pics/tracks/suzuka.png'),
  'japan': require('../../pics/tracks/suzuka.png'),
  'yas marina': require('../../pics/tracks/yasmarina.png'),
  'abu dhabi': require('../../pics/tracks/yasmarina.png'),
  'united arab emirates': require('../../pics/tracks/yasmarina.png'),
  'uae': require('../../pics/tracks/yasmarina.png'),
  'zandvoort': require('../../pics/tracks/zandvoort.png'),
  'netherlands': require('../../pics/tracks/zandvoort.png'),
};

// Helper function to get track image by country and/or city
export function getTrackImage(country: string, city?: string): any {
  const normalizedCountry = country.toLowerCase().trim();
  const normalizedCity = city?.toLowerCase().trim();

  // Try city first (more specific)
  if (normalizedCity && trackImages[normalizedCity]) {
    return trackImages[normalizedCity];
  }

  // Try country
  if (trackImages[normalizedCountry]) {
    return trackImages[normalizedCountry];
  }

  // Return null if no match found
  return null;
}
