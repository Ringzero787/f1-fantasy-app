/**
 * Reads for hindsight (F-073): the team's race snapshots (owner-readable), everyone's scores for
 * those races, and the prices that weekend. Last five rounds with a snapshot; snapshots began at
 * round 17 of 2026, so the list grows from there. Any failure is an empty list, never an error in
 * the reader's face.
 */
import { firestore } from './firebase';
import { hindsightRow, type HindsightRow, type Snapshot } from '../data/hindsight';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export async function loadHindsight(teamId: string, limit = 5): Promise<HindsightRow[]> {
  try {
    const { m, db } = await firestore();
    const snaps = await m.getDocs(m.collection(db, 'fantasyTeams', teamId, 'raceSnapshots'));
    const snapshots: Snapshot[] = snaps.docs.map((d) => {
      const x = d.data() as Record<string, any>;
      const phases = (x.phases ?? {}) as Record<string, { points?: number }>;
      const roster = (x.roster ?? {}) as Record<string, any>;
      return {
        raceId: String(x.raceId ?? d.id), round: num(x.round),
        points: Object.values(phases).reduce((a, p) => a + num(p?.points), 0),
        roster: {
          drivers: (Array.isArray(roster.drivers) ? roster.drivers : []).map((r: Record<string, unknown>) => ({ driverId: String(r.driverId ?? ''), currentPrice: num(r.currentPrice) })),
          // read as a data field: TypeScript reads `.constructor` as the object's class
          constructor: (() => { const c = Object.getOwnPropertyDescriptor(roster, 'constructor')?.value as Record<string, unknown> | null | undefined; return c && typeof c === 'object' ? { constructorId: String(c.constructorId ?? ''), currentPrice: num(c.currentPrice) } : null; })(),
          aceDriverId: typeof roster.aceDriverId === 'string' ? roster.aceDriverId : null,
        },
      };
    }).filter((s) => s.round > 0 && s.roster.drivers.length > 0).sort((a, b) => b.round - a.round).slice(0, limit);
    const rows = await Promise.all(snapshots.map(async (s) => {
      const [scores, prices] = await Promise.all([
        m.getDocs(m.query(m.collection(db, 'raceScores'), m.where('raceId', '==', s.raceId))),
        m.getDocs(m.query(m.collection(db, 'priceHistory'), m.where('raceId', '==', s.raceId))),
      ]);
      // the price that weekend is the one BEFORE the post-race move
      const priceAt = new Map<string, number>();
      for (const d of prices.docs) { const x = d.data() as Record<string, unknown>; if (typeof x.entityId === 'string') priceAt.set(x.entityId, num(x.previousPrice)); }
      const scored = scores.docs.map((d) => { const x = d.data() as Record<string, unknown>; return { id: String(x.entityId ?? ''), ctor: x.entityType === 'constructor', points: num(x.totalPoints) }; }).filter((x) => x.id);
      return hindsightRow(s, scored, (id) => priceAt.get(id));
    }));
    return rows.filter((r): r is HindsightRow => r !== null).sort((a, b) => a.round - b.round);
  } catch {
    return [];
  }
}
