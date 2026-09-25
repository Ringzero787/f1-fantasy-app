import { describe, expect, it } from 'vitest';
import { looming } from './WeatherMap';
import type { MapFrame } from '../data/types';

// 5x5, row-major from the north-west; index 12 is the circuit.
const grid = (wet: Record<number, number>): Array<number | null> => Array.from({ length: 25 }, (_, i) => wet[i] ?? 0);
const frame = (rainMm: Array<number | null>, windFromDeg: number | null, windKph: number | null = 20): MapFrame => ({ offsetH: 0, at: '2026-09-26T11:00:00.000Z', rainMm, windFromDeg, windKph });

describe('looming', () => {
  it('names rain over the circuit first', () => {
    expect(looming(frame(grid({ 12: 2.1 }), 315), 5, 40)).toBe('Rain over the circuit itself: 2.1 mm in the hour.');
  });

  it('reports the wettest upwind cell with its distance and a time at the current wind', () => {
    // wind from the north-west: the north-west corner (index 0, ~113 km) is upwind and wet
    expect(looming(frame(grid({ 0: 3.2 }), 315, 40), 5, 40)).toBe('Rain 113 km to the NW, upwind, about 3h away at this wind: 3.2 mm in the hour.');
  });

  it('ignores rain that is downwind, and says so', () => {
    // wind from the north-west, but the rain is in the south-east corner, moving away
    expect(looming(frame(grid({ 24: 3.2 }), 315), 5, 40)).toBeNull();
  });

  it('has nothing to say without a wind direction or with a dry grid', () => {
    expect(looming(frame(grid({ 0: 3.2 }), null), 5, 40)).toBeNull();
    expect(looming(frame(grid({}), 90), 5, 40)).toBeNull();
    expect(looming(frame(Array(25).fill(null), 90), 5, 40)).toBeNull();
  });
});
