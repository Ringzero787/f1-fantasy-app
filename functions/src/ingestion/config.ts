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
  // Car 50 has had two occupants (F-138): Hirakawa stood in for Ocon at Mexico City 2026 (round 21,
  // F-134; no drivers/ doc, so he could not be bought), then Câmara took the Haas seat from São
  // Paulo 2026 (round 22) when Ocon left the team. A row that names its driver is resolved through
  // SHARED_NUMBERS below; this entry is the current occupant, for rows that carry only the number.
  // Ocon's 31 stays: his earlier results are stored under it and a number is not reused in-season.
  50: 'camara',
  55: 'sainz',
  63: 'russell',
  77: 'bottas',
  81: 'piastri',
  87: 'bearman',
};

/**
 * F-138: car numbers that changed hands during the season, occupant by the provider's
 * `name_acronym`. The provider's driver record for a session names who was in the car, so a
 * session that carries one of these numbers is resolved by the name; `DRIVER_NUMBER_TO_ID`
 * keeps the current occupant for rows without one (grid, positions, a fastest lap).
 */
export const SHARED_NUMBERS: Record<number, Record<string, string>> = {
  50: { HIR: 'hirakawa', CAM: 'camara' },
};

const own = (o: object, k: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(o, k);

/**
 * The driver id for a provider-typed car number, or undefined for a number the table does not
 * know: only whole numbers that are the table's own keys count. On a shared number the named
 * occupant wins when the acronym is one the table lists; otherwise the current occupant.
 */
export function driverIdFor(n: unknown, acronym?: unknown): string | undefined {
  if (!Number.isInteger(n)) return undefined;
  const num = n as number;
  if (own(SHARED_NUMBERS, num) && typeof acronym === 'string') {
    const byName = SHARED_NUMBERS[num];
    const key = acronym.trim().toUpperCase();
    if (own(byName, key)) return byName[key];
  }
  return own(DRIVER_NUMBER_TO_ID, num) ? DRIVER_NUMBER_TO_ID[num] : undefined;
}

/**
 * Car number → driver id for one session, from its driver records: the table, with each shared
 * number resolved to whoever the session names in the car. Records with an unknown number are left out.
 */
export function numberToIdFor(drivers: ReadonlyArray<{ driver_number?: unknown; name_acronym?: unknown }>): Record<number, string> {
  const out: Record<number, string> = { ...DRIVER_NUMBER_TO_ID };
  for (const d of drivers) {
    const id = driverIdFor(d.driver_number, d.name_acronym);
    if (id) out[d.driver_number as number] = id;
  }
  return out;
}

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
