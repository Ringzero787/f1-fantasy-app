/**
 * Where each circuit is, so a forecast can be asked for (F-070 weather).
 *
 * Plain geographic coordinates for the venues on the 2026 calendar, to about a kilometre, which is
 * all a weather forecast needs. Keyed by the `circuitId` on the race document.
 */
export interface Place { lat: number; lon: number }

export const CIRCUITS: Record<string, Place> = {
  albert_park: { lat: -37.85, lon: 144.97 },
  shanghai: { lat: 31.34, lon: 121.22 },
  suzuka: { lat: 34.84, lon: 136.54 },
  bahrain: { lat: 26.03, lon: 50.51 },
  jeddah: { lat: 21.63, lon: 39.1 },
  miami: { lat: 25.96, lon: -80.24 },
  montreal: { lat: 45.5, lon: -73.52 },
  monaco: { lat: 43.73, lon: 7.42 },
  barcelona: { lat: 41.57, lon: 2.26 },
  red_bull_ring: { lat: 47.22, lon: 14.76 },
  silverstone: { lat: 52.07, lon: -1.02 },
  spa: { lat: 50.44, lon: 5.97 },
  hungaroring: { lat: 47.58, lon: 19.25 },
  zandvoort: { lat: 52.39, lon: 4.54 },
  monza: { lat: 45.62, lon: 9.29 },
  madrid: { lat: 40.47, lon: -3.6 },
  baku: { lat: 40.37, lon: 49.85 },
  marina_bay: { lat: 1.29, lon: 103.86 },
  cota: { lat: 30.13, lon: -97.64 },
  hermanos_rodriguez: { lat: 19.4, lon: -99.09 },
  interlagos: { lat: -23.7, lon: -46.7 },
  las_vegas: { lat: 36.12, lon: -115.17 },
  lusail: { lat: 25.49, lon: 51.45 },
  yas_marina: { lat: 24.47, lon: 54.6 },
};

export const placeOf = (circuitId: string): Place | null => CIRCUITS[circuitId] ?? null;
