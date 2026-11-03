/**
 * The weekly model a Moonshot is priced from (F-106).
 *
 * Ben and the owner publish a MODELS document each week; the seeder parses its
 * Race O/U table and writes `moonshotModels/{raceId}` with every driver's
 * finishing-position distribution. When a race has no document of its own, the
 * most recent earlier round's model is used and the quote says so (`carriedFrom`).
 * A snapshot taken at quote time is what the Moonshot keeps; later models do not
 * reprice a call.
 */
import * as admin from 'firebase-admin';
import { distribute, zoneSigma, type DistributedDriver } from './distribution';

export interface MoonshotModel {
  raceId: string;
  season: string;
  round: number;
  /** e.g. ben_model_R19; the document the numbers came from */
  source: string;
  modelVersion: string;
  drivers: Record<string, DistributedDriver>;
  positionsCount: number;
  /**
   * F-137: seats the document models under a stand-in's name, keyed by the game's driver id
   * (`{ ocon: 'hirakawa' }`: the row Ben wrote for Hirakawa prices the seat the game calls Ocon).
   * Settlement already follows the car (F-110), so the model follows it too.
   */
  seats?: Record<string, string>;
  createdAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
}

/** The model to price `round` from: its own, else the latest earlier round's (carried forward). */
export interface ResolvedModel { model: MoonshotModel; carriedFrom: string | null }

/** Pure: pick from a list of models the one for this race, else the latest earlier round. */
export function pickModel(models: MoonshotModel[], raceId: string, round: number, carryForward: boolean): ResolvedModel | null {
  const own = models.find((m) => m.raceId === raceId);
  if (own) return { model: own, carriedFrom: null };
  if (!carryForward) return null;
  const earlier = models.filter((m) => m.round < round).sort((a, b) => b.round - a.round)[0];
  return earlier ? { model: earlier, carriedFrom: earlier.raceId } : null;
}

export async function resolveModel(db: admin.firestore.Firestore, season: string, raceId: string, round: number, carryForward: boolean): Promise<ResolvedModel | null> {
  const own = await db.doc(`moonshotModels/${raceId}`).get();
  if (own.exists) return { model: own.data() as MoonshotModel, carriedFrom: null };
  if (!carryForward) return null;
  const snap = await db.collection('moonshotModels').where('season', '==', season).where('round', '<', round).orderBy('round', 'desc').limit(1).get();
  if (snap.empty) return null;
  const m = snap.docs[0].data() as MoonshotModel;
  return { model: m, carriedFrom: m.raceId };
}

/** One row of the document's Race O/U table: | Rk | Driver | Pred | O/U Line | Under % | Under $ | Over % | Over $ | Upper | Lower | */
export interface RaceRow { driverId: string; predicted: number }

/** Parse the markdown table that follows the "Race O/U Table" heading into driver predictions. */
export function parseRaceTable(markdown: string): RaceRow[] {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => /^## Race O\/U Table/.test(l));
  if (start < 0) throw new Error('Race O/U Table section not found');
  const rows: RaceRow[] = [];
  let inTable = false;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('|')) {
      inTable = true;
      const cells = l.split('|').map((c) => c.replace(/\*/g, '').trim()).filter((c) => c.length);
      if (/^-|^:|^Rk$/i.test(cells[0])) continue;
      const driverId = cells[1]?.toLowerCase();
      const predicted = parseFloat(cells[2]);
      if (driverId && /^[a-z_]+$/.test(driverId) && Number.isFinite(predicted)) rows.push({ driverId, predicted });
    } else if (inTable) break;
  }
  if (rows.length < 10) throw new Error(`Race O/U Table has only ${rows.length} driver rows`);
  return rows;
}

/**
 * F-137: which team each driver in the document drives for, from the "Constructor predictions"
 * table (`| rank | team | driver + driver | …`). Empty when the document has no such table.
 */
export function parseConstructorTable(markdown: string): Record<string, string> {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => /^#{2,3} Constructor predictions/.test(l));
  const teams: Record<string, string> = {};
  if (start < 0) return teams;
  let inTable = false;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('|')) {
      inTable = true;
      const cells = l.split('|').map((c) => c.replace(/\*/g, '').trim()).filter((c) => c.length);
      if (/^-|^:|^Rank$/i.test(cells[0])) continue;
      const team = cells[1]?.toLowerCase();
      if (!team || !/^[a-z_]+$/.test(team)) continue;
      for (const d of (cells[2] ?? '').toLowerCase().split('+').map((s) => s.trim())) if (/^[a-z_]+$/.test(d)) teams[d] = team;
    } else if (inTable) break;
  }
  return teams;
}

/**
 * F-137: driver → constructorId from a scored race's classification (`races/{id}.results.raceResults`).
 * The game's own record of who drove which car last time out; a stand-in the document names but
 * the constructor table does not place (it lists only the top teams) is placed by this.
 */
export function teamsFromResults(rows: ReadonlyArray<{ driverId?: unknown; constructorId?: unknown }> | null | undefined): Record<string, string> {
  const teams: Record<string, string> = {};
  for (const r of rows ?? []) if (typeof r.driverId === 'string' && typeof r.constructorId === 'string' && r.constructorId) teams[r.driverId] = r.constructorId;
  return teams;
}

/**
 * F-137: a stand-in the game has no record of, driving a seat whose regular driver is missing
 * from the document, is modelled as that seat. Pure: `standInTeams` places the document's
 * drivers by team (the constructor table, and the last scored race's classification); `gameTeams`
 * is the game's driver → constructorId, active drivers only (a retired driver's document left on
 * the same team must not make the seat ambiguous). A stand-in whose team has no single missing
 * regular is left unknown, so the seeder still refuses rather than guess.
 */
export function seatAliases(unknown: string[], missing: string[], standInTeams: Record<string, string>, gameTeams: Record<string, string | null | undefined>): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const standIn of unknown) {
    const team = standInTeams[standIn];
    if (!team) continue;
    const seats = missing.filter((id) => gameTeams[id] === team && !Object.values(aliases).includes(id));
    if (seats.length === 1) aliases[standIn] = seats[0];
  }
  return aliases;
}

/**
 * Build the model document from parsed rows. `knownDrivers` (the game's driver ids) catches a
 * renamed or missing driver early; `aliases` (table id → game id, from `seatAliases`) re-keys a
 * stand-in's row onto the seat before anything is checked, and the model records the seat.
 */
export function buildModel(rows: RaceRow[], meta: { raceId: string; season: string; round: number; source: string; modelVersion: string }, knownDrivers?: Set<string>, aliases: Record<string, string> = {}): { model: MoonshotModel; unknown: string[]; missing: string[] } {
  // an alias onto a seat the table also names would merge two rows into one and break the column sums
  for (const [standIn, seat] of Object.entries(aliases)) if (rows.some((r) => r.driverId === seat)) throw new Error(`seat ${seat} is in the table as well as aliased from ${standIn}`);
  const seated = rows.map((r) => (aliases[r.driverId] ? { ...r, driverId: aliases[r.driverId] } : r));
  const unknown = knownDrivers ? seated.map((r) => r.driverId).filter((id) => !knownDrivers.has(id)) : [];
  const missing = knownDrivers ? [...knownDrivers].filter((id) => !seated.some((r) => r.driverId === id)) : [];
  const base: Record<string, { predicted: number; sigma: number }> = {};
  for (const r of seated) base[r.driverId] = { predicted: r.predicted, sigma: zoneSigma(r.predicted) };
  const drivers = distribute(base);
  const seats = Object.fromEntries(Object.entries(aliases).map(([standIn, seat]) => [seat, standIn]));
  return { model: { ...meta, drivers, positionsCount: seated.length, ...(Object.keys(seats).length ? { seats } : {}) }, unknown, missing };
}
