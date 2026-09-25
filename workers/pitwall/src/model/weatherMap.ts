/**
 * A weather map around the circuit (F-070), built from the same MET Norway forecast as the
 * session tile rather than from a map provider.
 *
 * Why not embed a map: the map services that draw radar and storms need a paid key for
 * production, and an embedded third-party frame brings its own scripts and tracking into a paid
 * portal with a strict content policy. MET Norway's point forecast is licensed for commercial use
 * with attribution and we already send it, so the map is a grid of their point forecasts around
 * the circuit, drawn by the portal: rain per cell, wind at the centre, and the same grid a few
 * hours before and after each session so a cell of rain can be seen moving towards the track.
 *
 * Pure apart from `fetchGrid`. One request per grid point; a 5-by-5 grid is 25 requests, well
 * inside their terms, and the job runs a handful of times a day.
 */
import { placeOf, type Place } from './circuits';
import { pointFor, readForecast, USER_AGENT, type ForecastPoint } from './weather';

export const GRID_RADIUS = 2;
export const GRID_SPACING_KM = 40;
/** hours around each session that get a frame, so movement is visible */
export const FRAME_OFFSETS_H = [-3, 0, 3];

export interface GridCell { dx: number; dy: number; points: ForecastPoint[] }

export interface MapFrame {
  /** hours from the session start */
  offsetH: number;
  at: string;
  /** rain in millimetres per cell, row-major from north-west; null where the forecast is silent */
  rainMm: Array<number | null>;
  /** wind at the centre cell */
  windFromDeg: number | null;
  windKph: number | null;
}

export interface SessionMap { key: string; label: string; at: string; frames: MapFrame[] }

export interface WeatherMap {
  center: Place;
  radius: number;
  spacingKm: number;
  sessions: SessionMap[];
}

/** Offsets of a (2r+1)² grid, row-major from the north-west corner. */
export function gridOffsets(radius = GRID_RADIUS): Array<{ dx: number; dy: number }> {
  const out: Array<{ dx: number; dy: number }> = [];
  for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) out.push({ dx, dy });
  return out;
}

/** The place for a grid offset: dy is north-positive, dx east-positive, in km on a flat local frame. */
export function offsetPlace(center: Place, dx: number, dy: number, spacingKm = GRID_SPACING_KM): Place {
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos((center.lat * Math.PI) / 180);
  return {
    lat: Math.round((center.lat + (dy * spacingKm) / kmPerDegLat) * 1000) / 1000,
    lon: Math.round((center.lon + (dx * spacingKm) / kmPerDegLon) * 1000) / 1000,
  };
}

/** Frames for one session from the fetched grid. A frame with nothing in any cell is left out. */
export function sessionFrames(at: Date, cells: GridCell[], radius = GRID_RADIUS): MapFrame[] {
  const centerIndex = (2 * radius + 1) * radius + radius;
  const frames: MapFrame[] = [];
  for (const offsetH of FRAME_OFFSETS_H) {
    const when = new Date(at.getTime() + offsetH * 3600000);
    const rainMm = cells.map((c) => pointFor(c.points, when)?.precipitationMm ?? null);
    if (rainMm.every((v) => v === null)) continue;
    const centre = pointFor(cells[centerIndex]?.points ?? [], when);
    frames.push({
      offsetH,
      at: when.toISOString(),
      rainMm: rainMm.map((v) => (v === null ? null : Math.round(v * 10) / 10)),
      windFromDeg: centre?.windFromDeg ?? null,
      windKph: centre?.windMs === null || centre?.windMs === undefined ? null : Math.round(centre.windMs * 3.6),
    });
  }
  return frames;
}

export function buildWeatherMap(center: Place, sessions: Array<{ key: string; label: string; at: Date }>, cells: GridCell[], now: Date, horizonH = 9 * 24): WeatherMap | null {
  const limit = now.getTime() + horizonH * 3600000;
  const out: SessionMap[] = [];
  for (const s of sessions) {
    if (s.at.getTime() > limit) continue;
    const frames = sessionFrames(s.at, cells);
    if (frames.length) out.push({ key: s.key, label: s.label, at: s.at.toISOString(), frames });
  }
  return out.length ? { center, radius: GRID_RADIUS, spacingKm: GRID_SPACING_KM, sessions: out } : null;
}

/**
 * Fetch the grid for a circuit. Any cell that fails is silent rather than fatal: the map draws
 * what it has and a missing cell is drawn as unknown.
 */
export async function fetchGrid(circuitId: string, fetchImpl: typeof fetch = fetch): Promise<{ center: Place; cells: GridCell[] } | null> {
  const center = placeOf(circuitId);
  if (!center) return null;
  const cells: GridCell[] = [];
  for (const { dx, dy } of gridOffsets()) {
    const place = offsetPlace(center, dx, dy);
    let points: ForecastPoint[] = [];
    try {
      const res = await fetchImpl(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${place.lat}&lon=${place.lon}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
      if (res.ok) points = readForecast(await res.json());
      else console.warn(`[pw] weather map: MET Norway returned ${res.status} for cell ${dx},${dy}`);
    } catch (err) {
      console.warn(`[pw] weather map: cell ${dx},${dy} unavailable:`, err instanceof Error ? err.message : err);
    }
    cells.push({ dx, dy, points });
  }
  return { center, cells };
}
