/**
 * The circuit characteristics table (F-070 "inputs we maintain", F-072 circuit report).
 *
 * These are editorial: five-point ratings written and kept by us from the public shape of each
 * venue (lap length, the number and kind of corners, how often the safety car has been needed,
 * how hard the surface is on tyres), not measured from timing. They drive two things: the circuit
 * profile the Circuit page shows, and the CLASSES a venue belongs to (street or permanent, and a
 * speed class), which is what the results splits are cut by. The fit numbers themselves come from
 * our own classifications at circuits of the same class, never from these ratings alone.
 *
 * Ratings are 1 (little) to 5 (a lot). `pitLossS` is the usual time lost to a stop.
 */
export type CircuitKind = 'street' | 'permanent';
export type SpeedClass = 'high' | 'medium' | 'low';

export interface CircuitTraits {
  id: string;
  name: string;
  kind: CircuitKind;
  speed: SpeedClass;
  laps: number;
  lapKm: number;
  straights: number;
  slowCorners: number;
  overtaking: number;
  scRate: number;
  tyreStress: number;
  pitLossS: number;
  strategy: string;
}

const T = (id: string, name: string, kind: CircuitKind, speed: SpeedClass, laps: number, lapKm: number, straights: number, slowCorners: number, overtaking: number, scRate: number, tyreStress: number, pitLossS: number, strategy: string): CircuitTraits =>
  ({ id, name, kind, speed, laps, lapKm, straights, slowCorners, overtaking, scRate, tyreStress, pitLossS, strategy });

export const CIRCUIT_TRAITS: Record<string, CircuitTraits> = Object.fromEntries([
  T('albert_park', 'Albert Park', 'street', 'medium', 58, 5.278, 3, 3, 3, 4, 3, 20, '1 stop · M → H'),
  T('shanghai', 'Shanghai', 'permanent', 'medium', 56, 5.451, 4, 3, 4, 2, 4, 22, '2 stops'),
  T('suzuka', 'Suzuka', 'permanent', 'high', 53, 5.807, 3, 2, 2, 2, 5, 21, '2 stops'),
  T('bahrain', 'Sakhir', 'permanent', 'medium', 57, 5.412, 4, 4, 4, 2, 5, 22, '2 to 3 stops'),
  T('jeddah', 'Jeddah', 'street', 'high', 50, 6.174, 4, 2, 3, 5, 2, 19, '1 stop'),
  T('miami', 'Miami', 'street', 'medium', 57, 5.412, 4, 3, 3, 3, 3, 19, '1 stop'),
  T('montreal', 'Montreal', 'street', 'medium', 70, 4.361, 5, 4, 4, 4, 2, 17, '1 to 2 stops'),
  T('monaco', 'Monaco', 'street', 'low', 78, 3.337, 1, 5, 1, 4, 1, 19, '2 stops, required'),
  T('barcelona', 'Barcelona', 'permanent', 'medium', 66, 4.657, 3, 3, 2, 1, 4, 21, '2 stops'),
  T('red_bull_ring', 'Spielberg', 'permanent', 'medium', 71, 4.318, 4, 2, 4, 2, 3, 19, '1 to 2 stops'),
  T('silverstone', 'Silverstone', 'permanent', 'high', 52, 5.891, 3, 2, 3, 3, 5, 20, '1 to 2 stops'),
  T('spa', 'Spa', 'permanent', 'high', 44, 7.004, 5, 2, 4, 3, 4, 19, '1 to 2 stops'),
  T('hungaroring', 'Hungaroring', 'permanent', 'low', 70, 4.381, 2, 4, 1, 2, 3, 20, '1 to 2 stops'),
  T('zandvoort', 'Zandvoort', 'permanent', 'medium', 72, 4.259, 2, 3, 1, 3, 3, 19, '1 to 2 stops'),
  T('monza', 'Monza', 'permanent', 'high', 53, 5.793, 5, 3, 4, 2, 2, 23, '1 stop'),
  T('madrid', 'Madrid', 'street', 'medium', 57, 5.47, 3, 3, 3, 3, 3, 20, '1 to 2 stops'),
  T('baku', 'Baku', 'street', 'high', 51, 6.003, 5, 4, 4, 5, 2, 19, '1 stop'),
  T('marina_bay', 'Marina Bay', 'street', 'low', 62, 4.94, 2, 5, 1, 5, 3, 25, '1 to 2 stops'),
  T('cota', 'Austin', 'permanent', 'medium', 56, 5.513, 4, 3, 4, 2, 4, 21, '1 to 2 stops'),
  T('hermanos_rodriguez', 'Mexico City', 'permanent', 'medium', 71, 4.304, 5, 3, 3, 3, 2, 21, '1 stop'),
  T('interlagos', 'Interlagos', 'permanent', 'medium', 71, 4.309, 4, 3, 4, 4, 3, 20, '1 to 2 stops'),
  T('las_vegas', 'Las Vegas', 'street', 'high', 50, 6.201, 5, 3, 4, 3, 1, 20, '1 stop'),
  T('lusail', 'Lusail', 'permanent', 'high', 57, 5.419, 3, 2, 2, 2, 5, 21, '2 stops, tyre limit'),
  T('yas_marina', 'Yas Marina', 'permanent', 'medium', 58, 5.281, 4, 3, 3, 2, 2, 21, '1 stop'),
].map((t) => [t.id, t]));

export const traitsOf = (circuitId: string): CircuitTraits | undefined => CIRCUIT_TRAITS[circuitId];

/** The classes a venue belongs to, which the results splits are cut by. */
export const classesOf = (t: CircuitTraits): string[] => [t.kind, `${t.speed}-speed`];

export const CLASS_LABELS: Record<string, string> = {
  street: 'street circuits', permanent: 'permanent circuits',
  'high-speed': 'high-speed circuits', 'medium-speed': 'medium-speed circuits', 'low-speed': 'low-speed circuits',
};
