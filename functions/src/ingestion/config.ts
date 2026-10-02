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
  // 4 and 5 cancelled (Bahrain & Saudi — Middle East conflict)
  // 4: 'bahrain_2026',
  // 5: 'saudi_2026',
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
  // The cancelled Bahrain GP was reinstated and run at Sepang on 2026-10-02,
  // inserted chronologically, so everything from Singapore onward shifts up
  // one. deriveRoundNumbers() orders OpenF1 meetings by date, and OpenF1 still
  // lists the two cancelled April meetings (Sakhir r4, Jeddah r5), so its
  // derived rounds line up with ours: r18 = Kuala Lumpur/Bahrain, r19 =
  // Singapore … r25 = Yas Marina. Verified against the live API 2026-10-02.
  18: 'bahrain_2026', // run at Sepang, not Sakhir — r4 above stays cancelled
  19: 'singapore_2026',
  20: 'usa_2026',
  21: 'mexico_2026',
  22: 'brazil_2026',
  23: 'las_vegas_2026',
  24: 'qatar_2026',
  25: 'abu_dhabi_2026',
};

// Real 2026 F1 sprint weekends, verified against OpenF1 sessions
// (session_name=Sprint, year=2026) and the Jolpica/Ergast calendar.
// App round numbering includes the cancelled Bahrain/Saudi rounds 4-5.
//   2  · China (Shanghai)
//   6  · Miami
//   7  · Canada (Montreal)
//   11 · Britain (Silverstone)
//   14 · Netherlands (Zandvoort)
//   19 · Singapore
// NOTE: {2,6,12,19,21,23} was the 2025-style list — wrong for 2026.
// NOTE: Singapore moved 18 -> 19 on 2026-10-01. The cancelled Bahrain GP was
// reinstated and run at Sepang, inserted chronologically as round 18, pushing
// Singapore..Abu Dhabi up one (F-076). Bahrain@Sepang is NOT a sprint, so
// leaving 18 here would have flagged the wrong race.
export const SPRINT_ROUNDS = new Set([2, 6, 7, 11, 14, 19]);

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
  // One-off Zandvoort (round 14) stand-in: Hadjar sat out, Lawson moved up to
  // Red Bull and Tsunoda took the Racing Bulls seat. Unmapped, he was dropped
  // from all three sessions and Racing Bulls scored with a single car (23 pts
  // instead of 47). He has no drivers/ doc, so he stays unpurchasable and
  // unpriced — this mapping exists only so his result reaches the constructor
  // aggregate. Verified against every 2026 scored session: he is the only
  // driver number outside this map that appears in a Race/Sprint/Qualifying
  // session (the FP1 rookie numbers never do).
  22: 'tsunoda',
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
