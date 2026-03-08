/**
 * OpenF1 Ingestion Configuration
 *
 * Static mappings and constants for automated race result ingestion.
 */

export const SEASON_YEAR = 2026;
export const AUTO_APPROVE = true;
export const CHECK_INTERVAL = 'every 30 minutes';

/**
 * Maps round number → Firestore race ID.
 * Derived from demoRaces in src/data/demoData.ts.
 */
export const ROUND_TO_RACE_ID: Record<number, string> = {
  1: 'australia_2026',
  2: 'china_2026',
  3: 'japan_2026',
  4: 'bahrain_2026',
  5: 'saudi_2026',
  6: 'miami_2026',
  7: 'canada_2026',
  8: 'monaco_2026',
  9: 'spain_2026',
  10: 'austria_2026',
  11: 'britain_2026',
  12: 'belgium_2026',
  13: 'hungary_2026',
  14: 'netherlands_2026',
  15: 'italy_2026',
  16: 'madrid_2026',
  17: 'azerbaijan_2026',
  18: 'singapore_2026',
  19: 'usa_2026',
  20: 'mexico_2026',
  21: 'brazil_2026',
  22: 'las_vegas_2026',
  23: 'qatar_2026',
  24: 'abu_dhabi_2026',
};

/** Rounds that have sprint races */
export const SPRINT_ROUNDS = new Set([2, 6, 7, 11, 14, 18]);

/**
 * Maps OpenF1 driver numbers to our app's driver IDs.
 * Confirmed 2026 numbers from formula1.com/en/drivers.
 */
export const DRIVER_NUMBER_TO_ID: Record<number, string> = {
  1: 'norris',
  3: 'verstappen',
  5: 'bortoleto',
  6: 'hadjar',
  10: 'gasly',
  11: 'perez',
  12: 'antonelli',
  14: 'alonso',
  16: 'leclerc',
  18: 'stroll',
  23: 'albon',
  27: 'hulkenberg',
  30: 'lawson',
  31: 'ocon',
  41: 'lindblad',
  43: 'colapinto',
  44: 'hamilton',
  55: 'sainz',
  63: 'russell',
  77: 'bottas',
  81: 'piastri',
  87: 'bearman',
};

/**
 * Maps OpenF1 team names (multiple variants) to our constructor IDs.
 */
export const TEAM_NAME_TO_ID: Record<string, string> = {
  'Red Bull Racing': 'red_bull',
  'McLaren': 'mclaren',
  'Ferrari': 'ferrari',
  'Mercedes': 'mercedes',
  'Aston Martin': 'aston_martin',
  'Alpine': 'alpine',
  'Williams': 'williams',
  'RB': 'racing_bulls',
  'Visa Cash App RB': 'racing_bulls',
  'Racing Bulls': 'racing_bulls',
  'Kick Sauber': 'audi',
  'Sauber': 'audi',
  'Audi': 'audi',
  'Haas F1 Team': 'haas',
  'Haas': 'haas',
  'Cadillac': 'cadillac',
  'Cadillac F1': 'cadillac',
};
