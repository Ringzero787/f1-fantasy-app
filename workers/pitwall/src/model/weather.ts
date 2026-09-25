/**
 * Session weather for the round being run (F-070).
 *
 * The tile this replaces showed three fixed rain percentages as though they were a forecast. This
 * one asks MET Norway, whose Locationforecast API is free to use, including commercially, provided
 * the data is credited and the client identifies itself. Both are done: every response carries the
 * attribution the portal prints, and the request sends a User-Agent naming the app and a contact
 * address, which their terms require and which they block callers for omitting.
 *
 * https://api.met.no/weatherapi/locationforecast/2.0/documentation
 *
 * The mapping from a forecast to our sessions is pure and tested; only `fetchForecast` touches the
 * network. A forecast that does not reach far enough, or a circuit with no coordinates, yields no
 * weather rather than a guess.
 */
import { placeOf } from './circuits';

export const MET_ATTRIBUTION = 'Forecast from MET Norway';
/** Their terms require a real identifier and contact; an anonymous caller is refused. */
export const USER_AGENT = 'UndercutPitWall/1.0 (https://pitwall.humannpc.com; support@humannpc.com)';
/** Beyond this the forecast is too coarse to put a number on a session. */
export const HORIZON_HOURS = 9 * 24;

export interface SessionTime { key: string; label: string; at: Date }

export interface SessionWeather {
  key: string;
  label: string;
  at: string;
  /** air temperature at the session, degrees Celsius */
  tempC: number | null;
  /** rain expected in the hour of the session, millimetres. The compact forecast measures an
   *  amount, not a chance, so an amount is what is shown. */
  rainMm: number | null;
  /** the forecast's own word for the hour: "clear", "cloudy", "light rain" */
  sky: string | null;
  /** wind in kilometres per hour */
  windKph: number | null;
}

/** The shape we use out of the Locationforecast response. */
export interface ForecastPoint {
  time: string;
  airTemperature: number | null;
  precipitationMm: number | null;
  symbol: string | null;
  windMs: number | null;
  /** direction the wind comes from, degrees clockwise from north */
  windFromDeg: number | null;
}

/** Pull the fields we need out of a Locationforecast body, ignoring everything else. */
export function readForecast(body: unknown): ForecastPoint[] {
  const series = (body as { properties?: { timeseries?: unknown } } | null)?.properties?.timeseries;
  if (!Array.isArray(series)) return [];
  const out: ForecastPoint[] = [];
  for (const entry of series) {
    const e = entry as Record<string, any>;
    if (typeof e?.time !== 'string') continue;
    const instant = e.data?.instant?.details ?? {};
    // The next-hour block is there for the near days and the next-six-hour block further out.
    const near = e.data?.next_1_hours ?? e.data?.next_6_hours ?? {};
    const amount = near?.details?.precipitation_amount;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    out.push({
      time: e.time,
      airTemperature: num(instant.air_temperature),
      precipitationMm: num(amount),
      symbol: typeof near?.summary?.symbol_code === 'string' ? near.summary.symbol_code : null,
      windMs: num(instant.wind_speed),
      windFromDeg: num(instant.wind_from_direction),
    });
  }
  return out;
}

/**
 * The forecast point covering a session: the latest one at or before it, so the hour the session
 * starts in rather than the hour after. Nothing within an hour on either side means no answer.
 */
export function pointFor(points: ForecastPoint[], at: Date): ForecastPoint | null {
  const target = at.getTime();
  let best: ForecastPoint | null = null;
  let bestGap = Infinity;
  for (const p of points) {
    const t = Date.parse(p.time);
    if (!Number.isFinite(t)) continue;
    const gap = Math.abs(t - target);
    if (gap < bestGap) { best = p; bestGap = gap; }
  }
  return best && bestGap <= 90 * 60 * 1000 ? best : null;
}

/** The forecast's own symbol as a short phrase: "clearsky_day" reads as "clear". */
export function skyPhrase(symbol: string | null): string | null {
  if (!symbol) return null;
  const base = symbol.replace(/_(day|night|polartwilight)$/, '');
  const WORDS: Record<string, string> = {
    clearsky: 'clear', fair: 'fair', partlycloudy: 'part cloud', cloudy: 'cloudy', fog: 'fog',
    lightrain: 'light rain', rain: 'rain', heavyrain: 'heavy rain', lightrainshowers: 'light showers',
    rainshowers: 'showers', heavyrainshowers: 'heavy showers', sleet: 'sleet', snow: 'snow',
  };
  return WORDS[base] ?? base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
}

/** Map sessions onto a forecast. A session with nothing to say is left out entirely. */
export function sessionWeather(sessions: SessionTime[], points: ForecastPoint[], now: Date): SessionWeather[] {
  const limit = now.getTime() + HORIZON_HOURS * 3600 * 1000;
  const out: SessionWeather[] = [];
  for (const s of sessions) {
    if (!(s.at instanceof Date) || Number.isNaN(s.at.getTime()) || s.at.getTime() > limit) continue;
    const p = pointFor(points, s.at);
    if (!p || (p.airTemperature === null && p.precipitationMm === null)) continue;
    out.push({
      key: s.key,
      label: s.label,
      at: s.at.toISOString(),
      tempC: p.airTemperature === null ? null : Math.round(p.airTemperature),
      rainMm: p.precipitationMm === null ? null : Math.round(p.precipitationMm * 10) / 10,
      sky: skyPhrase(p.symbol),
      windKph: p.windMs === null ? null : Math.round(p.windMs * 3.6),
    });
  }
  return out;
}

/**
 * Ask MET Norway for a circuit's forecast. Any failure is no weather, never a guess: this is a
 * decoration on a page that has to keep working without it.
 */
export async function fetchForecast(circuitId: string, fetchImpl: typeof fetch = fetch): Promise<ForecastPoint[]> {
  const place = placeOf(circuitId);
  if (!place) return [];
  try {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${place.lat}&lon=${place.lon}`;
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`[pw] weather: MET Norway returned ${res.status} for ${circuitId}`);
      return [];
    }
    return readForecast(await res.json());
  } catch (err) {
    console.warn('[pw] weather: forecast unavailable:', err instanceof Error ? err.message : err);
    return [];
  }
}
