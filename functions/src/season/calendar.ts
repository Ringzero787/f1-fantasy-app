/**
 * F-150: a season's race documents, built from the OpenF1 calendar.
 *
 * OpenF1 gives the meetings, their names and every session time; this table gives what the app
 * shows that OpenF1 does not (our race id, circuit id and name, city, timezone). Keyed by OpenF1's
 * `circuit_short_name`. The ids keep the 2026 slugs so a circuit's races line up across seasons
 * (australia_2026 → australia_2027). Bahrain returns to Sakhir in 2027 (it ran at Sepang in 2026),
 * and Portugal and Turkey are new, so those three are written out here rather than copied.
 *
 * A meeting whose circuit is missing from the table stops the build: a race document with a guessed
 * id or no city is worse than a rollover that refuses and names what to add.
 */
import type { OpenF1Session } from '../ingestion/openf1Client';

export interface CircuitMeta {
  slug: string;
  circuitId: string;
  circuitName: string;
  country: string;
  city: string;
  timezone: string;
}

export const CIRCUITS: Record<string, CircuitMeta> = {
  'Sakhir': { slug: 'bahrain', circuitId: 'bahrain', circuitName: 'Bahrain International Circuit', country: 'Bahrain', city: 'Sakhir', timezone: 'Asia/Bahrain' },
  'Jeddah': { slug: 'saudi', circuitId: 'jeddah', circuitName: 'Jeddah Corniche Circuit', country: 'Saudi Arabia', city: 'Jeddah', timezone: 'Asia/Riyadh' },
  'Melbourne': { slug: 'australia', circuitId: 'albert_park', circuitName: 'Albert Park Circuit', country: 'Australia', city: 'Melbourne', timezone: 'Australia/Melbourne' },
  'Suzuka': { slug: 'japan', circuitId: 'suzuka', circuitName: 'Suzuka International Racing Course', country: 'Japan', city: 'Suzuka', timezone: 'Asia/Tokyo' },
  'Shanghai': { slug: 'china', circuitId: 'shanghai', circuitName: 'Shanghai International Circuit', country: 'China', city: 'Shanghai', timezone: 'Asia/Shanghai' },
  'Miami': { slug: 'miami', circuitId: 'miami', circuitName: 'Miami International Autodrome', country: 'United States', city: 'Miami', timezone: 'America/New_York' },
  'Montreal': { slug: 'canada', circuitId: 'montreal', circuitName: 'Circuit Gilles Villeneuve', country: 'Canada', city: 'Montreal', timezone: 'America/Toronto' },
  'Monte Carlo': { slug: 'monaco', circuitId: 'monaco', circuitName: 'Circuit de Monaco', country: 'Monaco', city: 'Monte Carlo', timezone: 'Europe/Monaco' },
  'Algarve International Circuit': { slug: 'portugal', circuitId: 'portimao', circuitName: 'Algarve International Circuit', country: 'Portugal', city: 'Portimao', timezone: 'Europe/Lisbon' },
  'Catalunya': { slug: 'spain', circuitId: 'barcelona', circuitName: 'Circuit de Barcelona-Catalunya', country: 'Spain', city: 'Barcelona', timezone: 'Europe/Madrid' },
  'Silverstone': { slug: 'britain', circuitId: 'silverstone', circuitName: 'Silverstone Circuit', country: 'United Kingdom', city: 'Silverstone', timezone: 'Europe/London' },
  'Spielberg': { slug: 'austria', circuitId: 'red_bull_ring', circuitName: 'Red Bull Ring', country: 'Austria', city: 'Spielberg', timezone: 'Europe/Vienna' },
  'Spa-Francorchamps': { slug: 'belgium', circuitId: 'spa', circuitName: 'Circuit de Spa-Francorchamps', country: 'Belgium', city: 'Spa', timezone: 'Europe/Brussels' },
  'Hungaroring': { slug: 'hungary', circuitId: 'hungaroring', circuitName: 'Hungaroring', country: 'Hungary', city: 'Budapest', timezone: 'Europe/Budapest' },
  'Zandvoort': { slug: 'netherlands', circuitId: 'zandvoort', circuitName: 'Circuit Zandvoort', country: 'Netherlands', city: 'Zandvoort', timezone: 'Europe/Amsterdam' },
  'Monza': { slug: 'italy', circuitId: 'monza', circuitName: 'Autodromo Nazionale Monza', country: 'Italy', city: 'Monza', timezone: 'Europe/Rome' },
  'Madring': { slug: 'madrid', circuitId: 'madrid', circuitName: 'Circuito de Madrid', country: 'Spain', city: 'Madrid', timezone: 'Europe/Madrid' },
  'Baku': { slug: 'azerbaijan', circuitId: 'baku', circuitName: 'Baku City Circuit', country: 'Azerbaijan', city: 'Baku', timezone: 'Asia/Baku' },
  'Istanbul': { slug: 'turkey', circuitId: 'istanbul', circuitName: 'Istanbul Park', country: 'Turkey', city: 'Istanbul', timezone: 'Europe/Istanbul' },
  'Singapore': { slug: 'singapore', circuitId: 'marina_bay', circuitName: 'Marina Bay Street Circuit', country: 'Singapore', city: 'Singapore', timezone: 'Asia/Singapore' },
  'Austin': { slug: 'usa', circuitId: 'cota', circuitName: 'Circuit of the Americas', country: 'United States', city: 'Austin', timezone: 'America/Chicago' },
  'Mexico City': { slug: 'mexico', circuitId: 'hermanos_rodriguez', circuitName: 'Autodromo Hermanos Rodriguez', country: 'Mexico', city: 'Mexico City', timezone: 'America/Mexico_City' },
  'Interlagos': { slug: 'brazil', circuitId: 'interlagos', circuitName: 'Autodromo Jose Carlos Pace', country: 'Brazil', city: 'Sao Paulo', timezone: 'America/Sao_Paulo' },
  'Las Vegas': { slug: 'las_vegas', circuitId: 'las_vegas', circuitName: 'Las Vegas Strip Circuit', country: 'United States', city: 'Las Vegas', timezone: 'America/Los_Angeles' },
  'Lusail': { slug: 'qatar', circuitId: 'lusail', circuitName: 'Lusail International Circuit', country: 'Qatar', city: 'Lusail', timezone: 'Asia/Qatar' },
  'Yas Marina Circuit': { slug: 'abu_dhabi', circuitId: 'yas_marina', circuitName: 'Yas Marina Circuit', country: 'United Arab Emirates', city: 'Abu Dhabi', timezone: 'Asia/Dubai' },
};

/** OpenF1 session name → the key under a race document's `schedule` (the schedule sync uses the same map). */
const SCHEDULE_KEY: Record<string, string> = {
  'Practice 1': 'fp1',
  'Practice 2': 'fp2',
  'Practice 3': 'fp3',
  'Sprint Qualifying': 'sprintQualifying',
  'Sprint': 'sprint',
  'Qualifying': 'qualifying',
  'Race': 'race',
};

/** The subset of an OpenF1 meeting the calendar reads. */
export interface OpenF1Meeting {
  meeting_key: number;
  meeting_name: string;
  circuit_short_name: string;
  year: number;
  is_cancelled?: boolean;
}

/** A race document as the seeder writes it; `schedule` values are ISO strings, turned into Timestamps by the writer. */
export interface RaceSeed extends Omit<CircuitMeta, 'slug'> {
  id: string;
  seasonId: string;
  round: number;
  name: string;
  status: 'upcoming';
  hasSprint: boolean;
  schedule: Record<string, string>;
}

/**
 * The season's race documents: one per meeting with a Race that is not cancelled, numbered 1..n by
 * race start. Throws on a circuit missing from CIRCUITS, a duplicate id, or a meeting from another
 * season, so a bad calendar never reaches the writer.
 */
export function buildCalendar(season: number, meetings: ReadonlyArray<OpenF1Meeting>, sessions: ReadonlyArray<OpenF1Session>): RaceSeed[] {
  const out: Array<RaceSeed & { raceAt: string }> = [];
  for (const m of meetings) {
    if (m.year !== season) throw new Error(`meeting ${m.meeting_key} (${m.meeting_name}) is from ${m.year}, not ${season}`);
    if (m.is_cancelled === true) continue;
    const own = sessions.filter((s) => s.meeting_key === m.meeting_key && s.is_cancelled !== true);
    const race = own.find((s) => s.session_name === 'Race');
    if (!race) continue; // pre-season testing: no Race
    const meta = CIRCUITS[m.circuit_short_name];
    if (!meta) throw new Error(`no CIRCUITS entry for "${m.circuit_short_name}" (${m.meeting_name}) — add its slug, circuit, city and timezone`);
    const schedule: Record<string, string> = {};
    for (const s of own) {
      const key = SCHEDULE_KEY[s.session_name];
      if (key && s.date_start) schedule[key] = new Date(s.date_start).toISOString();
    }
    const { slug, ...rest } = meta;
    out.push({
      id: `${slug}_${season}`,
      seasonId: String(season),
      round: 0,
      name: m.meeting_name,
      status: 'upcoming',
      hasSprint: own.some((s) => s.session_name === 'Sprint'),
      schedule,
      ...rest,
      raceAt: schedule.race,
    });
  }
  out.sort((a, b) => a.raceAt.localeCompare(b.raceAt));
  const ids = new Set<string>();
  return out.map(({ raceAt: _raceAt, ...r }, i) => {
    if (ids.has(r.id)) throw new Error(`two ${season} meetings map to ${r.id}`);
    ids.add(r.id);
    return { ...r, round: i + 1 };
  });
}
