/**
 * F-152: a car number the driver table does not know is resolved from the provider's own entry list
 * instead of holding the race.
 *
 * Both 2026 holds were a number the table did not know: Mexico City (car 50, Hirakawa standing in
 * for Ocon) and São Paulo (car 51, Câmara, whom F-138 had put in car 50). Each sat unscored until a
 * code change was deployed and the race re-queued by hand; São Paulo for three days. The session's
 * driver record names who was in the car, so:
 *
 *  - a driver we already have (`drivers/{id}`) whose three-letter code AND surname both match the
 *    record is credited under that id — São Paulo would have scored Câmara on time;
 *  - a name that matches nobody is a stand-in, credited under an id made from his surname with no
 *    `drivers/` doc, so nobody can buy him (as Tsunoda at Zandvoort and Hirakawa at Mexico) and his
 *    result still reaches his constructor's total — Mexico would have scored on time.
 *
 * Anything that could credit the wrong driver is refused and the race is held as before: a code
 * that matches a driver whose surname does not (or the reverse), two drivers sharing a code or a
 * surname, a stand-in id that is already somebody's, or two cars resolving to one id. Every
 * resolution is reported as a warning carrying `RESOLVED_BY_NAME_PREFIX`, so the result shows how
 * the grid was built and the ops check can say the table needs the number.
 */
import { DRIVER_NUMBER_TO_ID, TEAM_NAME_TO_ID, driverIdFor } from './config';

/** A `drivers/{id}` document, as far as resolution needs it. */
export interface KnownDriver { id: string; name?: unknown; shortName?: unknown }

/** The part of a provider driver record resolution reads. */
export interface EntryRow {
  driver_number?: unknown;
  name_acronym?: unknown;
  full_name?: unknown;
  last_name?: unknown;
}

export const RESOLVED_BY_NAME_PREFIX = 'Resolved by name';

/**
 * Ids a stand-in may never take: a constructor's (a surname like Haas or Williams), and the names an
 * ordinary object already answers to (`constructor`, `valueof`…), which a lookup keyed by driver id
 * would read as a function.
 */
const RESERVED_IDS = new Set<string>([
  ...Object.values(TEAM_NAME_TO_ID),
  ...Object.getOwnPropertyNames(Object.prototype).map(nameKey),
]);

/** Letters only, accents dropped, lower case: 'Câmara' → 'camara', 'HÜLKENBERG' → 'hulkenberg'. */
export function nameKey(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

/** The surname of a provider record: its `last_name`, else the last word of `full_name`. */
function surnameOf(row: EntryRow): string {
  const last = nameKey(row.last_name);
  if (last) return last;
  const words = typeof row.full_name === 'string' ? row.full_name.trim().split(/\s+/) : [];
  return words.length ? nameKey(words[words.length - 1]) : '';
}

/** The surname of a `drivers/` doc ('Andrea Kimi Antonelli' → 'antonelli'). */
function docSurname(d: KnownDriver): string {
  const words = typeof d.name === 'string' ? d.name.trim().split(/\s+/) : [];
  return words.length ? nameKey(words[words.length - 1]) : '';
}

const code = (v: unknown): string => (typeof v === 'string' ? v.trim().toUpperCase() : '');

/**
 * Pure. Car number → driver id for every car of one session's entry list that the table does not
 * know and its record names safely; see the module comment for what is refused. `warnings` gets
 * one line per car resolved (prefixed `RESOLVED_BY_NAME_PREFIX`) and one per car refused.
 */
export function resolveUnknownCars(
  entries: ReadonlyArray<EntryRow>,
  roster: ReadonlyArray<KnownDriver>,
  warnings: string[],
): Record<number, string> {
  const tableIds = new Set(Object.values(DRIVER_NUMBER_TO_ID));
  const rosterIds = new Set(roster.map((d) => d.id));

  // ids the table already gives a car in this session: a resolved car must not take one of them
  const taken = new Set<string>();
  const unknown: Array<{ n: number; row: EntryRow }> = [];
  const seen = new Set<number>();
  for (const row of entries) {
    const n = row.driver_number;
    if (!Number.isInteger(n) || seen.has(n as number)) continue;
    seen.add(n as number);
    const id = driverIdFor(n, row.name_acronym);
    if (id) taken.add(id);
    else unknown.push({ n: n as number, row });
  }

  const proposed = new Map<number, { id: string; how: string }>();
  for (const { n, row } of unknown) {
    const acr = code(row.name_acronym);
    const surname = surnameOf(row);
    const label = `${acr || '?'} ${typeof row.full_name === 'string' ? row.full_name : surname || '?'}`.trim();
    if (!acr || !surname) {
      warnings.push(`Car ${n} is not in the driver table and its entry record does not name the driver; not resolved`);
      continue;
    }
    const byCode = roster.filter((d) => code(d.shortName) === acr);
    const byName = roster.filter((d) => docSurname(d) === surname);
    const both = byCode.filter((d) => docSurname(d) === surname);
    if (both.length === 1 && byCode.length === 1 && byName.length === 1) {
      proposed.set(n, { id: both[0].id, how: `drivers/${both[0].id} by code and surname` });
      continue;
    }
    if (byCode.length > 0 || byName.length > 0) {
      const who = [...new Set([...byCode, ...byName].map((d) => d.id))].join(', ');
      warnings.push(`Car ${n} is not in the driver table; its entry names ${label}, which only partly matches ${who}; not resolved`);
      continue;
    }
    // nobody we know: a stand-in under his surname, with no drivers/ doc. An id the table already
    // gives a stand-in (no doc either) is the same driver back in another car.
    if (rosterIds.has(surname) || RESERVED_IDS.has(surname)) {
      warnings.push(`Car ${n} is not in the driver table; its entry names ${label}, but the id ${surname} is already ${rosterIds.has(surname) ? 'another driver\'s' : 'reserved (a constructor or a built-in name)'}; not resolved`);
      continue;
    }
    proposed.set(n, { id: surname, how: tableIds.has(surname) ? 'the stand-in id the table already uses (no drivers/ doc)' : 'a stand-in with no drivers/ doc (cannot be bought)' });
  }

  // two cars to one id, or a car to an id the table already seats in this session: refuse them all
  const count = new Map<string, number>();
  for (const { id } of proposed.values()) count.set(id, (count.get(id) ?? 0) + 1);
  const out: Record<number, string> = {};
  for (const [n, { id, how }] of proposed) {
    if ((count.get(id) ?? 0) > 1 || taken.has(id)) {
      warnings.push(`Car ${n} resolves to ${id}, who is in another car of this session; not resolved`);
      continue;
    }
    out[n] = id;
    warnings.push(`${RESOLVED_BY_NAME_PREFIX}: car ${n} is not in the driver table; credited to ${id}, ${how}. Add it to DRIVER_NUMBER_TO_ID`);
  }
  return out;
}

/** The `drivers` collection, as resolution reads it. */
export async function loadRoster(db: { collection: (name: string) => { get: () => Promise<{ docs: Array<{ id: string; data: () => Record<string, unknown> }> }> } }): Promise<KnownDriver[]> {
  const snap = await db.collection('drivers').get();
  return snap.docs.map((d) => ({ id: d.id, name: d.data().name, shortName: d.data().shortName }));
}
