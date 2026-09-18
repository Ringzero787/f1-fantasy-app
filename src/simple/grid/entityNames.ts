import { demoDrivers } from '../../data/demoData';

// Car numbers — fallback when remote config hasn't supplied a driver's number.
const DRIVER_NUMBERS: Record<string, number> = Object.fromEntries(demoDrivers.map((d) => [d.id, d.number]));

export function driverNumber(driverId: string): number | null {
  return DRIVER_NUMBERS[driverId] ?? null;
}

// Short constructor names — tiles and picker rows use these so they never truncate.
const CONSTRUCTOR_SHORT_NAMES: Record<string, string> = {
  mclaren: 'McLaren',
  ferrari: 'Ferrari',
  mercedes: 'Mercedes',
  red_bull: 'Red Bull',
  williams: 'Williams',
  haas: 'Haas',
  aston_martin: 'Aston Martin',
  alpine: 'Alpine',
  rb: 'RB',
  racing_bulls: 'RB',
  audi: 'Audi',
  cadillac: 'Cadillac',
};

export function constructorShortName(constructorId: string, fallback?: string): string {
  return CONSTRUCTOR_SHORT_NAMES[constructorId] ?? fallback ?? constructorId;
}
