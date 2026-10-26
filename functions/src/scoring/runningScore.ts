/**
 * Race-day running score (F-129): what each driver and constructor would score for the RACE SESSION
 * if it ended at the current running order. Pure — no Firestore, no clock, no network.
 *
 * It applies exactly the formula `calculateDriverPoints` applies to a classified finisher: race
 * points by position, places gained or lost against the grid, the fastest-lap point inside the top
 * ten, and the reverse-grid position bonus. The Ace multiplier and the loyalty lock bonus are the
 * roster's business and are applied by the app per team; qualifying and sprint points are already
 * banked by the time the race starts, so they are not part of this number.
 *
 * What it cannot know: a retired car. The live positions feed carries no retirement flag; what it
 * does (checked on the 2026 United States race, session 11396: all three retirements moved to
 * P20–P22 within seconds of stopping, no two cars ever shared a final position) is drop the car to
 * the back of the running order, so it is scored as a back-marker finisher there until the official
 * classification applies the real DNF penalty. The app says the number is a running score, never
 * the result.
 */

import { calculateDriverPoints, constructorRacePoints } from './scoringCore';

export interface RunningScore {
  /** full race-session points per driver id, as `calculateDriverPoints` would score the position */
  drivers: Record<string, number>;
  /** per constructor id: both cars' position points + reverse-grid bonus, the constructor scorer's formula */
  constructors: Record<string, number>;
}

/** When the feed has a grid but not this car, the official scorer starts it from the back. */
export const GRID_FALLBACK = 22;

/**
 * @param positions  driver id → current position (the sweep's `byDriver`)
 * @param grid       driver id → starting grid slot; an EMPTY map means the grid is not known yet, and
 *                   then nobody is credited with places gained or lost (a known grid missing one car
 *                   puts that car at the back, as the official scorer does)
 * @param fastestLap driver id holding the fastest lap so far, or null
 * @param constructorOf driver id → constructor id; a driver without one scores for no constructor
 */
export function runningScore(
  positions: Record<string, number>,
  grid: Record<string, number>,
  fastestLap: string | null,
  constructorOf: Record<string, string>,
): RunningScore {
  const gridKnown = Object.keys(grid).length > 0;
  const drivers: Record<string, number> = {};
  const constructors: Record<string, number> = {};
  for (const [driverId, position] of Object.entries(positions)) {
    if (!Number.isInteger(position) || position < 1) continue;
    const constructorId = Object.prototype.hasOwnProperty.call(constructorOf, driverId) ? constructorOf[driverId] : '';
    const gridPosition = gridKnown
      ? (Object.prototype.hasOwnProperty.call(grid, driverId) && Number.isInteger(grid[driverId]) && grid[driverId] >= 1 ? grid[driverId] : GRID_FALLBACK)
      : position;
    // racesHeld 0 and isAce false: the neutral number, no lock bonus, no multiplier
    drivers[driverId] = calculateDriverPoints(
      { position, driverId, constructorId, gridPosition, status: 'finished', fastestLap: fastestLap === driverId },
      null,
      0,
      false,
    );
    if (constructorId) constructors[constructorId] = (constructors[constructorId] ?? 0) + constructorRacePoints(position);
  }
  return { drivers, constructors };
}
