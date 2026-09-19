/**
 * The projection model is a PASS feature, so it may only consume our own game
 * data and race classifications (ADR-001). Timing-derived data (laps, stints,
 * pit stops, weather, race control, anything under pw_public_timing) must
 * never reach it. This list is the whole allowed input set; loadHistory
 * refuses anything else and a test pins the list.
 */
export const ALLOWED_INPUT_COLLECTIONS = ['races', 'raceScores', 'priceHistory', 'drivers', 'constructors'] as const;
export const FORBIDDEN_INPUT_PATTERNS = [/timing/i, /^pw_public_timing/, /lap/i, /stint/i, /pit/i, /weather/i, /race_?control/i];

export function assertAllowedInputs(collections: string[]): void {
  for (const c of collections) {
    if (!(ALLOWED_INPUT_COLLECTIONS as readonly string[]).includes(c) || FORBIDDEN_INPUT_PATTERNS.some((p) => p.test(c))) {
      throw new Error(`projection model input "${c}" is not allowed (ADR-001: results, prices and our own game data only)`);
    }
  }
}
