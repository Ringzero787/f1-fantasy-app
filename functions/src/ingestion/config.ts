/**
 * OpenF1 Ingestion Configuration
 *
 * Static mappings and constants for automated race result ingestion.
 */

export const AUTO_APPROVE = true;
export const CHECK_INTERVAL = 'every 30 minutes';

// F-149: there is no season year, round → race table or sprint round list here any more. Every
// ingestion job starts from a race document: its `seasonId` picks the OpenF1 calendar and its race
// time picks the meeting (see season.ts). Sprint weekends are the meetings OpenF1 lists a Sprint for.

/**
 * Maps OpenF1 driver numbers to our app's driver IDs, for the season DRIVER_TABLE_SEASON names
 * (season.ts). Confirmed 2026 numbers from formula1.com/en/drivers. A race from another season is
 * never resolved through this table: update it and bump DRIVER_TABLE_SEASON together.
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
  // Car 50: Hirakawa's one-off stand-in for Ocon at Mexico City 2026 (round 21, F-134; no drivers/
  // doc, so he could not be bought). Ocon's 31 stays: his earlier results are stored under it.
  50: 'hirakawa',
  // Câmara took the Haas seat from São Paulo 2026 (round 22) in car 51 (F-139). F-138 had him in
  // car 50, so the São Paulo race and qualifying were held on "Unknown driver number: 51".
  51: 'camara',
  55: 'sainz',
  63: 'russell',
  77: 'bottas',
  81: 'piastri',
  87: 'bearman',
};

/**
 * F-138: car numbers whose occupant is resolved by the provider's `name_acronym`. The provider's
 * driver record for a session names who was in the car, so a session that carries one of these
 * numbers is resolved by the name; `DRIVER_NUMBER_TO_ID` is the fallback for rows without one
 * (grid, positions, a fastest lap) and for a name the entry does not list.
 *
 * F-139: Câmara races 51, not 50, so 50 has only ever been Hirakawa's. The entry stays as a
 * guard: a session that ever names him in car 50 still resolves to him rather than to Hirakawa.
 */
export const SHARED_NUMBERS: Record<number, Record<string, string>> = {
  50: { HIR: 'hirakawa', CAM: 'camara' },
};

const own = (o: object, k: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(o, k);

/**
 * The driver id for a provider-typed car number, or undefined for a number the table does not
 * know: only whole numbers that are the table's own keys count. On a shared number the named
 * occupant wins when the acronym is one the table lists; otherwise the `DRIVER_NUMBER_TO_ID` entry.
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
 * True when a shared number's session names an occupant the table does not list: the row is
 * still credited to the current occupant, and the result converters say so in a warning (a
 * fourth driver in car 50 must show up in the pending result, not quietly become the third).
 */
export function unlistedOccupant(n: unknown, acronym: unknown): boolean {
  if (!Number.isInteger(n) || !own(SHARED_NUMBERS, n as number) || typeof acronym !== 'string') return false;
  return !own(SHARED_NUMBERS[n as number], acronym.trim().toUpperCase());
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
