/**
 * What a payload actually carries (F-070). The worker publishes the projection fields first and
 * the rest later, so a page must be able to tell "this driver scores zero" from "nobody has
 * published this yet". Rendering an unpublished field as a number invents analysis: a fit of 3 for
 * every driver reads as a considered judgement, a leverage column built from a zero ownership is
 * really just the row index, and a zero pace gap puts every car on pole.
 *
 * The example payload fills every field, so every flag is true there and nothing changes in the
 * design preview.
 *
 * Each check errs towards "not published". A wrong false hides a frame that had data; a wrong true
 * presents a placeholder as a measurement. The first is a gap, the second is a lie, so the tests
 * below pin the cases that matter and the bias goes one way on purpose.
 */
import type { Payload } from './types';

export interface Coverage {
  /** qualifying and race pace gaps (q, r) */
  timing: boolean;
  /** share of league lineups holding each driver */
  ownership: boolean;
  /** circuit fit per upcoming round, as something better than a flat neutral */
  fit: boolean;
  /** tagged stories */
  news: boolean;
  /** rival lineups and likely moves */
  rivals: boolean;
  /** the viewer's league context */
  league: boolean;
  /** per-round points history */
  form: boolean;
  /** the price model: points to rise or hold, and the chances of each */
  priceModel: boolean;
  /** a session forecast for this round */
  weather: boolean;
  /** the forecast grid around the circuit */
  weatherMap: boolean;
  /** frames that still have no published source at all and only exist in the example set */
  mock: boolean;
}

export const FULL_COVERAGE: Coverage = { timing: true, ownership: true, fit: true, news: true, rivals: true, league: true, form: true, priceModel: true, weather: true, weatherMap: true, mock: true };

export function coverage(p: Payload): Coverage {
  const fitValues = new Set<number>();
  for (const d of p.drivers) for (const f of d.fit) fitValues.add(f);
  return {
    timing: p.drivers.some((d) => d.q !== 0 || d.r !== 0),
    ownership: p.drivers.some((d) => d.own > 0),
    fit: fitValues.size > 1,
    news: p.news.length > 0,
    rivals: p.rivals.length > 0,
    league: p.league.size > 0 && p.league.name !== '',
    form: p.drivers.some((d) => d.form.length > 0),
    priceModel: p.drivers.some((d) => d.ptsRise > 0),
    weather: p.weather.length > 0,
    weatherMap: p.weatherMap !== null && p.weatherMap.sessions.length > 0,
    // Circuit characteristics, the title simulation, power unit use and price history have no
    // published source yet (F-072 and the pipeline work behind it). They are drawn from the row
    // order in the example set, which is fine for a demo and a lie against real data.
    mock: p.example,
  };
}

/** One line of copy for a frame that has no data to show yet, so a blank tile never reads as a fault. */
export const NOT_PUBLISHED: Record<keyof Coverage, string> = {
  timing: 'Session timing has not been published for this round yet.',
  ownership: 'League ownership is not published yet.',
  fit: 'Circuit fit is not published yet.',
  news: 'No headlines from the official feeds in the last week.',
  rivals: 'Rival lineups are not published yet.',
  league: 'No league context for this team yet.',
  form: 'No scored rounds yet this season.',
  priceModel: 'The price model is not published yet.',
  weather: 'No session forecast for this round yet.',
  weatherMap: 'No forecast map for this round yet.',
  mock: 'Not published yet.',
};
