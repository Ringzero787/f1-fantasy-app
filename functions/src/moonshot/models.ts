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

/** Build the model document from parsed rows. `knownDrivers` (the game's driver ids) catches a renamed or missing driver early. */
export function buildModel(rows: RaceRow[], meta: { raceId: string; season: string; round: number; source: string; modelVersion: string }, knownDrivers?: Set<string>): { model: MoonshotModel; unknown: string[]; missing: string[] } {
  const unknown = knownDrivers ? rows.map((r) => r.driverId).filter((id) => !knownDrivers.has(id)) : [];
  const missing = knownDrivers ? [...knownDrivers].filter((id) => !rows.some((r) => r.driverId === id)) : [];
  const base: Record<string, { predicted: number; sigma: number }> = {};
  for (const r of rows) base[r.driverId] = { predicted: r.predicted, sigma: zoneSigma(r.predicted) };
  const drivers = distribute(base);
  return { model: { ...meta, drivers, positionsCount: rows.length }, unknown, missing };
}
